/**
 * Cross-repo similarity search using pgvector cosine distance.
 *
 * Finds similar findings from OTHER repos (excludes current repo),
 * applies cosine similarity threshold, and filters out false positives
 * (feedbackVote = 'down') via subquery JOIN to the findings table.
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CrossRepoMatch {
  finding_id: string
  title: string
  description: string
  file_path: string | null
  repo_full_name: string
  distance: number
  stage: string
  severity: string
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Find cross-repo matches for a query embedding using cosine distance.
 *
 * - Excludes findings from the current repo
 * - Filters by cosine similarity threshold (distance <= 1 - threshold)
 * - Excludes findings with feedbackVote='down' (false positives)
 */
export async function findCrossRepoMatches(
  sql: NeonQueryFunction<false, false>,
  queryEmbedding: Float32Array,
  currentRepo: string,
  threshold: number = 0.85,
  k: number = 5
): Promise<CrossRepoMatch[]> {
  const maxDistance = 1 - threshold
  const vecStr = `[${Array.from(queryEmbedding).join(',')}]`

  const results = await sql`
    SELECT fe.finding_id, fe.title, fe.description, fe.file_path,
           fe.repo_full_name, fe.stage, fe.severity,
           (fe.embedding <=> ${vecStr}::vector) AS distance
    FROM finding_embeddings fe
    WHERE fe.repo_full_name != ${currentRepo}
      AND NOT EXISTS (
        SELECT 1 FROM findings f
        WHERE f.id = fe.finding_id AND f.feedback_vote = 'down'
      )
    ORDER BY fe.embedding <=> ${vecStr}::vector
    LIMIT ${k}
  ` as CrossRepoMatch[]

  return results.filter((r) => r.distance <= maxDistance)
}
