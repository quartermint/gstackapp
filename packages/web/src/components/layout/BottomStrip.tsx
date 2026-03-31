import { usePipelineList } from '../../hooks/usePipelineFeed'

/**
 * Bottom intelligence strip: fixed at bottom of main content area.
 * Per DESIGN.md Layout: "Bottom intelligence strip for trends and cross-repo alerts (always visible, no scroll)."
 * Shows live cross-repo intelligence status with warm gold (#FFD166) dot indicator.
 */
export function BottomStrip() {
  const { data: pipelines } = usePipelineList()

  const pipelineCount = pipelines?.length ?? 0
  const hasData = pipelineCount > 0

  return (
    <div className="h-10 bg-surface border-t border-border flex items-center px-4">
      {hasData ? (
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] flex items-center">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full mr-2"
            style={{ backgroundColor: '#FFD166' }}
          />
          Cross-repo intelligence — {pipelineCount} reviews indexed
        </span>
      ) : (
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
          No cross-repo data yet
        </span>
      )}
    </div>
  )
}
