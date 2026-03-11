interface HostBadgeProps {
  host: "local" | "mac-mini" | "github";
}

const hostStyles: Record<string, string> = {
  local:
    "bg-surface-warm dark:bg-surface-warm-dark text-text-muted dark:text-text-muted-dark",
  "mac-mini":
    "bg-terracotta/10 text-terracotta dark:bg-terracotta/20 dark:text-amber-warm",
  github:
    "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
};

export function HostBadge({ host }: HostBadgeProps) {
  return (
    <span
      className={`text-xs rounded-full px-2 py-0.5 ${hostStyles[host] ?? hostStyles.local}`}
    >
      {host}
    </span>
  );
}
