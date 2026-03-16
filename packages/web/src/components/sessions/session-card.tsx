import type { SessionItem } from "../../hooks/use-sessions.js";
import { formatElapsedTime } from "../../lib/time.js";

interface SessionCardProps {
  session: SessionItem;
}

const TIER_COLORS: Record<string, string> = {
  opus: "bg-terracotta/12 text-terracotta",
  sonnet: "bg-amber-warm/12 text-amber-warm",
  local: "bg-sage/12 text-sage",
  unknown:
    "bg-text-muted/12 text-text-muted dark:bg-text-muted-dark/12 dark:text-text-muted-dark",
};

/**
 * Single session row inside the sessions dropdown panel.
 * Shows tool icon, project name, model tier badge, and elapsed time.
 */
export function SessionCard({ session }: SessionCardProps) {
  const projectLabel =
    session.projectSlug ?? session.cwd.split("/").pop() ?? "unknown";
  const tierColor = TIER_COLORS[session.tier] ?? TIER_COLORS.unknown;
  const elapsed = formatElapsedTime(session.startedAt);

  return (
    <div className="flex items-center gap-2 py-1.5 px-1">
      {/* Tool icon */}
      {session.source === "claude-code" ? (
        <svg
          className="w-3.5 h-3.5 text-text-muted dark:text-text-muted-dark shrink-0"
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
      ) : (
        <svg
          className="w-3.5 h-3.5 text-text-muted dark:text-text-muted-dark shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25"
          />
        </svg>
      )}

      {/* Project name */}
      <span className="text-xs text-text-primary dark:text-text-primary-dark truncate">
        {projectLabel}
      </span>

      {/* Tier badge */}
      <span
        className={`text-[9px] uppercase font-semibold rounded px-1 leading-tight shrink-0 ${tierColor}`}
      >
        {session.tier}
      </span>

      {/* Elapsed time */}
      <span className="text-[10px] text-text-muted dark:text-text-muted-dark font-mono whitespace-nowrap ml-auto">
        {elapsed}
      </span>
    </div>
  );
}
