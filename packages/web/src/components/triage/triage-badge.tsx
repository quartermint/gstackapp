interface TriageBadgeProps {
  count: number;
  onClick: () => void;
}

/**
 * Small pill badge showing count of stale captures that need attention.
 * Hidden when count is 0 (no empty badge).
 * Placed in the dashboard header between health indicator and theme toggle.
 */
export function TriageBadge({ count, onClick }: TriageBadgeProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className="bg-terracotta/15 text-terracotta text-xs font-medium px-2.5 py-0.5 rounded-full cursor-pointer hover:bg-terracotta/25 transition-colors"
      title={`${count} capture${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} attention`}
      aria-label={`${count} capture${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} attention`}
    >
      {count} triage
    </button>
  );
}
