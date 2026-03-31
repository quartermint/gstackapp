import type { Finding } from '@gstackapp/shared'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GroupedFindings {
  critical: Finding[]
  notable: Finding[]
  minor: Finding[]
}

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Group findings into three severity tiers.
 * Returns { critical, notable, minor } arrays.
 */
export function groupFindingsBySeverity(findings: Finding[]): GroupedFindings {
  const result: GroupedFindings = {
    critical: [],
    notable: [],
    minor: [],
  }

  for (const finding of findings) {
    switch (finding.severity) {
      case 'critical':
        result.critical.push(finding)
        break
      case 'notable':
        result.notable.push(finding)
        break
      case 'minor':
        result.minor.push(finding)
        break
    }
  }

  return result
}

/**
 * Calculate signal ratio: proportion of actionable (critical + notable) findings.
 * Returns 1.0 for empty array (no findings = perfect signal).
 * Formula: (critical + notable count) / total count
 *
 * Per D-11: target signal ratio > 60%.
 */
export function calculateSignalRatio(findings: Finding[]): number {
  if (findings.length === 0) return 1.0

  const actionable = findings.filter(
    (f) => f.severity === 'critical' || f.severity === 'notable'
  ).length

  return actionable / findings.length
}

/**
 * Format signal ratio as human-readable string.
 * Example: "3/5 findings actionable (60%)"
 */
export function formatSignalRatio(findings: Finding[]): string {
  const total = findings.length
  const actionable = findings.filter(
    (f) => f.severity === 'critical' || f.severity === 'notable'
  ).length

  const percent = total === 0 ? 100 : Math.round((actionable / total) * 100)

  return `${actionable}/${total} findings actionable (${percent}%)`
}
