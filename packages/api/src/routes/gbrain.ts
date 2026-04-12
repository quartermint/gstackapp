/**
 * Gbrain REST API routes — wraps GbrainClient MCP for frontend consumption.
 *
 * All endpoints degrade gracefully when gbrain MCP server is unavailable:
 * - Returns { available: false } instead of erroring
 * - Each request creates/destroys its own SSH connection
 *
 * T-20-06: Query param validated (min 1, max 500 chars)
 * T-20-07: Slug length capped at 200 chars
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { GbrainClient } from '../gbrain/client'

const gbrainApp = new Hono()

const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  limit: z.coerce.number().min(1).max(50).optional().default(10),
})

// GET /api/gbrain/search?q=query&limit=10
gbrainApp.get('/search', async (c) => {
  const raw = { q: c.req.query('q'), limit: c.req.query('limit') }
  const parsed = searchQuerySchema.safeParse(raw)
  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, 400)
  }
  const { q, limit } = parsed.data
  const client = new GbrainClient()
  try {
    const connected = await client.connect()
    if (!connected) return c.json({ results: [], available: false })
    const results = await client.search(q, limit)
    return c.json({ results, available: true })
  } catch {
    return c.json({ results: [], available: false })
  } finally {
    await client.disconnect().catch(() => {})
  }
})

// GET /api/gbrain/entity/:slug
gbrainApp.get('/entity/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!slug || slug.length > 200) return c.json({ entity: null, available: false })
  const client = new GbrainClient()
  try {
    const connected = await client.connect()
    if (!connected) return c.json({ entity: null, available: false })
    const entity = await client.getEntity(slug)
    return c.json({ entity, available: true })
  } catch {
    return c.json({ entity: null, available: false })
  } finally {
    await client.disconnect().catch(() => {})
  }
})

// GET /api/gbrain/related/:slug
gbrainApp.get('/related/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!slug || slug.length > 200) return c.json({ related: [], available: false })
  const client = new GbrainClient()
  try {
    const connected = await client.connect()
    if (!connected) return c.json({ related: [], available: false })
    const related = await client.getRelated(slug, 2)
    return c.json({ related, available: true })
  } catch {
    return c.json({ related: [], available: false })
  } finally {
    await client.disconnect().catch(() => {})
  }
})

export default gbrainApp
