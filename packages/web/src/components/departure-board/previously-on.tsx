interface Commit {
  hash: string;
  message: string;
  relativeTime: string;
}

interface GsdState {
  status: string;
  stoppedAt: string | null;
  percent: number | null;
}

interface PreviouslyOnProps {
  commits: Commit[];
  gsdState: GsdState | null;
}

/**
 * Inline expandable "Previously on..." breadcrumbs showing last 3-5 commits
 * and optional GSD state for a project row in the departure board.
 * Compact spacing for inline display within the departure board.
 */
export function PreviouslyOn({ commits, gsdState }: PreviouslyOnProps) {
  const displayCommits = commits.slice(0, 5);

  if (displayCommits.length === 0 && !gsdState) {
    return (
      <div className="text-xs text-text-muted dark:text-text-muted-dark py-1.5 pl-3">
        No recent history available
      </div>
    );
  }

  return (
    <div className="border-l-2 border-terracotta/30 ml-2 pl-3 py-1.5 space-y-0.5">
      {/* GSD state line */}
      {gsdState && (
        <div className="text-[11px] text-text-muted dark:text-text-muted-dark font-medium mb-1">
          <span className="text-terracotta/70">GSD:</span>{" "}
          {gsdState.status}
          {gsdState.percent != null && (
            <span className="ml-1 opacity-70">-- {gsdState.percent}% complete</span>
          )}
          {gsdState.stoppedAt && (
            <span className="ml-1 opacity-60">({gsdState.stoppedAt})</span>
          )}
        </div>
      )}

      {/* Commit list */}
      {displayCommits.map((commit) => (
        <div
          key={commit.hash}
          className="flex items-baseline gap-2 text-xs min-w-0"
        >
          <span className="font-mono text-text-muted dark:text-text-muted-dark text-[11px] shrink-0">
            {commit.hash.slice(0, 7)}
          </span>
          <span className="truncate min-w-0 text-text-secondary dark:text-text-secondary-dark">
            {commit.message}
          </span>
          <span className="text-text-muted dark:text-text-muted-dark text-[11px] whitespace-nowrap shrink-0 ml-auto">
            {commit.relativeTime}
          </span>
        </div>
      ))}
    </div>
  );
}
