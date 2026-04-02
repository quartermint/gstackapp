import type { Stage, Verdict } from '@gstackapp/shared'
import { usePipelineDetail } from '../../hooks/usePipelineFeed'
import { FindingGroup } from '../findings/FindingGroup'
import { CrossRepoInsight } from '../findings/CrossRepoInsight'
import { Skeleton, SkeletonText } from '../shared/Skeleton'
import { cn } from '../../lib/cn'

const STAGE_ORDER: Stage[] = ['ceo', 'eng', 'design', 'qa', 'security']

interface PRDetailProps {
  pipelineId: string
  onClose: () => void
}

/**
 * Expanded PR detail view with findings grouped by stage.
 * Per D-10: clicking a PR card expands to show detail.
 * Per DASH-07: detail view with findings grouped by stage.
 * Stage order is fixed: CEO -> Eng -> Design -> QA -> Security.
 */
export function PRDetail({ pipelineId, onClose }: PRDetailProps) {
  const { data: pipeline, isLoading, error } = usePipelineDetail(pipelineId)

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-background space-y-4">
        <Skeleton className="h-8 w-64" />
        <SkeletonText className="w-48" />
        <div className="space-y-6 mt-6">
          {STAGE_ORDER.map((stage) => (
            <div key={stage} className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !pipeline) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-background">
        <p className="font-body text-sm text-verdict-block">
          Failed to load pipeline details
        </p>
      </div>
    )
  }

  // Build a map from stage name -> stage result for fixed ordering
  const stageMap = new Map(
    pipeline.stages.map((s) => [s.stage, s])
  )

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-background">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-1 min-w-0">
          <h2 className="font-display text-xl font-semibold text-text-primary truncate">
            {pipeline.reviewUnit.title}
          </h2>
          <div className="flex items-center gap-3 text-text-muted">
            <span className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider',
              pipeline.reviewUnit.type === 'push'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-blue-500/15 text-blue-400'
            )}>
              {pipeline.reviewUnit.type === 'push' ? 'Push' : 'PR'}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.06em]">
              {pipeline.repo.fullName}
            </span>
            {pipeline.reviewUnit.type === 'pr' && pipeline.reviewUnit.prNumber && (
              <span className="font-body text-[12px]">
                #{pipeline.reviewUnit.prNumber} by {pipeline.reviewUnit.authorLogin}
              </span>
            )}
            {pipeline.reviewUnit.type === 'push' && (
              <span className="font-body text-[12px]">
                by {pipeline.reviewUnit.authorLogin}
              </span>
            )}
            <span className="font-mono text-[11px] text-text-muted">
              {pipeline.headSha.slice(0, 7)}
            </span>
          </div>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors duration-150"
          aria-label="Close detail view"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Stage results in fixed order */}
      <div className="space-y-6">
        {STAGE_ORDER.map((stage) => {
          const result = stageMap.get(stage)
          return (
            <FindingGroup
              key={stage}
              stage={stage}
              verdict={
                (result?.verdict as Verdict | 'RUNNING') ?? 'PENDING'
              }
              summary={result?.summary ?? null}
              findings={result?.findings ?? []}
            />
          )
        })}
      </div>

      {/* Cross-repo intelligence section */}
      {pipeline.crossRepoMatches && pipeline.crossRepoMatches.length > 0 && (
        <div className="mt-8 space-y-3">
          <h3
            className="font-display text-sm font-semibold uppercase tracking-[0.06em]"
            style={{ color: '#FFD166' }}
          >
            Seen in your other repos
          </h3>
          {pipeline.crossRepoMatches.map((match) => (
            <CrossRepoInsight key={match.finding_id} match={match} />
          ))}
        </div>
      )}
    </div>
  )
}
