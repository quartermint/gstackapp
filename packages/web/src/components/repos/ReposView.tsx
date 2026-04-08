import { useRepos } from '../../hooks/useRepos'
import { usePipelineList } from '../../hooks/usePipeline'
import { Skeleton } from '../shared/Skeleton'
import { EmptyState } from '../shared/EmptyState'

/**
 * Repositories view — shows all connected repos with pipeline run counts.
 */
export function ReposView() {
  const { data: repos, isLoading: reposLoading } = useRepos()
  const { data: pipelines } = usePipelineList()

  // Count pipeline runs per repo
  const runCounts = new Map<string, number>()
  if (pipelines) {
    for (const p of pipelines) {
      const name = p.repo.fullName
      runCounts.set(name, (runCounts.get(name) ?? 0) + 1)
    }
  }

  if (reposLoading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    )
  }

  if (!repos || repos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          title="No repositories connected"
          description="Install the gstackapp GitHub App on your repos to get started"
        />
      </div>
    )
  }

  // Sort: repos with reviews first (by count desc), then alphabetical
  const sorted = [...repos].sort((a, b) => {
    const aCount = runCounts.get(a.fullName) ?? 0
    const bCount = runCounts.get(b.fullName) ?? 0
    if (aCount !== bCount) return bCount - aCount
    return a.fullName.localeCompare(b.fullName)
  })

  const withReviews = sorted.filter(r => (runCounts.get(r.fullName) ?? 0) > 0)
  const withoutReviews = sorted.filter(r => (runCounts.get(r.fullName) ?? 0) === 0)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="font-display text-xl text-text-primary font-semibold mb-1">
        Repositories
      </h2>
      <p className="text-text-muted text-sm mb-6">
        {repos.length} connected across {new Set(repos.map(r => r.fullName.split('/')[0])).size} org(s)
      </p>

      {withReviews.length > 0 && (
        <div className="mb-8">
          <h3 className="text-text-muted text-xs font-mono uppercase tracking-wider mb-3">
            Reviewed ({withReviews.length})
          </h3>
          <div className="space-y-1">
            {withReviews.map((repo) => (
              <RepoRow key={repo.id} repo={repo} runCount={runCounts.get(repo.fullName) ?? 0} />
            ))}
          </div>
        </div>
      )}

      {withoutReviews.length > 0 && (
        <div>
          <h3 className="text-text-muted text-xs font-mono uppercase tracking-wider mb-3">
            Connected ({withoutReviews.length})
          </h3>
          <div className="space-y-1">
            {withoutReviews.map((repo) => (
              <RepoRow key={repo.id} repo={repo} runCount={0} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RepoRow({ repo, runCount }: { repo: { id: number; fullName: string; defaultBranch: string }; runCount: number }) {
  const [org, name] = repo.fullName.split('/')
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-text-muted text-sm">{org}/</span>
        <span className="text-text-primary text-sm font-medium truncate">{name}</span>
        <span className="text-text-muted text-xs font-mono">{repo.defaultBranch}</span>
      </div>
      {runCount > 0 && (
        <span className="text-accent text-xs font-mono shrink-0">
          {runCount} review{runCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}
