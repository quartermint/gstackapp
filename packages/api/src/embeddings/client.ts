/**
 * Voyage AI client singleton for embedding generation.
 *
 * Follows the same module-level singleton pattern as the Anthropic client
 * in stage-runner.ts. If VOYAGE_API_KEY is not set, exports null for
 * graceful degradation in dev/test environments.
 */

import { config } from '../lib/config'

export const EMBEDDING_MODEL = 'voyage-code-3'
export const EMBEDDING_DIMENSIONS = 1024

/**
 * Voyage AI client instance (lazy-loaded to avoid ESM import crash).
 * Returns null when VOYAGE_API_KEY is not configured,
 * enabling graceful degradation (embeddings skipped, not errored).
 */
let _voyage: any | null = undefined

export async function getVoyageClient(): Promise<any | null> {
  if (_voyage !== undefined) return _voyage
  if (!config.voyageApiKey) {
    _voyage = null
    return null
  }
  try {
    const { VoyageAIClient } = await import('voyageai')
    _voyage = new VoyageAIClient({ apiKey: config.voyageApiKey })
  } catch {
    _voyage = null
  }
  return _voyage
}

/** Reset the cached client. Pass `null` to force null state (for testing no-API-key scenarios). */
export function resetVoyageClient(value?: null): void {
  _voyage = value === null ? null : undefined
}
