import { useGbrainEntity, useGbrainRelated } from '../../hooks/useGbrain'

interface GbrainEntityDetailProps {
  slug: string
  onNavigate: (slug: string) => void
}

export function GbrainEntityDetail({ slug, onNavigate }: GbrainEntityDetailProps) {
  const { data: entityData, isLoading: entityLoading } = useGbrainEntity(slug)
  const { data: relatedData, isLoading: relatedLoading } = useGbrainRelated(slug)

  // Loading state
  if (entityLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-7 w-48 rounded bg-border" />
        <div className="h-4 w-full rounded bg-border" />
        <div className="h-4 w-3/4 rounded bg-border" />
        <div className="h-32 w-full rounded bg-border" />
      </div>
    )
  }

  // gbrain unavailable
  if (entityData && !entityData.available) {
    return (
      <div className="bg-[rgba(255,176,32,0.08)] border border-[rgba(255,176,32,0.2)] rounded-md p-4">
        <p className="font-body text-[15px] text-[#FFB020] font-semibold mb-1">
          Knowledge base unavailable
        </p>
        <p className="font-body text-[13px] text-[#FFB020]">
          The gbrain MCP server is not responding. Retry or check server status.
        </p>
      </div>
    )
  }

  // Entity not found
  if (!entityData?.entity) {
    return (
      <div className="text-center py-12">
        <p className="font-body text-[15px] text-text-muted">Entity not found</p>
      </div>
    )
  }

  const entity = entityData.entity

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="font-display text-[24px] font-semibold text-text-primary leading-[1.2]">
          {entity.title}
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] rounded-full bg-[rgba(198,255,59,0.12)] text-accent px-2 py-0.5 shrink-0">
          {entity.type}
        </span>
      </div>

      {/* Summary */}
      <div>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted block mb-2">
          Summary
        </span>
        <p className="font-body text-[15px] text-text-primary leading-[1.6]">
          {entity.excerpt}
        </p>
      </div>

      {/* Related Entities */}
      {!relatedLoading && relatedData && relatedData.related.length > 0 && (
        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted block mb-2">
            Related Entities
          </span>
          <div className="space-y-1">
            {relatedData.related.map((rel) => (
              <button
                key={rel.slug}
                type="button"
                onClick={() => onNavigate(rel.slug)}
                className="block w-full text-left group"
              >
                <span className="font-body text-[13px] text-text-muted group-hover:text-accent transition-colors">
                  {rel.title}
                </span>
                <span className="font-body text-[13px] text-text-muted opacity-60 ml-2">
                  ({rel.relationship})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Compiled Truth */}
      <div>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted block mb-2">
          Compiled Truth
        </span>
        <div className="bg-background rounded-md p-4 font-mono text-[15px] text-text-muted max-h-[400px] overflow-y-auto whitespace-pre-wrap leading-[1.7] border border-border">
          {entity.content}
        </div>
      </div>
    </div>
  )
}
