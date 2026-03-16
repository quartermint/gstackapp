import { useMemo } from "react";
import type { SessionHistoryItem } from "../../hooks/use-session-history.js";
import { groupByProject } from "../../hooks/use-session-history.js";
import { TimelineBar } from "./timeline-bar.js";

interface SessionTimelineSidebarProps {
  sessions: SessionHistoryItem[];
  open: boolean;
  onClose: () => void;
}

/** Convert a kebab-case slug to Title Case display name. */
function displayName(slug: string): string {
  if (slug === "unlinked") return "Unlinked";
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Format hour number to display label (e.g., 8 -> "8am", 14 -> "2pm"). */
function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12am";
  if (hour === 12) return "12pm";
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

/**
 * Collapsible right sidebar showing session timeline visualization.
 * Displays today's sessions as horizontal bars arranged by time-of-day,
 * grouped into project rows (one row per project).
 */
export function SessionTimelineSidebar({
  sessions,
  open,
  onClose,
}: SessionTimelineSidebarProps) {
  const grouped = useMemo(() => groupByProject(sessions), [sessions]);

  const { dayStartHour, dayEndHour, hourLabels } = useMemo(() => {
    if (sessions.length === 0) {
      const now = new Date();
      return {
        dayStartHour: 6,
        dayEndHour: now.getHours() + 1,
        hourLabels: [] as number[],
      };
    }

    // Compute bounds from session data
    let earliest = 23;
    let latest = 0;

    for (const s of sessions) {
      const startHour = new Date(s.startedAt).getHours();
      earliest = Math.min(earliest, startHour);

      if (s.endedAt) {
        const endHour = new Date(s.endedAt).getHours();
        latest = Math.max(latest, endHour + 1);
      } else {
        // Active session extends to now
        latest = Math.max(latest, new Date().getHours() + 1);
      }
    }

    const start = Math.min(6, earliest);
    const end = Math.max(new Date().getHours() + 1, latest);
    const labels: number[] = [];
    for (let h = start; h <= end; h++) {
      labels.push(h);
    }

    return { dayStartHour: start, dayEndHour: end, hourLabels: labels };
  }, [sessions]);

  const projectEntries = useMemo(
    () => Array.from(grouped.entries()),
    [grouped]
  );

  const formattedDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date()),
    []
  );

  return (
    <div
      className={`fixed top-14 right-0 bottom-0 w-80 bg-surface dark:bg-surface-dark border-l border-black/10 dark:border-white/10 shadow-lg z-40 transition-transform duration-300 flex flex-col ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
            Session Timeline
          </h3>
          <span className="text-[10px] font-mono text-text-muted dark:text-text-muted-dark">
            Today &middot; {formattedDate}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          title="Close timeline"
        >
          <svg
            className="w-4 h-4 text-text-muted dark:text-text-muted-dark"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-text-muted dark:text-text-muted-dark italic">
              No sessions today
            </p>
          </div>
        ) : (
          <>
            {/* Hour axis labels */}
            <div className="flex items-center gap-0 mb-2">
              <div className="w-20 shrink-0" />
              <div className="relative flex-1 h-4">
                {hourLabels.map((h) => {
                  const totalMinutes =
                    (dayEndHour - dayStartHour) * 60;
                  const offset =
                    ((h - dayStartHour) * 60) / totalMinutes;
                  return (
                    <span
                      key={h}
                      className="absolute text-[9px] font-mono text-text-muted dark:text-text-muted-dark tabular-nums"
                      style={{ left: `${offset * 100}%` }}
                    >
                      {formatHour(h)}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Project rows */}
            <div className="space-y-1.5">
              {projectEntries.map(([slug, projectSessions]) => (
                <div
                  key={slug}
                  className="flex items-center gap-2 py-1"
                >
                  {/* Project label */}
                  <span className="w-20 shrink-0 truncate text-[11px] font-mono text-text-muted dark:text-text-muted-dark">
                    {displayName(slug)}
                  </span>

                  {/* Track area with gridlines and bars */}
                  <div className="relative flex-1 h-5 bg-surface-warm/20 dark:bg-surface-warm-dark/20 rounded-sm">
                    {/* Hour gridlines */}
                    {hourLabels.map((h) => {
                      const totalMinutes =
                        (dayEndHour - dayStartHour) * 60;
                      const offset =
                        ((h - dayStartHour) * 60) / totalMinutes;
                      return (
                        <div
                          key={`grid-${h}`}
                          className="absolute top-0 bottom-0 border-l border-dashed border-warm-gray/10"
                          style={{ left: `${offset * 100}%` }}
                        />
                      );
                    })}

                    {/* Session bars */}
                    {projectSessions.map((session) => (
                      <TimelineBar
                        key={session.id}
                        session={session}
                        dayStartHour={dayStartHour}
                        dayEndHour={dayEndHour}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-black/5 dark:border-white/5 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500/70" />
          <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
            Claude Code
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-warm/70" />
          <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
            Aider
          </span>
        </div>
      </div>
    </div>
  );
}
