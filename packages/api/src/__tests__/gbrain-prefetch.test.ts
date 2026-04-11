/**
 * Tests for gbrain prefetch orchestrator and cache layer.
 *
 * Mocks GbrainClient and DB to test:
 * - Prefetch happy path (connected, search + entity detection)
 * - Prefetch degraded path (gbrain unavailable)
 * - Cache read/write operations
 * - Entity detection filtering and dedup
 * - Error handling (never throws)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTestDb, resetTestDb } from './helpers/test-db'

// ── Mock GbrainClient ─────────────────────────────────────────────────────

const mockConnect = vi.fn()
const mockSearch = vi.fn()
const mockGetEntity = vi.fn()
const mockDisconnect = vi.fn()

vi.mock('../gbrain/client', () => ({
  GbrainClient: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    search: mockSearch,
    getEntity: mockGetEntity,
    disconnect: mockDisconnect,
    get isConnected() { return mockConnect.mock.results.length > 0 && mockConnect.mock.results[mockConnect.mock.results.length - 1]?.value === true },
  })),
}))

// ── Import after mocks ────────────────────────────────────────────────────

import { prefetchGbrainContext, detectAndFetchEntities } from '../gbrain/prefetch'
import { cacheGbrainResult, getGbrainCache } from '../gbrain/cache'

// ── Test setup ────────────────────────────────────────────────────────────

const { db, pg } = getTestDb()

beforeEach(async () => {
  vi.clearAllMocks()
  await resetTestDb()

  // Create gbrain_cache table if not exists
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS gbrain_cache (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      available BOOLEAN NOT NULL,
      search_results TEXT,
      entities TEXT,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS gbrain_cache_request_idx ON gbrain_cache(request_id);
  `)
  await pg.exec('DELETE FROM gbrain_cache')

  // Seed a test user and operator request
  await pg.exec(`
    INSERT INTO users (id, email, role, source) VALUES ('user-1', 'test@test.com', 'operator', 'tailscale')
    ON CONFLICT (id) DO NOTHING
  `)
  await pg.exec(`
    INSERT INTO operator_requests (id, user_id, what_needed, what_good, status)
    VALUES ('req-1', 'user-1', 'Build a landing page', 'Fast load times', 'clarifying')
    ON CONFLICT (id) DO NOTHING
  `)
})

describe('prefetchGbrainContext', () => {
  it('connects, runs search + entity detection in parallel, caches with available=true', async () => {
    mockConnect.mockResolvedValueOnce(true)
    mockSearch.mockResolvedValueOnce([
      { slug: 'cocobanana', title: 'CocoBanana', type: 'project', excerpt: 'Fashion AI', score: 0.9 },
      { slug: 'openefb', title: 'OpenEFB', type: 'project', excerpt: 'Flight bag', score: 0.7 },
    ])
    // detectAndFetchEntities will also call search internally
    mockSearch.mockResolvedValueOnce([
      { slug: 'cocobanana', title: 'CocoBanana', type: 'project', excerpt: 'Fashion AI', score: 0.9 },
    ])
    mockGetEntity.mockResolvedValueOnce({
      slug: 'cocobanana', title: 'CocoBanana', type: 'project',
      content: 'Full content here', excerpt: 'Fashion AI platform',
    })

    await prefetchGbrainContext('req-1', 'Build a landing page', 'Fast load times')

    expect(mockConnect).toHaveBeenCalled()
    expect(mockDisconnect).toHaveBeenCalled()

    // Verify cache was written
    const cached = await getGbrainCache('req-1')
    expect(cached).not.toBeNull()
    expect(cached!.available).toBe(true)
    expect(cached!.searchResults).toBeDefined()
    expect(cached!.searchResults!.length).toBeGreaterThan(0)
  })

  it('stores available=false when GbrainClient.connect() returns false', async () => {
    mockConnect.mockResolvedValueOnce(false)

    await prefetchGbrainContext('req-1', 'Build a landing page', 'Fast load times')

    const cached = await getGbrainCache('req-1')
    expect(cached).not.toBeNull()
    expect(cached!.available).toBe(false)
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('catches errors and stores available=false (never throws)', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Network error'))

    // Should not throw
    await expect(
      prefetchGbrainContext('req-1', 'Build something', 'Quality')
    ).resolves.toBeUndefined()

    // Should have cached degraded result
    const cached = await getGbrainCache('req-1')
    expect(cached).not.toBeNull()
    expect(cached!.available).toBe(false)
  })
})

describe('cacheGbrainResult / getGbrainCache', () => {
  it('inserts into gbrain_cache with correct requestId and JSON data', async () => {
    await cacheGbrainResult('req-1', {
      available: true,
      searchResults: [{ slug: 'test', title: 'Test', type: 'project', excerpt: 'E' }],
      entities: [],
      fetchedAt: '2026-04-11T00:00:00Z',
    })

    const result = await pg.query('SELECT * FROM gbrain_cache WHERE request_id = $1', ['req-1'])
    expect(result.rows.length).toBe(1)
    expect(result.rows[0].available).toBe(true)
    expect(JSON.parse(result.rows[0].search_results as string)).toHaveLength(1)
  })

  it('retrieves cached data by requestId and parses JSON fields', async () => {
    await cacheGbrainResult('req-1', {
      available: true,
      searchResults: [{ slug: 'cb', title: 'CB', type: 'project', excerpt: 'X' }],
      entities: [{ slug: 'cb', title: 'CB', type: 'project', content: 'full', excerpt: 'X' }],
      fetchedAt: '2026-04-11T00:00:00Z',
    })

    const cached = await getGbrainCache('req-1')
    expect(cached).not.toBeNull()
    expect(cached!.available).toBe(true)
    expect(cached!.searchResults).toHaveLength(1)
    expect(cached!.searchResults![0].slug).toBe('cb')
    expect(cached!.entities).toHaveLength(1)
    expect(cached!.entities![0].content).toBe('full')
  })

  it('returns null for non-existent requestId', async () => {
    const cached = await getGbrainCache('non-existent')
    expect(cached).toBeNull()
  })
})

describe('detectAndFetchEntities', () => {
  it('searches request text, filters entity types, fetches up to 3 pages', async () => {
    // Create a mock client instance for this test
    const mockClient = {
      search: vi.fn().mockResolvedValueOnce([
        { slug: 'ryan-stern', title: 'Ryan Stern', type: 'person', excerpt: 'Founder' },
        { slug: 'cocobanana', title: 'CocoBanana', type: 'project', excerpt: 'Fashion AI' },
        { slug: 'landing-page-guide', title: 'Landing Pages', type: 'note', excerpt: 'How to build' },
        { slug: 'quartermint', title: 'Quartermint', type: 'company', excerpt: 'Holding co' },
        { slug: 'openefb', title: 'OpenEFB', type: 'project', excerpt: 'Flight bag' },
      ]),
      getEntity: vi.fn()
        .mockResolvedValueOnce({ slug: 'ryan-stern', title: 'Ryan Stern', type: 'person', content: 'Full bio', excerpt: 'Founder' })
        .mockResolvedValueOnce({ slug: 'cocobanana', title: 'CocoBanana', type: 'project', content: 'Fashion details', excerpt: 'Fashion AI' })
        .mockResolvedValueOnce({ slug: 'quartermint', title: 'Quartermint', type: 'company', content: 'Company info', excerpt: 'Holding co' }),
    }

    const entities = await detectAndFetchEntities(mockClient as any, 'Build a landing page for Ryan')

    // Should filter: 'note' type excluded, max 3 entities
    expect(entities).toHaveLength(3)
    expect(entities.map((e: any) => e.slug)).toEqual(['ryan-stern', 'cocobanana', 'quartermint'])
    // Should NOT fetch openefb (4th entity-type result, capped at 3)
    expect(mockClient.getEntity).toHaveBeenCalledTimes(3)
  })

  it('deduplicates slugs', async () => {
    const mockClient = {
      search: vi.fn().mockResolvedValueOnce([
        { slug: 'cocobanana', title: 'CocoBanana', type: 'project', excerpt: 'Fashion AI', score: 0.9 },
        { slug: 'cocobanana', title: 'CocoBanana v2', type: 'project', excerpt: 'Fashion AI v2', score: 0.7 },
      ]),
      getEntity: vi.fn()
        .mockResolvedValueOnce({ slug: 'cocobanana', title: 'CocoBanana', type: 'project', content: 'Full', excerpt: 'Fashion AI' }),
    }

    const entities = await detectAndFetchEntities(mockClient as any, 'CocoBanana work')

    expect(entities).toHaveLength(1)
    expect(mockClient.getEntity).toHaveBeenCalledTimes(1)
  })
})
