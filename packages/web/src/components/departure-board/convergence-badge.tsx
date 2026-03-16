interface ConvergenceBadgeProps {
  sessionCount: number;
  fileCount: number;
}

/**
 * Passive convergence indicator for project cards.
 * Shows when parallel sessions share overlapping files and may be ready to merge.
 * Amber pill badge with merge icon -- informational only, never alarming.
 */
export function ConvergenceBadge({ sessionCount, fileCount }: ConvergenceBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-0.5 h-[18px] min-w-[18px] px-1.5 rounded-full bg-amber-500/12 text-amber-500 text-[10px] font-semibold shrink-0"
      title={`${sessionCount} sessions may be ready to converge (${fileCount} shared files)`}
    >
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
      {sessionCount}
    </span>
  );
}
