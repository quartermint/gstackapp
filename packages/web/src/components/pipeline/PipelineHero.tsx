import type { Stage, Verdict } from '@gstackapp/shared'
import { usePipelineList } from '../../hooks/usePipeline'
import { PipelineTopology } from './PipelineTopology'
import { Skeleton } from '../shared/Skeleton'
import { EmptyState } from '../shared/EmptyState'

/** Fixed stage order for mapping API data */
const ALL_STAGES: Stage[] = ['ceo', 'eng', 'design', 'qa', 'security']

/**
 * Pipeline hero view — the signature UI feature.
 *
 * Per DESIGN.md:
 * - D-02: 60%+ viewport height as the hero view
 * - Pipeline topology IS the product
 * - Left-anchored content, directional layout
 *
 * States:
 * - Loading: 5 skeleton rectangles in a horizontal row
 * - Empty: "No reviews yet" empty state
 * - Data: PipelineTopology with the most recent pipeline run
 */
export function PipelineHero() {
  const { data, isLoading, error } = usePipelineList()

  // Loading state: 5 skeleton rectangles simulating stage nodes
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="w-36 h-44 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center bg-background">
        <EmptyState
          title="Failed to load pipelines"
          description={error.message}
        />
      </div>
    )
  }

  // Empty state: no pipeline runs exist yet
  if (!data || data.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center bg-background">
        <EmptyState
          title="No reviews yet"
          description="Open a PR on a connected repository to trigger your first review"
        />
      </div>
    )
  }

  // Data state: show the most recent pipeline run (first in reverse-chronological list)
  const latest = data[0]
  const stageMap = new Map(
    latest.stages.map((s) => [s.stage, s.verdict])
  )

  // Build stage data for topology: map all 5 stages, use API data or default to PENDING
  // For RUNNING pipeline status, stages not yet started show as PENDING
  const stageData = ALL_STAGES.map((stage) => {
    const verdict = stageMap.get(stage)
    return {
      stage,
      verdict: (verdict ?? 'PENDING') as Verdict | 'RUNNING' | 'PENDING',
    }
  })

  // Determine status display text
  const statusText =
    latest.status === 'RUNNING'
      ? 'Running'
      : latest.status === 'COMPLETED'
        ? 'Completed'
        : latest.status === 'FAILED'
          ? 'Failed'
          : latest.status

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center bg-background px-8">
      {/* Header: pipeline status, PR title, repo name */}
      <div className="mb-8 text-center">
        <p className="text-text-muted text-sm mb-1">
          {latest.repo.fullName}
          {latest.reviewUnit.prNumber && ` #${latest.reviewUnit.prNumber}`}
        </p>
        <h1 className="font-display text-2xl text-text-primary tracking-[-0.02em] font-semibold mb-2">
          {latest.reviewUnit.title}
        </h1>
        <p className="text-text-muted text-sm">
          {statusText}
        </p>
      </div>

      {/* Pipeline topology */}
      <PipelineTopology stages={stageData} />
    </div>
  )
}
