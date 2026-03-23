import { createHash } from "node:crypto";
import { getLmStudioStatus } from "./lm-studio.js";
import type { LmStudioConfig } from "../lib/config.js";

const DEFAULT_LM_STUDIO_URL = "http://100.x.x.x:1234";
const EMBEDDING_MODEL = "text-embedding-nomic-embed-text-v1.5";
const TIMEOUT_MS = 10_000;

/** Module-level config cache, set via initEmbeddingService. */
let _config: LmStudioConfig | undefined;

/**
 * Initialize the embedding service with config.
 * Called once at server startup.
 */
export function initEmbeddingService(config?: LmStudioConfig): void {
  _config = config;
}

/**
 * Check whether embedding generation is available.
 * Requires LM Studio to be in "ready" state.
 */
export function isEmbeddingAvailable(): boolean {
  const status = getLmStudioStatus();
  return status.health === "ready";
}

/**
 * Compute a content-addressable SHA-256 hash for text content.
 * Normalizes line endings (CRLF -> LF) and trims whitespace
 * for cross-platform consistency.
 */
export function computeContentHash(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  return createHash("sha256").update(normalized, "utf-8").digest("hex");
}

/**
 * Convert a float array to a Buffer suitable for sqlite-vec insertion.
 */
export function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

interface EmbeddingResponse {
  data?: Array<{
    embedding?: number[];
  }>;
}

/**
 * Generate an embedding vector for the given text using LM Studio's
 * OpenAI-compatible /v1/embeddings endpoint.
 *
 * Returns null when LM Studio is unavailable (graceful degradation).
 * The caller should skip vector operations when null is returned.
 */
export async function generateEmbedding(
  text: string
): Promise<number[] | null> {
  if (!isEmbeddingAvailable()) {
    return null;
  }

  const url = _config?.url ?? DEFAULT_LM_STUDIO_URL;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${url}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as EmbeddingResponse;
    const embedding = body.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      return null;
    }

    return embedding;
  } catch {
    // Network error, timeout, parse error — all become null (graceful degradation)
    return null;
  }
}

/**
 * Get the expected embedding dimensions.
 * This should match the vec_search table definition.
 */
export function getEmbeddingDimensions(): number {
  return 768;
}

/**
 * Get the embedding model identifier for metadata tracking.
 */
export function getEmbeddingModel(): string {
  return EMBEDDING_MODEL;
}
