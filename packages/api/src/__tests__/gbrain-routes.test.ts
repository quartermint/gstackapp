/**
 * Tests for gbrain REST API routes.
 *
 * Since GbrainClient connects via SSH to Mac Mini (unavailable in test env),
 * we mock the client to test both available and unavailable scenarios.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock GbrainClient ──────────────────────────────────────────────────────

const mockConnect = vi.fn()
const mockSearch = vi.fn()
const mockGetEntity = vi.fn()
const mockGetRelated = vi.fn()
const mockDisconnect = vi.fn()

vi.mock('../gbrain/client', () => ({
  GbrainClient: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    search: mockSearch,
    getEntity: mockGetEntity,
    getRelated: mockGetRelated,
    disconnect: mockDisconnect,
  })),
}))

// Mock db/client (not used by gbrain routes, but needed if index imports it)
vi.mock('../db/client', () => ({
  db: {},
  rawSql: vi.fn(),
}))

// Mock db/reconcile to prevent startup side effects
vi.mock('../db/reconcile', () => ({
  reconcileStaleRuns: vi.fn(),
}))

// Mock voyageai
vi.mock('voyageai', () => ({
  VoyageAIClient: vi.fn(),
}))

import gbrainApp from '../routes/gbrain'

describe('Gbrain Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDisconnect.mockResolvedValue(undefined)
  })

  // ── Search ────────────────────────────────────────────────────────────────

  describe('GET /search', () => {
    it('returns results when gbrain is available', async () => {
      mockConnect.mockResolvedValueOnce(true)
      const searchResults = [
        { slug: 'cocobanana', title: 'CocoBanana', type: 'project', excerpt: 'Fashion AI', score: 0.95 },
      ]
      mockSearch.mockResolvedValueOnce(searchResults)

      const res = await gbrainApp.request('/search?q=fashion&limit=5')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.available).toBe(true)
      expect(body.results).toHaveLength(1)
      expect(body.results[0].slug).toBe('cocobanana')
    })

    it('returns available=false when gbrain cannot connect', async () => {
      mockConnect.mockResolvedValueOnce(false)

      const res = await gbrainApp.request('/search?q=test')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.available).toBe(false)
      expect(body.results).toEqual([])
    })

    it('returns available=false when gbrain throws', async () => {
      mockConnect.mockRejectedValueOnce(new Error('SSH failed'))

      const res = await gbrainApp.request('/search?q=test')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.available).toBe(false)
      expect(body.results).toEqual([])
    })

    it('returns 400 when q param is missing', async () => {
      const res = await gbrainApp.request('/search')
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('Invalid')
    })

    it('returns 400 when q param is empty', async () => {
      const res = await gbrainApp.request('/search?q=')
      expect(res.status).toBe(400)
    })

    it('always calls disconnect in finally block', async () => {
      mockConnect.mockResolvedValueOnce(true)
      mockSearch.mockResolvedValueOnce([])

      await gbrainApp.request('/search?q=test')
      expect(mockDisconnect).toHaveBeenCalled()
    })
  })

  // ── Entity ────────────────────────────────────────────────────────────────

  describe('GET /entity/:slug', () => {
    it('returns entity when available', async () => {
      mockConnect.mockResolvedValueOnce(true)
      const entity = { slug: 'test', title: 'Test', type: 'project', content: 'Content', excerpt: 'Exc' }
      mockGetEntity.mockResolvedValueOnce(entity)

      const res = await gbrainApp.request('/entity/test')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.available).toBe(true)
      expect(body.entity.slug).toBe('test')
    })

    it('returns available=false when gbrain cannot connect', async () => {
      mockConnect.mockResolvedValueOnce(false)

      const res = await gbrainApp.request('/entity/test-slug')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.available).toBe(false)
      expect(body.entity).toBeNull()
    })
  })

  // ── Related ───────────────────────────────────────────────────────────────

  describe('GET /related/:slug', () => {
    it('returns related entities when available', async () => {
      mockConnect.mockResolvedValueOnce(true)
      const related = [
        { slug: 'ryan', title: 'Ryan', type: 'person', relationship: 'creator' },
      ]
      mockGetRelated.mockResolvedValueOnce(related)

      const res = await gbrainApp.request('/related/cocobanana')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.available).toBe(true)
      expect(body.related).toHaveLength(1)
    })

    it('returns available=false when gbrain cannot connect', async () => {
      mockConnect.mockResolvedValueOnce(false)

      const res = await gbrainApp.request('/related/test-slug')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.available).toBe(false)
      expect(body.related).toEqual([])
    })
  })
})
