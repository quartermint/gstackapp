import { useState } from "react";
import type { Insight } from "../../hooks/use-insights.js";
import { InsightCard } from "../insights/insight-card.js";
import { InsightTriage } from "../insights/insight-triage.js";

interface InsightBadgesProps {
  insights: Insight[];
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  /** Called to open the full TriageView (bridges from stale capture insight to triage). */
  onOpenTriage?: () => void;
  /** Number of stale captures for triage display. */
  staleCount?: number;
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
 * Clicking a badge toggles an expanded section below showing InsightCards.
 * Follows the same badge styling as WhatsNewStrip discovery/star badges:
 * `px-2 py-0.5 rounded-full text-[10px] font-semibold`
 */
export function InsightBadges({ insights, onDismiss, onSnooze, onOpenTriage, staleCount }: InsightBadgesProps) {
  const [expandedType, setExpandedType] = useState<Insight["type"] | null>(null);
  const [triageInsightId, setTriageInsightId] = useState<string | null>(null);

  if (insights.length === 0) return null;

  // Group by type
  const grouped = new Map<Insight["type"], Insight[]>();
  for (const insight of insights) {
    const existing = grouped.get(insight.type) ?? [];
    existing.push(insight);
    grouped.set(insight.type, existing);
  }

  const handleBadgeClick = (type: Insight["type"]) => {
    setExpandedType((prev) => (prev === type ? null : type));
    setTriageInsightId(null);
  };

  return (
    <div className="flex flex-col">
      {/* Badge row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {Array.from(grouped.entries()).map(([type, items]) => {
          const config = INSIGHT_BADGE_CONFIG[type];
          const count = items.length;
          const label = count === 1 ? config.label : config.pluralLabel;
          const isExpanded = expandedType === type;

          return (
            <div key={type} className="relative group">
              <button
                type="button"
                onClick={() => handleBadgeClick(type)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${config.bgClass} ${config.textClass} ${isExpanded ? "ring-1 ring-current/30" : ""}`}
              >
                {count} {label}
              </button>

              {/* Batch dismiss X — visible on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  for (const item of items) {
                    onDismiss(item.id);
                  }
                  if (expandedType === type) setExpandedType(null);
                }}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-surface-elevated dark:bg-surface-elevated-dark border border-warm-gray/15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Dismiss all"
              >
                <svg className="w-2 h-2 text-text-muted dark:text-text-muted-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Expanded detail cards — appears below the badge row */}
      {expandedType && grouped.has(expandedType) && (
        <div
          className="overflow-hidden transition-all duration-200 ease-in-out max-h-96 opacity-100 mt-2"
        >
          <div className="space-y-1.5">
            {grouped.get(expandedType)!.map((insight) => (
              <div key={insight.id}>
                <InsightCard
                  insight={insight}
                  onDismiss={(id) => {
                    onDismiss(id);
                    // If this was the last insight of this type, collapse
                    const remaining = grouped.get(expandedType)!.filter((i) => i.id !== id);
                    if (remaining.length === 0) setExpandedType(null);
                  }}
                  onSnooze={(id) => {
                    onSnooze(id);
                    const remaining = grouped.get(expandedType)!.filter((i) => i.id !== id);
                    if (remaining.length === 0) setExpandedType(null);
                  }}
                  onTriage={
                    insight.type === "stale_capture" && onOpenTriage
                      ? () => setTriageInsightId(insight.id)
                      : undefined
                  }
                />

                {/* Inline triage bridge for stale capture insights */}
                {triageInsightId === insight.id && onOpenTriage && (
                  <InsightTriage
                    onClose={() => setTriageInsightId(null)}
                    onOpenTriage={onOpenTriage}
                    staleCount={staleCount}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
