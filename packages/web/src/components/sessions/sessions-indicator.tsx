import { useState, useEffect, useRef } from "react";
import type { SessionItem } from "../../hooks/use-sessions.js";
import type { BudgetData, BudgetSuggestion } from "../../hooks/use-budget.js";
import { SessionCard } from "./session-card.js";
import { BudgetWidget } from "./budget-widget.js";

interface SessionsIndicatorProps {
  sessions: SessionItem[];
  budget: BudgetData | null;
  suggestion: BudgetSuggestion | null;
  loading: boolean;
}

/**
 * Header-level compact indicator for active sessions.
 * Shows session count badge that toggles an expandable dropdown panel
 * with session details, budget widget, and budget suggestion tip.
 *
 * Follows HealthPanel pattern for click-outside and Escape key dismissal.
 */
export function SessionsIndicator({
  sessions,
  budget,
  suggestion,
  loading,
}: SessionsIndicatorProps) {
  const [open, setOpen] = useState<boolean>(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside (matches HealthPanel pattern exactly)
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    // Delay adding the listener to avoid the triggering click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const count = sessions.length;

  return (
    <div ref={panelRef}>
      {/* Compact indicator button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        title={`${count} active session${count !== 1 ? "s" : ""}`}
      >
        {/* Terminal icon */}
        <svg
          className="w-3.5 h-3.5 text-text-muted dark:text-text-muted-dark"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3"
          />
        </svg>

        {/* Count badge */}
        {!loading && count > 0 ? (
          <span className="bg-terracotta/12 text-terracotta text-[10px] font-semibold px-1.5 rounded-full">
            {count}
          </span>
        ) : (
          <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
            {loading ? "-" : "0"}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-surface dark:bg-surface-dark border border-black/10 dark:border-white/10 rounded-lg shadow-lg p-3 z-50">
          {/* Header */}
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted-dark mb-2">
            Active Sessions
          </h4>

          {/* Session list */}
          {count > 0 ? (
            <div className="space-y-0.5">
              {sessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-text-muted dark:text-text-muted-dark py-2">
              No active sessions
            </p>
          )}

          {/* Budget widget */}
          <BudgetWidget budget={budget} />

          {/* Budget suggestion tip */}
          {suggestion != null && suggestion.suggestedTier != null && (
            <div className="mt-2 px-2 py-1.5 rounded bg-amber-warm/8 text-amber-warm text-[10px] leading-snug">
              <span className="font-semibold">Tip:</span> {suggestion.reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
