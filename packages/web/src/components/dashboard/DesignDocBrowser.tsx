import { useDesignDocs } from '../../hooks/useDashboard'
import { formatDistanceToNow } from 'date-fns'

/**
 * Design doc browser: list view with project name, doc title, date, and content preview.
 * Renders markdown as text only (no HTML injection) per T-14-10 threat model.
 */
export function DesignDocBrowser() {
  const { data: docs, isLoading, isError } = useDesignDocs()

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1400px]">
        <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">
          Design Docs
        </h2>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-lg p-6 animate-pulse">
              <div className="h-3 w-24 rounded bg-border mb-2" />
              <div className="h-5 w-48 rounded bg-border mb-3" />
              <div className="h-4 w-full rounded bg-border mb-1" />
              <div className="h-4 w-3/4 rounded bg-border" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-8 max-w-[1400px]">
        <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">
          Design Docs
        </h2>
        <p className="text-text-muted font-body text-[15px]">
          Could not load design documents. Check filesystem permissions and try refreshing.
        </p>
      </div>
    )
  }

  if (!docs || docs.length === 0) {
    return (
      <div className="p-8 max-w-[1400px]">
        <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">
          Design Docs
        </h2>
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <h3 className="font-display text-lg font-semibold text-text-primary mb-2">
            No design docs yet
          </h3>
          <p className="text-text-muted font-body text-[15px]">
            Run an ideation session to generate design documents for your projects.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-[1400px]">
      <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">
        Design Docs
      </h2>
      <div className="space-y-4">
        {docs.map((doc) => (
          <div
            key={`${doc.projectName}-${doc.docTitle}`}
            className="bg-surface border border-border rounded-lg p-6 hover:bg-surface-hover hover:border-border-focus transition-colors duration-150"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-body text-[12px] font-medium text-text-muted">
                {doc.projectName}
              </span>
              <span className="font-body text-[12px] text-text-muted">
                {formatDistanceToNow(new Date(doc.modifiedAt), { addSuffix: true })}
              </span>
            </div>
            <h3 className="font-body text-lg font-medium text-text-primary mb-2">
              {doc.docTitle}
            </h3>
            {doc.content && (
              <p className="font-body text-[15px] text-text-muted line-clamp-3">
                {doc.content.slice(0, 200)}
                {doc.content.length > 200 ? '...' : ''}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
