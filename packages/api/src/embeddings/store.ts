/**
 * sqlite-vec vec0 virtual table operations for finding embeddings.
 *
 * Manages the vec_findings virtual table: creation, single insert, and
 * batch insert in a transaction. Uses Float32Array.buffer for proper
 * binary BLOB binding (Pitfall 5).
 */

import type { Database as DatabaseType } from 'better-sqlite3'

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmbeddingMetadata {
  repoFullName: string
  stage: string
  severity: string
  title: string
  description: string
  filePath: string | null
}

export interface EmbeddingItem {
  findingId: string
  embedding: Float32Array
  metadata: EmbeddingMetadata
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create the vec_findings virtual table if it doesn't exist.
 * Must be called after sqliteVec.load() has loaded the extension.
 */
export function initVecTable(db: DatabaseType): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_findings USING vec0(
      finding_id TEXT PRIMARY KEY,
      embedding float[1024] distance_metric=cosine,
      repo_full_name TEXT,
      stage TEXT,
      severity TEXT,
      +title TEXT,
      +description TEXT,
      +file_path TEXT
    );
  `)
}

/**
 * Insert a single finding embedding into the vec0 table.
 * CRITICAL: passes embedding as Uint8Array wrapping the buffer, not the Float32Array itself.
 */
export function insertFindingEmbedding(
  db: DatabaseType,
  findingId: string,
  embedding: Float32Array,
  metadata: EmbeddingMetadata
): void {
  const stmt = db.prepare(`
    INSERT INTO vec_findings(
      finding_id, embedding, repo_full_name, stage, severity,
      title, description, file_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    findingId,
    new Uint8Array(embedding.buffer),
    metadata.repoFullName,
    metadata.stage,
    metadata.severity,
    metadata.title,
    metadata.description,
    metadata.filePath
  )
}

/**
 * Batch insert finding embeddings in a single transaction.
 */
export function insertFindingEmbeddings(
  db: DatabaseType,
  items: EmbeddingItem[]
): void {
  const stmt = db.prepare(`
    INSERT INTO vec_findings(
      finding_id, embedding, repo_full_name, stage, severity,
      title, description, file_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertAll = db.transaction(() => {
    for (const item of items) {
      stmt.run(
        item.findingId,
        new Uint8Array(item.embedding.buffer),
        item.metadata.repoFullName,
        item.metadata.stage,
        item.metadata.severity,
        item.metadata.title,
        item.metadata.description,
        item.metadata.filePath
      )
    }
  })

  insertAll()
}
