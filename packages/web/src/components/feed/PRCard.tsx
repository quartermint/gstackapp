import type { Stage, Verdict } from '@gstackapp/shared'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '../../lib/cn'
import { STAGE_COLORS, VERDICT_COLORS } from '../../lib/constants'
import type { PipelineListItem } from '../../hooks/usePipelineFeed'

const STAGE_ORDER: Stage[] = ['ceo', 'eng', 'design', 'qa', 'security']

interface PRCardProps {
  pipeline: PipelineListItem
  isSelected: boolean
  onClick: () => void
}

/**
 * Dense PR card with 5 verdict dots, repo name, PR title, and relative time.
 * Per D-08: Linear-style density — tight vertical spacing, no excess padding.
 */
export function PRCard({ pipeline, isSelected, onClick }: PRCardProps) {
  const stageMap = new Map(
    pipeline.stages.map((s) => [s.stage, s.verdict])
  )

  const timeAgo = formatDistanceToNow(new Date(pipeline.createdAt), {
    addSuffix: true,
  })

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer transition-colors duration-150 text-left',
        'bg-surface hover:bg-surface-hover',
        isSelected && 'border-l-2 border-l-accent bg-accent-dim'
      )}
    >
      {/* Verdict dots */}
      <div className="flex items-center gap-1 shrink-0">
        {STAGE_ORDER.map((stage) => {
          const verdict = stageMap.get(stage)
          return (
            <VerdictDot key={stage} stage={stage} verdict={verdict ?? null} />
          )
        })}
      </div>

      {/* Type badge + Repo + title */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'inline-flex items-center px-1 py-0.5 rounded text-[9px] font-mono font-medium uppercase tracking-wider',
            pipeline.reviewUnit.type === 'push'
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-blue-500/15 text-blue-400'
          )}>
            {pipeline.reviewUnit.type === 'push' ? 'Push' : 'PR'}
          </span>
          <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
            {pipeline.repo.fullName}
          </span>
        </div>
        <span className="font-body text-sm text-text-primary truncate">
          {pipeline.reviewUnit.title}
          {pipeline.reviewUnit.type === 'pr' && pipeline.reviewUnit.prNumber && (
            <span className="text-text-muted"> #{pipeline.reviewUnit.prNumber}</span>
          )}
        </span>
      </div>

      {/* Time ago */}
      <span className="text-text-muted text-[12px] font-body shrink-0">
        {timeAgo}
      </span>
    </button>
  )
}

/**
 * Single verdict dot for a pipeline stage.
 * Colors by stage spectral identity. Dims if PENDING, uses verdict color
 * for PASS/FLAG/BLOCK/SKIP, uses RUNNING color if currently executing.
 */
function VerdictDot({
  stage,
  verdict,
}: {
  stage: Stage
  verdict: string | null
}) {
  // Determine dot color and opacity
  const isPending = !verdict || verdict === 'PENDING'
  const isRunning = verdict === 'RUNNING'

  let color: string
  if (isPending) {
    color = STAGE_COLORS[stage]
  } else if (isRunning) {
    color = VERDICT_COLORS.RUNNING
  } else {
    color = VERDICT_COLORS[verdict as Verdict] ?? STAGE_COLORS[stage]
  }

  return (
    <span
      className={cn('inline-block w-2 h-2 rounded-full', isPending && 'opacity-30')}
      style={{ backgroundColor: color }}
      aria-label={`${stage}: ${verdict ?? 'pending'}`}
    />
  )
}
