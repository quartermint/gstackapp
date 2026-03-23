interface InsightTriageProps {
  onClose: () => void;
  /** Called to open the full TriageView in App. */
  onOpenTriage: () => void;
  /** Number of unassigned captures (for display). */
  staleCount?: number;
}

/**
 * Lightweight inline triage bridge for stale capture insights (D-04).
 * Not a modal — renders inline below the insight card, linking to
 * the existing TriageView for actual triage actions.
 */
export function InsightTriage({ onClose, onOpenTriage, staleCount }: InsightTriageProps) {
  return (
    <div className="border-l-2 border-amber-warm/30 bg-amber-warm/5 rounded-r-md px-2.5 py-2 mt-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-text-secondary dark:text-text-secondary-dark">
          Review {staleCount != null ? `${staleCount} unassigned` : "stale"} captures
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onOpenTriage();
              onClose();
            }}
            className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-warm hover:text-amber-warm/80 transition-colors cursor-pointer"
          >
            Open Triage
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="text-[10px] text-text-muted dark:text-text-muted-dark hover:text-text-secondary dark:hover:text-text-secondary-dark transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
