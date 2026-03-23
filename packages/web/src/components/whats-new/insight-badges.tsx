import type { Insight } from "../../hooks/use-insights.js";

interface InsightBadgesProps {
  insights: Insight[];
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
}

/** Badge config per insight type. */
const INSIGHT_BADGE_CONFIG: Record<
  Insight["type"],
  { label: string; pluralLabel: string; bgClass: string; textClass: string }
> = {
  stale_capture: {
    label: "stale capture",
    pluralLabel: "stale captures",
    bgClass: "bg-amber-warm/10",
    textClass: "text-amber-warm",
  },
  activity_gap: {
    label: "activity gap",
    pluralLabel: "activity gaps",
    bgClass: "bg-indigo-500/10",
    textClass: "text-indigo-400",
  },
  session_pattern: {
    label: "session pattern",
    pluralLabel: "session patterns",
    bgClass: "bg-blue-500/10",
    textClass: "text-blue-400",
  },
  cross_project: {
    label: "shared pattern",
    pluralLabel: "shared patterns",
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-400",
  },
};

/**
 * Compact insight badges for the intelligence strip (D-08).
 * Groups insights by type and renders a badge with count + dismiss X.
 * Follows the same badge styling as WhatsNewStrip discovery/star badges:
 * `px-2 py-0.5 rounded-full text-[10px] font-semibold`
 */
export function InsightBadges({ insights, onDismiss, onSnooze }: InsightBadgesProps) {
  if (insights.length === 0) return null;

  // Group by type
  const grouped = new Map<Insight["type"], Insight[]>();
  for (const insight of insights) {
    const existing = grouped.get(insight.type) ?? [];
    existing.push(insight);
    grouped.set(insight.type, existing);
  }

  return (
    <>
      {Array.from(grouped.entries()).map(([type, items]) => {
        const config = INSIGHT_BADGE_CONFIG[type];
        const count = items.length;
        const label = count === 1 ? config.label : config.pluralLabel;

        return (
          <div key={type} className="relative group">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${config.bgClass} ${config.textClass}`}
            >
              {count} {label}
              {/* Dismiss button for the most recent insight of this type */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // Dismiss all insights of this type
                  for (const item of items) {
                    onDismiss(item.id);
                  }
                }}
                className="ml-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity cursor-pointer"
                title="Dismiss"
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>

            {/* Tooltip with insight titles on hover */}
            <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block w-60 max-w-xs bg-surface-elevated dark:bg-surface-elevated-dark border border-warm-gray/12 dark:border-warm-gray/8 rounded-lg shadow-lg p-2 space-y-1">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-1.5">
                  <p className="text-[11px] text-text-secondary dark:text-text-secondary-dark flex-1 leading-snug">
                    {item.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => onSnooze(item.id)}
                    className="shrink-0 text-[9px] text-text-muted dark:text-text-muted-dark hover:text-text-secondary dark:hover:text-text-secondary-dark cursor-pointer transition-colors"
                    title="Snooze 24h"
                  >
                    snooze
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismiss(item.id)}
                    className="shrink-0 text-[9px] text-text-muted dark:text-text-muted-dark hover:text-rust cursor-pointer transition-colors"
                    title="Dismiss"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
