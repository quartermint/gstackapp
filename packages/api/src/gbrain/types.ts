/**
 * Zod schemas and TypeScript types for gbrain MCP server responses.
 *
 * T-19-01: All gbrain responses validated with Zod to mitigate tampering.
 */

import { z } from 'zod'

// ── Search result (from gbrain `query` tool) ────────────────────────────────

export const gbrainSearchResultSchema = z.object({
  slug: z.string(),
  title: z.string(),
  type: z.string(),
  excerpt: z.string(),
  score: z.number().optional(),
})

export type GbrainSearchResult = z.infer<typeof gbrainSearchResultSchema>

// ── Entity (from gbrain `get_page` tool) ────────────────────────────────────

export const gbrainEntitySchema = z.object({
  slug: z.string(),
  title: z.string(),
  type: z.string(),
  content: z.string(),
  excerpt: z.string(),
})

export type GbrainEntity = z.infer<typeof gbrainEntitySchema>

// ── Related pages (from gbrain `traverse_graph` tool) ───────────────────────

export const gbrainRelatedSchema = z.object({
  slug: z.string(),
  title: z.string(),
  type: z.string(),
  relationship: z.string(),
})

export type GbrainRelated = z.infer<typeof gbrainRelatedSchema>

// ── Cache data (stored in gbrain_cache table) ───────────────────────────────

export const gbrainCacheDataSchema = z.object({
  available: z.boolean(),
  searchResults: z.array(gbrainSearchResultSchema).optional(),
  entities: z.array(gbrainEntitySchema).optional(),
  fetchedAt: z.string().optional(),
})

export type GbrainCacheData = z.infer<typeof gbrainCacheDataSchema>
