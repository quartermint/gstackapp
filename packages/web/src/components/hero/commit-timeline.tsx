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
      <p className="text-sm text-text-muted dark:text-text-muted-dark mt-4 italic">
        No commits found
      </p>
    );
  }

  return (
    <div className="border-l-2 border-terracotta/25 dark:border-terracotta/20 ml-1 mt-5">
      {visible.map((commit, i) => (
        <div key={commit.hash} className="relative pl-5 pb-3.5 last:pb-0">
          {/* Timeline dot */}
          <span
            className={`absolute left-[-5px] top-1.5 w-2 h-2 rounded-full ${
              i === 0 ? "bg-terracotta" : "bg-terracotta/40"
            }`}
          />
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[11px] font-mono text-text-muted dark:text-text-muted-dark shrink-0 tabular-nums">
              {commit.hash.slice(0, 7)}
            </span>
            <span className="text-[11px] text-text-muted dark:text-text-muted-dark shrink-0">
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
