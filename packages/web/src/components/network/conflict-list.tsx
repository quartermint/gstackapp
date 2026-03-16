import type { PortConflict } from "../../hooks/use-port-conflicts.js";

const CONFLICT_STYLES: Record<string, { bg: string; icon: string; label: string }> = {
  unregistered: {
    bg: "bg-gold-status/10 border-gold-status/30",
    icon: "?",
    label: "Unregistered",
  },
  down: {
    bg: "bg-rust/10 border-rust/30",
    icon: "!",
    label: "Down",
  },
  duplicate: {
    bg: "bg-rust/10 border-rust/30",
    icon: "!!",
    label: "Duplicate",
  },
};

interface ConflictListProps {
  conflicts: PortConflict[];
  loading: boolean;
}

export function ConflictList({ conflicts, loading }: ConflictListProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 bg-surface-warm dark:bg-surface-warm-dark rounded" />
        ))}
      </div>
    );
  }

  if (conflicts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sage text-sm font-medium">No conflicts detected</p>
        <p className="text-text-muted dark:text-text-muted-dark text-xs mt-1">
          All allocated ports are running and no unregistered processes found.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conflicts.map((conflict, i) => {
        const fallback = { bg: "bg-gold-status/10 border-gold-status/30", icon: "?", label: "Unknown" };
        const style =
          CONFLICT_STYLES[conflict.type] ?? fallback;
        return (
          <div
            key={`${conflict.machineId}:${conflict.port}:${i}`}
            className={`rounded-lg border p-3 ${style.bg}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold opacity-60">
                {style.icon}
              </span>
              <span className="text-xs font-medium">{style.label}</span>
              <span className="text-xs text-text-muted dark:text-text-muted-dark">
                port {conflict.port}/{conflict.protocol} on{" "}
                {conflict.machineHostname}
              </span>
            </div>
            <p className="text-xs text-text-secondary dark:text-text-secondary-dark">
              {conflict.details}
            </p>
          </div>
        );
      })}
    </div>
  );
}
