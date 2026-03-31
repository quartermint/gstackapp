import { useState, useEffect } from 'react'
import type { Stage } from '@gstackapp/shared'
import { useRepos } from '../../hooks/useRepos'
import { useQualityScores, useVerdictRates, useFindingTrends } from '../../hooks/useTrends'
import { QualityScoreChart } from './QualityScoreChart'
import { VerdictRateChart } from './VerdictRateChart'
import { FindingTrendChart } from './FindingTrendChart'
import { RepoSelector } from './RepoSelector'
import { EmptyState } from '../shared/EmptyState'
import { Skeleton } from '../shared/Skeleton'
import { STAGE_LABELS } from '../../lib/constants'

const STAGES: Stage[] = ['ceo', 'eng', 'design', 'qa', 'security']

/**
 * Per-stage verdict chart wrapper that manages its own data hook.
 */
function StageVerdictSection({ repoId, stage }: { repoId: number | null; stage: Stage }) {
  const { data, isLoading } = useVerdictRates(repoId, stage)
  if (isLoading) return <Skeleton className="h-[200px] w-full" />
  return (
    <VerdictRateChart
      data={data ?? []}
      stage={stage}
      isEmpty={(data?.length ?? 0) < 2}
    />
  )
}

/**
 * TrendsView: full-page container for quality trend charts.
 * Per DESIGN.md: left-anchored, grid-disciplined, dense and functional.
 */
export function TrendsView() {
  const { data: repos, isLoading: reposLoading } = useRepos()
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null)

  // Auto-select first repo when loaded
  useEffect(() => {
    if (repos && repos.length > 0 && selectedRepoId === null) {
      setSelectedRepoId(repos[0].id)
    }
  }, [repos, selectedRepoId])

  const { data: scores, isLoading: scoresLoading } = useQualityScores(selectedRepoId)
  const { data: findings, isLoading: findingsLoading } = useFindingTrends(selectedRepoId)

  // No repos connected
  if (!reposLoading && (!repos || repos.length === 0)) {
    return (
      <div className="p-6">
        <EmptyState
          title="No repositories connected"
          description="Connect a repository to see quality trends"
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-text-primary text-2xl font-semibold tracking-[-0.02em]">
          Quality Trends
        </h1>
        {repos && repos.length > 0 && (
          <RepoSelector
            repos={repos}
            selectedId={selectedRepoId}
            onSelect={setSelectedRepoId}
          />
        )}
      </div>

      {/* Quality Score */}
      <section className="bg-surface rounded-lg border border-border p-4">
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] block mb-3">
          Quality Score
        </span>
        {scoresLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : (
          <QualityScoreChart
            data={scores ?? []}
            isEmpty={(scores?.length ?? 0) < 2}
          />
        )}
      </section>

      {/* Per-Stage Verdict Rates */}
      <section>
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] block mb-3">
          Verdict Rates by Stage
        </span>
        <div className="grid lg:grid-cols-2 gap-3">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className="bg-surface rounded-lg border border-border p-4"
            >
              <StageVerdictSection repoId={selectedRepoId} stage={stage} />
            </div>
          ))}
        </div>
      </section>

      {/* Finding Frequency */}
      <section className="bg-surface rounded-lg border border-border p-4">
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] block mb-3">
          Finding Frequency
        </span>
        {findingsLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : (
          <FindingTrendChart
            data={findings ?? []}
            isEmpty={(findings?.length ?? 0) < 2}
          />
        )}
      </section>
    </div>
  )
}
