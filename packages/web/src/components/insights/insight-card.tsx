import type { Insight } from "../../hooks/use-insights.js";
import { formatRelativeTime } from "../../lib/time.js";

interface InsightCardProps {
  insight: Insight;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onTriage?: () => void;
}

/** Color config per insight type — border-l accent + background. */
const INSIGHT_TYPE_COLORS: Record<
  Insight["type"],
  { border: string; bg: string }
> = {
  stale_capture: { border: "border-amber-warm", bg: "bg-amber-warm/10" },
  activity_gap: { border: "border-indigo-400", bg: "bg-indigo-500/10" },
  session_pattern: { border: "border-blue-400", bg: "bg-blue-500/10" },
  cross_project: { border: "border-emerald-400", bg: "bg-emerald-500/10" },
};

/**
 * Individual insight detail card with dismiss/snooze actions.
 * Layout follows the FindingsPanel border-l-2 accent pattern.
 * Renders below expanded insight badges in the intelligence strip.
 */
export function InsightCard({ insight, onDismiss, onSnooze, onTriage }: InsightCardProps) {
  const colors = INSIGHT_TYPE_COLORS[insight.type];
  const relativeTime = formatRelativeTime(insight.createdAt);

  // Parse metadata for additional context
  let metadataContent: React.ReactNode = null;
  if (insight.metadata) {
    try {
      const meta = JSON.parse(insight.metadata) as Record<string, unknown>;

      if (insight.type === "cross_project" && Array.isArray(meta.sharedTerms)) {
        metadataContent = (
          <div className="flex flex-wrap gap-1 mt-1">
            {(meta.sharedTerms as string[]).slice(0, 5).map((term) => (
              <span
                key={term}
                className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/8 text-emerald-400"
              >
                {term}
              </span>
            ))}
          </div>
        );
      } else if (insight.type === "activity_gap" && typeof meta.projectSlug === "string") {
        metadataContent = (
          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-500/8 text-indigo-400">
            {meta.projectSlug}
          </span>
        );
      } else if (insight.type === "session_pattern" && typeof meta.peakHour === "number") {
        metadataContent = (
          <span className="inline-block mt-1 text-[9px] text-text-muted dark:text-text-muted-dark">
            Peak: {meta.peakHour}:00-{(meta.peakHour as number) + 1}:00
          </span>
        );
      }
    } catch {
      // Invalid JSON — skip metadata rendering
    }
  }

  return (
    <div className={`border-l-2 ${colors.border} ${colors.bg} rounded-r-md px-2.5 py-1.5`}>
      {/* Title row */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[12px] font-semibold text-text-primary dark:text-text-primary-dark truncate flex-1 leading-snug">
          {insight.title}
        </span>
        <span className="text-[9px] text-text-muted dark:text-text-muted-dark whitespace-nowrap shrink-0 tabular-nums">
          {relativeTime}
        </span>
      </div>

      {/* Body */}
      <p className="text-[11px] text-text-secondary dark:text-text-secondary-dark leading-snug mt-0.5">
        {insight.body}
      </p>

      {/* Metadata */}
      {metadataContent}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-1.5">
        <button
          type="button"
          onClick={() => onDismiss(insight.id)}
          className="flex items-center gap-0.5 text-[10px] text-text-muted dark:text-text-muted-dark hover:text-rust transition-colors cursor-pointer"
          title="Dismiss"
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Dismiss
        </button>

        <button
          type="button"
          onClick={() => onSnooze(insight.id)}
          className="flex items-center gap-0.5 text-[10px] text-text-muted dark:text-text-muted-dark hover:text-text-secondary dark:hover:text-text-secondary-dark transition-colors cursor-pointer"
          title="Snooze 24h"
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Snooze 24h
        </button>

        {insight.type === "stale_capture" && onTriage && (
          <button
            type="button"
            onClick={onTriage}
            className="flex items-center gap-0.5 text-[10px] font-medium text-amber-warm hover:text-amber-warm/80 transition-colors cursor-pointer ml-auto"
            title="Triage stale captures"
          >
            Triage
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
