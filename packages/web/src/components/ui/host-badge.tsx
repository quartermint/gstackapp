interface HostBadgeProps {
  host: "local" | "mac-mini" | "github";
}

const hostStyles: Record<string, string> = {
  local:
    "bg-warm-gray/8 text-text-muted dark:text-text-muted-dark border border-warm-gray/10",
  "mac-mini":
    "bg-terracotta/8 text-terracotta border border-terracotta/10 dark:bg-terracotta/12 dark:text-amber-warm dark:border-terracotta/15",
  github:
    "bg-indigo-500/8 text-indigo-600 border border-indigo-500/10 dark:bg-indigo-500/12 dark:text-indigo-400 dark:border-indigo-500/15",
};

export function HostBadge({ host }: HostBadgeProps) {
  return (
    <span
      className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${hostStyles[host] ?? hostStyles.local}`}
    >
      {host}
    </span>
  );
}
