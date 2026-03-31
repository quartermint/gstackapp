import type { Stage, Verdict } from '@gstackapp/shared'
import { STAGE_COLORS, STAGE_LABELS } from '../../lib/constants'
import { VerdictBadge } from '../shared/VerdictBadge'
import { FindingCard } from './FindingCard'
import type { FindingData } from '../../hooks/usePipelineFeed'

interface FindingGroupProps {
  stage: Stage
  verdict: Verdict | 'RUNNING' | 'PENDING'
  summary: string | null
  findings: FindingData[]
}

/**
 * Stage-grouped findings container with spectral identity border.
 * Per D-11: findings are grouped under stage headers with the stage's
 * spectral identity color.
 */
export function FindingGroup({
  stage,
  verdict,
  summary,
  findings,
}: FindingGroupProps) {
  const stageColor = STAGE_COLORS[stage]

  return (
    <div
      className="border-l-2 pl-4 py-2 space-y-3"
      style={{ borderLeftColor: stageColor }}
    >
      {/* Stage header */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-primary font-medium">
          {STAGE_LABELS[stage]}
        </span>
        <VerdictBadge verdict={verdict} />
      </div>

      {/* Summary */}
      {summary && (
        <p className="font-body text-sm text-text-muted italic">{summary}</p>
      )}

      {/* Findings */}
      {findings.length > 0 ? (
        <div className="space-y-2">
          {findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      ) : (
        <p className="font-body text-sm text-text-muted">No findings</p>
      )}
    </div>
  )
}
