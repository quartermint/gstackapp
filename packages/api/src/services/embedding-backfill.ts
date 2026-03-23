import type Database from "better-sqlite3";
import {
  generateEmbedding,
  computeContentHash,
  isEmbeddingAvailable,
  getEmbeddingModel,
  getEmbeddingDimensions,
} from "./embedding.js";
import { upsertEmbedding, hasEmbedding } from "../db/queries/embeddings.js";
import { eventBus } from "./event-bus.js";

/** Maximum items to process per backfill cycle. */
const BATCH_SIZE = 50;

export interface BackfillProgress {
  total: number;
  processed: number;
  skipped: number;
  embedded: number;
  errors: number;
}

/**
 * Backfill embeddings for existing search_index content.
 *
 * Scans the FTS5 search_index for entries that don't have corresponding
 * embeddings in the embeddings table. Processes up to BATCH_SIZE items
 * per cycle, generating embeddings via LM Studio.
 *
 * Emits SSE progress events via the event bus for dashboard visibility.
 * Returns a progress summary.
 */
export async function backfillEmbeddings(
  sqlite: Database.Database
): Promise<BackfillProgress> {
  const progress: BackfillProgress = {
    total: 0,
    processed: 0,
    skipped: 0,
    embedded: 0,
    errors: 0,
  };

  if (!isEmbeddingAvailable()) {
    return progress;
  }

  // Get all search_index entries — two-column retrieval
  // (content stored in FTS5 is not directly queryable for content_hash,
  //  so we compute it on the fly)
  const rows = sqlite
    .prepare(
      `SELECT content, source_type, source_id
       FROM search_index
       LIMIT ?`
    )
    .all(BATCH_SIZE * 3) as Array<{
    content: string;
    source_type: string;
    source_id: string;
  }>;

  progress.total = rows.length;

  const model = getEmbeddingModel();
  const dimensions = getEmbeddingDimensions();

  for (const row of rows) {
    const contentHash = computeContentHash(row.content);

    // Skip if already embedded (content-addressable dedup)
    if (hasEmbedding(sqlite, contentHash)) {
      progress.skipped++;
      progress.processed++;
      continue;
    }

    // Generate embedding via LM Studio
    const embedding = await generateEmbedding(row.content);

    if (embedding) {
      upsertEmbedding(sqlite, {
        contentHash,
        sourceType: row.source_type,
        sourceId: row.source_id,
        embedding,
        model,
        dimensions,
      });
      progress.embedded++;
    } else {
      progress.errors++;
    }

    progress.processed++;

    // Cap at BATCH_SIZE actual embedding operations per cycle
    if (progress.embedded >= BATCH_SIZE) {
      break;
    }
  }

  // Emit progress event for SSE subscribers
  eventBus.emit("mc:event", {
    type: "embedding:backfill",
    id: `backfill-${Date.now()}`,
    data: { progress },
  });

  return progress;
}

/**
 * Queue an async embedding for a single piece of content.
 * Uses queueMicrotask (same pattern as enrichment.ts) for fire-and-forget.
 *
 * Silently skips if:
 * - LM Studio is unavailable
 * - Content already has an embedding (content-addressable dedup)
 */
export function queueEmbedding(
  sqlite: Database.Database,
  content: string,
  sourceType: string,
  sourceId: string
): void {
  queueMicrotask(async () => {
    try {
      if (!isEmbeddingAvailable()) return;

      const contentHash = computeContentHash(content);
      if (hasEmbedding(sqlite, contentHash)) return;

      const embedding = await generateEmbedding(content);
      if (!embedding) return;

      upsertEmbedding(sqlite, {
        contentHash,
        sourceType,
        sourceId,
        embedding,
        model: getEmbeddingModel(),
        dimensions: getEmbeddingDimensions(),
      });
    } catch {
      // Silently ignore errors in async embedding generation
      // Content is still searchable via BM25 without vectors
    }
  });
}
