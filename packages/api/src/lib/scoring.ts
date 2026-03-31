/**
 * Quality scoring function for pipeline findings.
 *
 * Per D-05: Severity weights — critical: 3, notable: 1, minor: 0
 * Per D-06: score = 100 - (weighted_sum / normalization_factor) * 100
 * Normalization factor = max(10, total_findings_count)
 * Result clamped to [0, 100] and rounded to integer.
 */

export const SEVERITY_WEIGHTS = {
  critical: 3,
  notable: 1,
  minor: 0,
} as const

export interface FindingCounts {
  critical: number
  notable: number
  minor: number
}

export function calculateQualityScore(counts: FindingCounts): number {
  const { critical, notable, minor } = counts
  const totalFindings = critical + notable + minor

  // No findings = perfect score
  if (totalFindings === 0) return 100

  const weightedSum =
    critical * SEVERITY_WEIGHTS.critical +
    notable * SEVERITY_WEIGHTS.notable +
    minor * SEVERITY_WEIGHTS.minor

  const normalizationFactor = Math.max(10, totalFindings)

  const score = 100 - (weightedSum / normalizationFactor) * 100

  return Math.round(Math.max(0, Math.min(100, score)))
}
