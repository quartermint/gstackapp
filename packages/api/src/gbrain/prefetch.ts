/**
 * Async prefetch orchestrator for gbrain knowledge context.
 *
 * Triggered at request submission (fire-and-forget). Connects to gbrain,
 * runs search + entity detection in parallel, caches results in Postgres.
 *
 * T-19-04: Prefetch is fire-and-forget; pipeline never blocks on gbrain.
 * GB-04: Connection failures result in available=false, never pipeline failures.
 */

import { GbrainClient } from './client'
import { cacheGbrainResult } from './cache'
import type { GbrainEntity } from './types'

/**
 * Prefetch gbrain context for an operator request.
 *
 * - Connects to gbrain MCP server via SSH
 * - Runs search and entity detection in parallel
 * - Caches results (or available=false on failure)
 * - NEVER throws — all errors result in degraded cache entry
 */
export async function prefetchGbrainContext(
  requestId: string,
  whatNeeded: string,
  whatGood: string,
): Promise<void> {
  const client = new GbrainClient()

  try {
    const connected = await client.connect()

    if (!connected) {
      await cacheGbrainResult(requestId, { available: false })
      return
    }

    // Parallel queries: search + entity detection
    const [searchSettled, entitiesSettled] = await Promise.allSettled([
      client.search(`${whatNeeded} ${whatGood}`, 10),
      detectAndFetchEntities(client, whatNeeded),
    ])

    const searchResults = searchSettled.status === 'fulfilled' ? searchSettled.value : []
    const entities = entitiesSettled.status === 'fulfilled' ? entitiesSettled.value : []

    await cacheGbrainResult(requestId, {
      available: true,
      searchResults,
      entities,
      fetchedAt: new Date().toISOString(),
    })
  } catch {
    // GB-04: Never throw — cache degraded result
    try {
      await cacheGbrainResult(requestId, { available: false })
    } catch {
      // Even caching failed — log and move on
      console.warn(`[gbrain] failed to cache degraded result for ${requestId}`)
    }
  } finally {
    try {
      await client.disconnect()
    } catch {
      // Disconnect failure is non-critical
    }
  }
}

/**
 * Detect entities in request text by searching gbrain and fetching entity pages.
 *
 * Filters for entity-type results (person, project, company, organization),
 * deduplicates by slug, and fetches up to 3 full entity pages.
 */
export async function detectAndFetchEntities(
  client: GbrainClient,
  requestText: string,
): Promise<GbrainEntity[]> {
  const searchResults = await client.search(requestText, 5)

  // Filter for entity types and deduplicate slugs
  const entityTypes = ['person', 'project', 'company', 'organization']
  const seen = new Set<string>()
  const entitySlugs: string[] = []

  for (const result of searchResults) {
    if (entityTypes.includes(result.type) && !seen.has(result.slug)) {
      seen.add(result.slug)
      entitySlugs.push(result.slug)
      if (entitySlugs.length >= 3) break // max 3 entities per request
    }
  }

  // Fetch full entity pages in parallel
  const entityResults = await Promise.all(
    entitySlugs.map(slug => client.getEntity(slug)),
  )

  return entityResults.filter((e): e is GbrainEntity => e !== null)
}
