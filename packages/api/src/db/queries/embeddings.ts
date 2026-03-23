import type Database from "better-sqlite3";
import { vectorToBuffer } from "../../services/embedding.js";

export interface EmbeddingRecord {
  id: number;
  contentHash: string;
  sourceType: string;
  sourceId: string;
  model: string;
  dimensions: number;
  createdAt: string;
}

export interface VectorSearchResult {
  rowid: number;
  distance: number;
  contentHash: string;
  sourceType: string;
  sourceId: string;
}

/**
 * Upsert an embedding record and its vector into the two-table structure.
 * Uses INSERT OR IGNORE for content-addressable dedup — same content hash
 * always produces the same embedding, so we skip if already stored.
 *
 * Returns the embedding row ID (existing or new).
 */
export function upsertEmbedding(
  sqlite: Database.Database,
  data: {
    contentHash: string;
    sourceType: string;
    sourceId: string;
    embedding: number[];
    model: string;
    dimensions: number;
  }
): number {
  const now = new Date().toISOString();

  // Content-addressable: skip if hash already exists
  const info = sqlite
    .prepare(
      `INSERT OR IGNORE INTO embeddings(content_hash, source_type, source_id, model, dimensions, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.contentHash,
      data.sourceType,
      data.sourceId,
      data.model,
      data.dimensions,
      now
    );

  // Get the row ID (either newly inserted or existing)
  let rowId: number;
  if (info.changes > 0) {
    rowId = Number(info.lastInsertRowid);

    // Insert vector into vec_search (rowid must be bigint for sqlite-vec)
    const vecBuf = vectorToBuffer(data.embedding);
    sqlite
      .prepare("INSERT INTO vec_search(rowid, embedding) VALUES (?, ?)")
      .run(BigInt(rowId), vecBuf);
  } else {
    // Hash already existed — retrieve its ID
    const existing = sqlite
      .prepare("SELECT id FROM embeddings WHERE content_hash = ?")
      .get(data.contentHash) as { id: number } | undefined;
    rowId = existing?.id ?? 0;
  }

  return rowId;
}

/**
 * Get an embedding record by content hash.
 * Does NOT return the vector itself (use for metadata lookup).
 */
export function getEmbedding(
  sqlite: Database.Database,
  contentHash: string
): EmbeddingRecord | null {
  const row = sqlite
    .prepare(
      `SELECT id, content_hash, source_type, source_id, model, dimensions, created_at
       FROM embeddings WHERE content_hash = ?`
    )
    .get(contentHash) as
    | {
        id: number;
        content_hash: string;
        source_type: string;
        source_id: string;
        model: string;
        dimensions: number;
        created_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    contentHash: row.content_hash,
    sourceType: row.source_type,
    sourceId: row.source_id,
    model: row.model,
    dimensions: row.dimensions,
    createdAt: row.created_at,
  };
}

/**
 * Check if an embedding exists for a given content hash.
 * Fast check without loading the full record.
 */
export function hasEmbedding(
  sqlite: Database.Database,
  contentHash: string
): boolean {
  const row = sqlite
    .prepare("SELECT 1 FROM embeddings WHERE content_hash = ?")
    .get(contentHash) as { 1: number } | undefined;
  return row !== undefined;
}

/**
 * Search by vector using sqlite-vec KNN.
 *
 * Two-step pattern from qmd:
 * 1. Vector query first (no JOINs — sqlite-vec hangs with JOINs)
 * 2. Enrich with metadata second
 */
export function searchByVector(
  sqlite: Database.Database,
  queryVector: number[],
  limit: number = 20
): VectorSearchResult[] {
  const queryBuf = vectorToBuffer(queryVector);

  // Step 1: KNN query on vec_search (no JOINs)
  const vecResults = sqlite
    .prepare(
      "SELECT rowid, distance FROM vec_search WHERE embedding MATCH ? AND k = ?"
    )
    .all(queryBuf, limit) as Array<{
    rowid: number | bigint;
    distance: number;
  }>;

  if (vecResults.length === 0) return [];

  // Step 2: Enrich with metadata from embeddings table
  const rowids = vecResults.map((r) => Number(r.rowid));
  const placeholders = rowids.map(() => "?").join(",");
  const metaRows = sqlite
    .prepare(
      `SELECT id, content_hash, source_type, source_id
       FROM embeddings WHERE id IN (${placeholders})`
    )
    .all(...rowids) as Array<{
    id: number;
    content_hash: string;
    source_type: string;
    source_id: string;
  }>;

  // Build lookup map
  const metaMap = new Map(metaRows.map((r) => [r.id, r]));

  // Merge results preserving KNN distance ordering
  return vecResults
    .map((vr) => {
      const meta = metaMap.get(Number(vr.rowid));
      if (!meta) return null;
      return {
        rowid: Number(vr.rowid),
        distance: vr.distance,
        contentHash: meta.content_hash,
        sourceType: meta.source_type,
        sourceId: meta.source_id,
      };
    })
    .filter((r): r is VectorSearchResult => r !== null);
}

/**
 * Delete an embedding by content hash.
 * Removes from both the embeddings table and vec_search virtual table.
 */
export function deleteEmbedding(
  sqlite: Database.Database,
  contentHash: string
): boolean {
  // Get the row ID first
  const row = sqlite
    .prepare("SELECT id FROM embeddings WHERE content_hash = ?")
    .get(contentHash) as { id: number } | undefined;

  if (!row) return false;

  // Delete from vec_search first (foreign key ordering)
  sqlite
    .prepare("DELETE FROM vec_search WHERE rowid = ?")
    .run(BigInt(row.id));

  // Delete from embeddings
  sqlite
    .prepare("DELETE FROM embeddings WHERE content_hash = ?")
    .run(contentHash);

  return true;
}

/**
 * Count total embeddings in the database.
 */
export function countEmbeddings(sqlite: Database.Database): number {
  const row = sqlite
    .prepare("SELECT COUNT(*) AS count FROM embeddings")
    .get() as { count: number };
  return row.count;
}
