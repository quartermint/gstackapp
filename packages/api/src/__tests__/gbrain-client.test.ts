/**
 * Tests for GbrainClient MCP wrapper.
 *
 * Mocks @modelcontextprotocol/sdk to test connection lifecycle,
 * tool calls, graceful degradation, and Zod schema validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import {
  gbrainSearchResultSchema,
  gbrainEntitySchema,
  gbrainRelatedSchema,
  gbrainCacheDataSchema,
} from '../gbrain/types'

// ── Mock MCP SDK ────────────────────────────────────────────────────────────

const mockConnect = vi.fn()
const mockCallTool = vi.fn()
const mockClose = vi.fn()

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    callTool: mockCallTool,
  })),
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    close: mockClose,
  })),
}))

// Import after mocks
import { GbrainClient } from '../gbrain/client'

describe('GbrainClient', () => {
  let client: GbrainClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new GbrainClient()
  })

  // ── Connection tests ────────────────────────────────────────────────────

  it('connect() returns true when transport succeeds', async () => {
    mockConnect.mockResolvedValueOnce(undefined)
    const result = await client.connect()
    expect(result).toBe(true)
    expect(client.isConnected).toBe(true)
  })

  it('connect() returns false when SSH connection fails', async () => {
    mockConnect.mockRejectedValueOnce(new Error('SSH connection refused'))
    const result = await client.connect()
    expect(result).toBe(false)
    expect(client.isConnected).toBe(false)
  })

  // ── Tool call tests ─────────────────────────────────────────────────────

  it('search() calls MCP callTool with name=query and returns parsed results', async () => {
    mockConnect.mockResolvedValueOnce(undefined)
    await client.connect()

    const searchData = [
      { slug: 'cocobanana', title: 'CocoBanana', type: 'project', excerpt: 'Fashion AI', score: 0.95 },
      { slug: 'openefb', title: 'OpenEFB', type: 'project', excerpt: 'Flight bag app', score: 0.8 },
    ]
    mockCallTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(searchData) }],
    })

    const results = await client.search('fashion AI project', 5)

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'query',
      arguments: { query: 'fashion AI project', limit: 5 },
    })
    expect(results).toHaveLength(2)
    expect(results[0].slug).toBe('cocobanana')
    expect(results[0].score).toBe(0.95)
  })

  it('getEntity() calls MCP callTool with name=get_page and fuzzy=true', async () => {
    mockConnect.mockResolvedValueOnce(undefined)
    await client.connect()

    const entityData = {
      slug: 'cocobanana',
      title: 'CocoBanana',
      type: 'project',
      content: 'Fashion AI design platform...',
      excerpt: 'Fashion AI platform using Next.js + FastAPI',
    }
    mockCallTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(entityData) }],
    })

    const result = await client.getEntity('cocobanana')

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'get_page',
      arguments: { slug: 'cocobanana', fuzzy: true },
    })
    expect(result).not.toBeNull()
    expect(result!.title).toBe('CocoBanana')
    expect(result!.content).toContain('Fashion AI')
  })

  it('getRelated() calls MCP callTool with name=traverse_graph', async () => {
    mockConnect.mockResolvedValueOnce(undefined)
    await client.connect()

    const relatedData = [
      { slug: 'ryan-stern', title: 'Ryan Stern', type: 'person', relationship: 'creator' },
      { slug: 'nexusclaw', title: 'NexusClaw', type: 'project', relationship: 'sibling' },
    ]
    mockCallTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(relatedData) }],
    })

    const results = await client.getRelated('cocobanana', 2)

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'traverse_graph',
      arguments: { slug: 'cocobanana', depth: 2 },
    })
    expect(results).toHaveLength(2)
    expect(results[0].relationship).toBe('creator')
  })

  // ── Graceful degradation ────────────────────────────────────────────────

  it('all methods return empty/null when not connected', async () => {
    expect(client.isConnected).toBe(false)
    expect(await client.search('test')).toEqual([])
    expect(await client.getEntity('test')).toBeNull()
    expect(await client.getRelated('test')).toEqual([])
  })

  // ── Disconnect ──────────────────────────────────────────────────────────

  it('disconnect() closes transport and sets connected=false', async () => {
    mockConnect.mockResolvedValueOnce(undefined)
    await client.connect()
    expect(client.isConnected).toBe(true)

    await client.disconnect()
    expect(mockClose).toHaveBeenCalled()
    expect(client.isConnected).toBe(false)
  })
})

// ── Zod schema validation tests ───────────────────────────────────────────

describe('Zod schemas', () => {
  it('gbrainSearchResultSchema validates well-formed data', () => {
    const valid = { slug: 'test', title: 'Test', type: 'project', excerpt: 'A test', score: 0.5 }
    expect(gbrainSearchResultSchema.parse(valid)).toEqual(valid)
  })

  it('gbrainSearchResultSchema accepts without optional score', () => {
    const valid = { slug: 'test', title: 'Test', type: 'project', excerpt: 'A test' }
    expect(gbrainSearchResultSchema.parse(valid)).toEqual(valid)
  })

  it('gbrainSearchResultSchema rejects malformed data', () => {
    expect(() => gbrainSearchResultSchema.parse({ slug: 123 })).toThrow()
    expect(() => gbrainSearchResultSchema.parse({})).toThrow()
    expect(() => gbrainSearchResultSchema.parse('not an object')).toThrow()
  })

  it('gbrainEntitySchema validates well-formed data', () => {
    const valid = { slug: 's', title: 'T', type: 'person', content: 'C', excerpt: 'E' }
    expect(gbrainEntitySchema.parse(valid)).toEqual(valid)
  })

  it('gbrainEntitySchema rejects missing fields', () => {
    expect(() => gbrainEntitySchema.parse({ slug: 's', title: 'T' })).toThrow()
  })

  it('gbrainCacheDataSchema validates available=false with no results', () => {
    const valid = { available: false }
    expect(gbrainCacheDataSchema.parse(valid)).toEqual(valid)
  })

  it('gbrainCacheDataSchema validates full cache data', () => {
    const valid = {
      available: true,
      searchResults: [{ slug: 's', title: 'T', type: 't', excerpt: 'e' }],
      entities: [{ slug: 's', title: 'T', type: 't', content: 'c', excerpt: 'e' }],
      fetchedAt: '2026-04-11T00:00:00Z',
    }
    expect(gbrainCacheDataSchema.parse(valid)).toEqual(valid)
  })
})
