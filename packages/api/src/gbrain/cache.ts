/**
 * Postgres cache read/write for gbrain prefetch results.
 *
 * Stores gbrain search results and entity data per operator request,
 * keyed by request ID. JSON serialization for complex fields.
 */

import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/client'
import { gbrainCache } from '../db/schema'
import type { GbrainCacheData } from './types'

/**
 * Cache gbrain prefetch results for a given request.
 * Serializes searchResults and entities as JSON strings.
 */
export async function cacheGbrainResult(
  requestId: string,
  data: GbrainCacheData,
): Promise<void> {
  await db.insert(gbrainCache).values({
    id: nanoid(),
    requestId,
    available: data.available,
    searchResults: data.searchResults ? JSON.stringify(data.searchResults) : null,
    entities: data.entities ? JSON.stringify(data.entities) : null,
  }).onConflictDoUpdate({
    target: gbrainCache.requestId,
    set: {
      available: data.available,
      searchResults: data.searchResults ? JSON.stringify(data.searchResults) : null,
      entities: data.entities ? JSON.stringify(data.entities) : null,
      fetchedAt: new Date(),
    },
  })
}

/**
 * Retrieve cached gbrain data for a request.
 * Parses JSON strings back to typed arrays.
 * Returns null if no cache entry exists.
 */
export async function getGbrainCache(
  requestId: string,
): Promise<GbrainCacheData | null> {
  const [row] = await db.select()
    .from(gbrainCache)
    .where(eq(gbrainCache.requestId, requestId))
    .limit(1)

  if (!row) return null

  return {
    available: row.available,
    searchResults: row.searchResults ? JSON.parse(row.searchResults) : undefined,
    entities: row.entities ? JSON.parse(row.entities) : undefined,
    fetchedAt: row.fetchedAt?.toISOString(),
  }
}
