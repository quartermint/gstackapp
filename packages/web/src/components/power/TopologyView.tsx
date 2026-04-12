import { useState, useMemo } from 'react'
import { usePipelineList } from '../../hooks/usePipelineFeed'
import type { PipelineListItem } from '../../hooks/usePipelineFeed'
import { TopologyFilterBar } from './TopologyFilterBar'
import { PipelineTopology } from '../pipeline/PipelineTopology'
import { EmptyState } from '../shared/EmptyState'
import { Skeleton } from '../shared/Skeleton'
import { cn } from '../../lib/cn'
import type { Stage, Verdict } from '@gstackapp/shared'

type StatusFilter = 'all' | 'running' | 'complete' | 'flagged'

/**
 * Cross-repo pipeline topology view (DASH-02).
 *
 * Shows all pipeline runs grouped by repo with real-time SSE updates.
 * Filter by repo and status (all/running/complete/flagged).
 * SSE updates happen via useSSEQuerySync at App level — query cache
 * invalidation is already wired.
 */
export function TopologyView() {
  const { data: pipelines, isLoading, isError } = usePipelineList()
  const [selectedRepos, setSelectedRepos] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Derive unique repos
  const allRepos = useMemo(() => {
    if (!pipelines) return []
    return Array.from(new Set(pipelines.map((p) => p.repo.fullName))).sort()
  }, [pipelines])

  // Filter pipelines
  const filtered = useMemo(() => {
    if (!pipelines) return []
    let result = pipelines

    // Repo filter (empty selectedRepos = all)
    if (selectedRepos.length > 0) {
      result = result.filter((p) => selectedRepos.includes(p.repo.fullName))
    }

    // Status filter
    if (statusFilter === 'running') {
      result = result.filter((p) => p.status === 'running')
    } else if (statusFilter === 'complete') {
      result = result.filter((p) => p.status === 'completed')
    } else if (statusFilter === 'flagged') {
      result = result.filter((p) =>
        p.stages.some((s) => s.verdict === 'FLAG' || s.verdict === 'BLOCK')
      )
    }

    return result
  }, [pipelines, selectedRepos, statusFilter])

  // Group filtered pipelines by repo
  const grouped = useMemo(() => {
    const map = new Map<string, PipelineListItem[]>()
    for (const p of filtered) {
      const key = p.repo.fullName
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return map
  }, [filtered])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <h1 className="font-display text-[24px] font-semibold text-text-primary">
          Pipeline Topology
        </h1>
      </div>

      {/* Filter bar */}
      <TopologyFilterBar
        repos={allRepos}
        selectedRepos={selectedRepos}
        onRepoChange={setSelectedRepos}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {isLoading && (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-44 w-full" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            title="Failed to load pipelines"
            description="There was an error loading pipeline data. Please try again."
          />
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <EmptyState
            title="No active pipelines"
            description="Trigger a pipeline run to see the review topology."
          />
        )}

        {!isLoading &&
          !isError &&
          Array.from(grouped.entries()).map(([repoName, pipelineList]) => (
            <div key={repoName} className="space-y-3">
              {/* Repo label */}
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                {repoName}
              </span>

              {/* Pipeline rows */}
              {pipelineList.map((pipeline) => (
                <PipelineRow key={pipeline.id} pipeline={pipeline} />
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}

/**
 * Single pipeline row within a repo group.
 * Shows PR/push title + PipelineTopology with stage verdicts.
 */
function PipelineRow({ pipeline }: { pipeline: PipelineListItem }) {
  // Map pipeline stages to PipelineTopology's expected format
  const stageData = pipeline.stages.map((s) => ({
    stage: s.stage as Stage,
    verdict: s.verdict as Verdict | 'RUNNING' | 'PENDING',
  }))

  return (
    <div className="bg-surface border border-border rounded-md p-4">
      {/* Pipeline info row */}
      <div className="flex items-center gap-3 mb-3">
        <span className="font-body text-[13px] text-text-primary truncate">
          {pipeline.reviewUnit.title}
        </span>
        {pipeline.reviewUnit.prNumber && (
          <span className="font-mono text-[11px] text-text-muted">
            #{pipeline.reviewUnit.prNumber}
          </span>
        )}
        <span className="font-mono text-[11px] text-text-muted">
          {pipeline.headSha.slice(0, 7)}
        </span>
        <span
          className={cn(
            'ml-auto font-mono text-[11px] uppercase tracking-[0.06em]',
            pipeline.status === 'running'
              ? 'text-[#36C9FF]'
              : pipeline.status === 'completed'
                ? 'text-text-muted'
                : 'text-text-muted/50'
          )}
        >
          {pipeline.status}
        </span>
      </div>

      {/* Pipeline topology */}
      <PipelineTopology stages={stageData} />
    </div>
  )
}

