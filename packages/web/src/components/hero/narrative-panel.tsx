import type { ProjectNarrative } from "../../hooks/use-narrative.js";

interface NarrativePanelProps {
  narrative: ProjectNarrative | null;
  loading: boolean;
}

/**
 * AI-generated "Previously on..." narrative panel for the hero card.
 * When narrative is null, renders nothing (existing commit breadcrumbs serve as fallback).
 * When loading, shows a subtle skeleton shimmer.
 */
export function NarrativePanel({ narrative, loading }: NarrativePanelProps) {
  if (loading) {
    return (
      <div className="mt-5 pt-4 border-t border-warm-gray/10 dark:border-warm-gray/6">
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-warm-gray/10 dark:bg-warm-gray/6 rounded w-3/4" />
          <div className="h-3 bg-warm-gray/10 dark:bg-warm-gray/6 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!narrative) return null;

  return (
    <div className="mt-5 pt-4 border-t border-warm-gray/10 dark:border-warm-gray/6">
      {/* Section header with AI badge */}
      <div className="flex items-center gap-2 mb-2.5">
        <h4 className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark">
          Previously on...
        </h4>
        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-terracotta/10 text-terracotta dark:bg-terracotta/15 dark:text-terracotta/80">
          AI
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm text-text-primary dark:text-text-primary-dark leading-relaxed">
        {narrative.summary}
      </p>

      {/* Highlights */}
      {narrative.highlights.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {narrative.highlights.map((highlight, i) => (
            <li
              key={i}
              className="text-[11px] text-text-secondary dark:text-text-secondary-dark flex items-start gap-1.5"
            >
              <span className="text-terracotta/50 mt-0.5 shrink-0">
                &bull;
              </span>
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Open threads (amber accent for unfinished work) */}
      {narrative.openThreads.length > 0 && (
        <div className="mt-2">
          {narrative.openThreads.map((thread, i) => (
            <div
              key={i}
              className="text-[11px] text-amber-warm/80 dark:text-amber-warm/70 flex items-start gap-1.5"
            >
              <span className="mt-0.5 shrink-0">&#9711;</span>
              <span>{thread}</span>
            </div>
          ))}
        </div>
      )}

      {/* Suggested focus (terracotta callout) */}
      {narrative.suggestedFocus && (
        <div className="mt-2.5 px-2.5 py-1.5 rounded-md bg-terracotta/5 dark:bg-terracotta/8 border border-terracotta/10 dark:border-terracotta/8">
          <p className="text-[11px] text-terracotta dark:text-terracotta/80">
            <span className="font-semibold">Focus:</span>{" "}
            {narrative.suggestedFocus}
          </p>
        </div>
      )}
    </div>
  );
}
