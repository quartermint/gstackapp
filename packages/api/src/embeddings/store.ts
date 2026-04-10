/**
 * pgvector-backed finding embeddings storage.
 *
 * Manages the finding_embeddings table with vector similarity search.
 * Uses Neon's SQL tagged template for raw vector operations.
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'

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
 * Ensure pgvector extension and finding_embeddings table exist.
 * Safe to call multiple times (IF NOT EXISTS).
 */
export async function initVecTable(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`
  await sql`
    CREATE TABLE IF NOT EXISTS finding_embeddings (
      finding_id TEXT PRIMARY KEY,
      repo_full_name TEXT NOT NULL,
      stage TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      file_path TEXT,
      embedding vector(1024) NOT NULL
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS fe_repo_idx ON finding_embeddings(repo_full_name)`
}

/**
 * Insert a single finding embedding.
 */
export async function insertFindingEmbedding(
  sql: NeonQueryFunction<false, false>,
  findingId: string,
  embedding: Float32Array,
  metadata: EmbeddingMetadata
): Promise<void> {
  const vecStr = `[${Array.from(embedding).join(',')}]`
  await sql`
    INSERT INTO finding_embeddings (
      finding_id, embedding, repo_full_name, stage, severity,
      title, description, file_path
    ) VALUES (
      ${findingId}, ${vecStr}::vector, ${metadata.repoFullName}, ${metadata.stage},
      ${metadata.severity}, ${metadata.title}, ${metadata.description}, ${metadata.filePath}
    )
    ON CONFLICT (finding_id) DO UPDATE SET embedding = EXCLUDED.embedding
  `
}

/**
 * Batch insert finding embeddings.
 */
export async function insertFindingEmbeddings(
  sql: NeonQueryFunction<false, false>,
  items: EmbeddingItem[]
): Promise<void> {
  for (const item of items) {
    await insertFindingEmbedding(sql, item.findingId, item.embedding, item.metadata)
  }
}
