import { useState } from "react";
import type { DailyDigest } from "../../hooks/use-digest.js";

interface DigestStripViewProps {
  digest: DailyDigest;
  onRead: () => void;
}

/**
 * Compact inline digest view for the intelligence strip (D-01).
 * Renders the digest as a newspaper-headline view: summary line,
 * section pills, and first 3 action items with "Got it" dismiss.
 * This is NOT the full DailyDigestPanel card -- it's a condensed
 * strip-width view occupying the same real estate as What's New.
 */
export function DigestStripView({ digest, onRead }: DigestStripViewProps) {
  const [actionsExpanded, setActionsExpanded] = useState(false);

  // Sort sections by priority: high > medium > low
  const sortedSections = [...digest.sections].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  const visibleActions = actionsExpanded
    ? digest.actionItems
    : digest.actionItems.slice(0, 3);
  const hasMoreActions = digest.actionItems.length > 3;

  return (
    <div className="transition-all duration-300 space-y-1.5">
      {/* Summary line */}
      <div className="flex items-start gap-2">
        <p className="text-[12px] font-medium text-text-primary dark:text-text-primary-dark leading-snug flex-1">
          {digest.summary}
        </p>
        <button
          type="button"
          onClick={onRead}
          className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-terracotta/10 text-terracotta hover:bg-terracotta/18 transition-colors cursor-pointer"
        >
          Got it
        </button>
      </div>

      {/* Section pills */}
      {sortedSections.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {sortedSections.map((section, i) => {
            const pillColor =
              section.priority === "high"
                ? "bg-amber-warm/10 text-amber-warm"
                : section.priority === "medium"
                  ? "bg-warm-gray/10 text-text-secondary dark:text-text-secondary-dark"
                  : "bg-warm-gray/6 text-text-muted dark:text-text-muted-dark";
            return (
              <span
                key={i}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${pillColor}`}
              >
                {section.title}
                {section.items.length > 0 && (
                  <span className="ml-0.5 opacity-60">({section.items.length})</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Compact action items (first 3) */}
      {digest.actionItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {visibleActions.map((item, i) => (
            <span
              key={i}
              className="text-[11px] text-text-secondary dark:text-text-secondary-dark flex items-center gap-1"
            >
              <span className="text-terracotta text-[8px]">&#9679;</span>
              {item}
            </span>
          ))}
          {hasMoreActions && !actionsExpanded && (
            <button
              type="button"
              onClick={() => setActionsExpanded(true)}
              className="text-[10px] text-text-muted dark:text-text-muted-dark hover:text-text-secondary dark:hover:text-text-secondary-dark cursor-pointer transition-colors"
            >
              +{digest.actionItems.length - 3} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
