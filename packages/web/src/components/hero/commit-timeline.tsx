import { formatRelativeTime } from "../../lib/time.js";

interface Commit {
  hash: string;
  message: string;
  relativeTime: string;
  date: string;
}

interface CommitTimelineProps {
  commits: Commit[];
}

export function CommitTimeline({ commits }: CommitTimelineProps) {
  const visible = commits.slice(0, 5);

  if (visible.length === 0) {
    return (
      <p className="text-sm text-text-muted dark:text-text-muted-dark">
        No commits found
      </p>
    );
  }

  return (
    <div className="border-l-2 border-terracotta/30 ml-1 mt-3">
      {visible.map((commit) => (
        <div key={commit.hash} className="relative pl-5 pb-3 last:pb-0">
          {/* Dot on the line */}
          <span className="absolute left-[-5px] top-1.5 w-2 h-2 rounded-full bg-terracotta/60" />
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-xs font-mono text-text-muted dark:text-text-muted-dark shrink-0">
              {commit.hash.slice(0, 7)}
            </span>
            <span className="text-xs text-text-muted dark:text-text-muted-dark shrink-0">
              {formatRelativeTime(commit.date)}
            </span>
          </div>
          <p className="text-sm text-text-primary dark:text-text-primary-dark truncate min-w-0 mt-0.5">
            {commit.message}
          </p>
        </div>
      ))}
    </div>
  );
}
