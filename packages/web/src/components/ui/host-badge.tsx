interface HostBadgeProps {
  host: "local" | "mac-mini";
}

export function HostBadge({ host }: HostBadgeProps) {
  const isLocal = host === "local";

  return (
    <span
      className={`text-xs rounded-full px-2 py-0.5 ${
        isLocal
          ? "bg-surface-warm dark:bg-surface-warm-dark text-text-muted dark:text-text-muted-dark"
          : "bg-terracotta/10 text-terracotta dark:bg-terracotta/20 dark:text-amber-warm"
      }`}
    >
      {isLocal ? "local" : "mac-mini"}
    </span>
  );
}
