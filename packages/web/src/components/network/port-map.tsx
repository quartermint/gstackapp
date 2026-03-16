import type { PortMapEntry } from "../../hooks/use-port-map.js";

const STATUS_DOTS: Record<string, { color: string; label: string }> = {
  green: { color: "bg-sage", label: "Matched" },
  yellow: { color: "bg-gold-status", label: "Unregistered" },
  red: { color: "bg-rust", label: "Down" },
};

interface PortMapProps {
  portMap: PortMapEntry[];
  loading: boolean;
}

export function PortMap({ portMap, loading }: PortMapProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 bg-surface-warm dark:bg-surface-warm-dark rounded" />
        ))}
      </div>
    );
  }

  if (portMap.length === 0) {
    return (
      <p className="text-text-muted dark:text-text-muted-dark text-sm py-4">
        No port data available. Run the seed script or wait for a portwatch scan.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-warm-gray/20 text-left text-text-muted dark:text-text-muted-dark">
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Port</th>
            <th className="py-2 pr-3 font-medium">Machine</th>
            <th className="py-2 pr-3 font-medium">Service</th>
            <th className="py-2 pr-3 font-medium">Project</th>
            <th className="py-2 pr-3 font-medium">Process</th>
            <th className="py-2 font-medium">PID</th>
          </tr>
        </thead>
        <tbody>
          {portMap.map((entry) => {
            const fallback = { color: "bg-rust", label: "Unknown" };
            const status = STATUS_DOTS[entry.liveStatus] ?? fallback;
            return (
              <tr
                key={`${entry.machineId}:${entry.port}:${entry.protocol}`}
                className="border-b border-warm-gray/10 hover:bg-surface-warm/50 dark:hover:bg-surface-warm-dark/50 transition-colors"
              >
                <td className="py-2 pr-3">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${status.color}`}
                    title={status.label}
                  />
                </td>
                <td className="py-2 pr-3 font-mono">{entry.port}</td>
                <td className="py-2 pr-3">{entry.machineHostname}</td>
                <td className="py-2 pr-3">
                  {entry.serviceName ?? (
                    <span className="text-text-muted dark:text-text-muted-dark italic">
                      unregistered
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {entry.projectSlug ? (
                    <span className="font-mono text-xs bg-surface-warm dark:bg-surface-warm-dark px-1.5 py-0.5 rounded">
                      {entry.projectSlug}
                    </span>
                  ) : (
                    <span className="text-text-muted dark:text-text-muted-dark">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-text-secondary dark:text-text-secondary-dark">
                  {entry.processName ?? "—"}
                </td>
                <td className="py-2 text-text-muted dark:text-text-muted-dark font-mono text-xs">
                  {entry.pid ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
