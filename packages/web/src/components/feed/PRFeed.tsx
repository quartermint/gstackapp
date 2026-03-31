import { usePipelineList } from '../../hooks/usePipelineFeed'
import { PRCard } from './PRCard'
import { Skeleton } from '../shared/Skeleton'
import { EmptyState } from '../shared/EmptyState'

interface PRFeedProps {
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/**
 * Reverse-chronological PR feed listing all pipeline runs.
 * Per D-09: sorted by last activity. Per DASH-06: all repos combined.
 */
export function PRFeed({ selectedId, onSelect }: PRFeedProps) {
  const { data: pipelines, isLoading, error } = usePipelineList()

  return (
    <div className="flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          Recent Reviews
        </h2>
        {pipelines && pipelines.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent-muted text-accent text-[11px] font-mono font-medium">
            {pipelines.length}
          </span>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col gap-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-b border-border">
              <Skeleton className="h-14 w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="px-4 py-6">
          <p className="font-body text-sm text-verdict-block">
            Failed to load reviews
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && pipelines && pipelines.length === 0 && (
        <EmptyState
          title="No reviews yet"
          description="Connect a GitHub repo and open a PR to see your first cognitive review."
        />
      )}

      {/* PR cards */}
      {pipelines?.map((pipeline) => (
        <PRCard
          key={pipeline.id}
          pipeline={pipeline}
          isSelected={selectedId === pipeline.id}
          onClick={() =>
            onSelect(selectedId === pipeline.id ? null : pipeline.id)
          }
        />
      ))}
    </div>
  )
}
