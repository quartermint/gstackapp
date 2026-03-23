/**
 * Reciprocal Rank Fusion (RRF) implementation per D-04.
 * Combines ranked lists from BM25 and vector search into a single fused ranking.
 * Formula: score = sum(weight / (k + rank + 1))
 * k=60 (standard from original RRF paper)
 * Original query gets 2x weight per D-04.
 */

export interface FusionCandidate {
  contentHash: string;
  rank: number; // 0-indexed position in the ranked list
  weight: number; // 2.0 for original query, 1.0 for expanded
}

export const RRF_K = 60;

/**
 * Compute fused RRF scores from multiple ranked lists.
 * Each list is independently ranked (0-indexed).
 * Returns a Map of contentHash -> fused score.
 */
export function fuseResults(
  rankedLists: FusionCandidate[][]
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const list of rankedLists) {
    for (const item of list) {
      const current = scores.get(item.contentHash) ?? 0;
      scores.set(
        item.contentHash,
        current + item.weight / (RRF_K + item.rank + 1)
      );
    }
  }

  return scores;
}

/**
 * Sort content hashes by descending fused score.
 * Returns ordered array of content hashes.
 */
export function rankByFusion(scores: Map<string, number>): string[] {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hash]) => hash);
}
