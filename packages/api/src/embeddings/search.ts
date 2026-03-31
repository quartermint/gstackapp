/**
 * Cross-repo similarity search using sqlite-vec KNN queries.
 *
 * Finds similar findings from OTHER repos (excludes current repo),
 * applies cosine similarity threshold, and filters out false positives
 * (feedbackVote = 'down') via post-query JOIN to the findings table.
 */

import type { Database as DatabaseType } from 'better-sqlite3'

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
 * Find cross-repo matches for a query embedding using KNN search.
 *
 * - Excludes findings from the current repo (repo_full_name != currentRepo)
 * - Filters by cosine similarity threshold (distance <= 1 - threshold)
 * - Excludes findings with feedbackVote='down' (false positives) via JOIN
 *
 * @param db - Raw better-sqlite3 database instance
 * @param queryEmbedding - The query vector (Float32Array, 1024 dims)
 * @param currentRepo - Current repo full name to exclude (owner/repo)
 * @param threshold - Minimum cosine similarity (default 0.85)
 * @param k - Maximum number of KNN results (default 5)
 */
export function findCrossRepoMatches(
  db: DatabaseType,
  queryEmbedding: Float32Array,
  currentRepo: string,
  threshold: number = 0.85,
  k: number = 5
): CrossRepoMatch[] {
  const stmt = db.prepare(`
    SELECT finding_id, title, description, file_path,
           repo_full_name, distance, stage, severity
    FROM vec_findings
    WHERE embedding MATCH ?
      AND k = ?
      AND repo_full_name != ?
  `)

  const results = stmt.all(
    new Uint8Array(queryEmbedding.buffer),
    k,
    currentRepo
  ) as CrossRepoMatch[]

  // Post-query filter: cosine distance threshold
  // Cosine distance: 0 = identical, 2 = opposite
  // Cosine similarity = 1 - cosine_distance
  // threshold 0.85 means distance <= 0.15
  const maxDistance = 1 - threshold

  const filtered = results.filter((r) => r.distance <= maxDistance)

  // Post-query filter: exclude findings with feedbackVote='down' (false positives)
  // This is a post-query filter because feedbackVote can change after embedding
  if (filtered.length === 0) return filtered

  const findingIds = filtered.map((r) => r.finding_id)
  const placeholders = findingIds.map(() => '?').join(',')
  const falsePositives = db.prepare(`
    SELECT id FROM findings
    WHERE id IN (${placeholders})
      AND feedback_vote = 'down'
  `).all(...findingIds) as { id: string }[]

  const falsePositiveIds = new Set(falsePositives.map((fp) => fp.id))

  return filtered.filter((r) => !falsePositiveIds.has(r.finding_id))
}
