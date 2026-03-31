/**
 * Voyage AI client singleton for embedding generation.
 *
 * Follows the same module-level singleton pattern as the Anthropic client
 * in stage-runner.ts. If VOYAGE_API_KEY is not set, exports null for
 * graceful degradation in dev/test environments.
 */

import { VoyageAIClient } from 'voyageai'
import { config } from '../lib/config'

export const EMBEDDING_MODEL = 'voyage-code-3'
export const EMBEDDING_DIMENSIONS = 1024

/**
 * Voyage AI client instance. Null when VOYAGE_API_KEY is not configured,
 * enabling graceful degradation (embeddings skipped, not errored).
 */
export const voyage: VoyageAIClient | null = config.voyageApiKey
  ? new VoyageAIClient({ apiKey: config.voyageApiKey })
  : null
