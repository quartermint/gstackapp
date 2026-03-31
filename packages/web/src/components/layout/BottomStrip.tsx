/**
 * Bottom intelligence strip: fixed at bottom of main content area.
 * Per DESIGN.md Layout: "Bottom intelligence strip for trends and cross-repo alerts (always visible, no scroll)."
 */
export function BottomStrip() {
  return (
    <div className="h-10 bg-surface border-t border-border flex items-center px-4">
      <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
        Intelligence strip — cross-repo insights coming in Phase 5
      </span>
    </div>
  )
}
