import type { PortMapEntry } from "../../hooks/use-port-map.js";

interface PortRange {
  name: string;
  startPort: number;
  endPort: number;
}

interface RangeVisualizationProps {
  portMap: PortMapEntry[];
}

const CONVENTION_RANGES: PortRange[] = [
  { name: "Web Apps (Production/Next.js)", startPort: 3000, endPort: 3099 },
  { name: "Vite Dev Servers", startPort: 5170, endPort: 5199 },
  { name: "Python APIs", startPort: 8000, endPort: 8099 },
  { name: "Utility APIs", startPort: 8700, endPort: 8799 },
  { name: "Infrastructure/MCP", startPort: 11200, endPort: 11299 },
];

export function RangeVisualization({ portMap }: RangeVisualizationProps) {
  return (
    <div className="space-y-4">
      {CONVENTION_RANGES.map((range) => {
        const total = range.endPort - range.startPort + 1;
        const usedPorts = portMap.filter(
          (p) => p.port >= range.startPort && p.port <= range.endPort
        );
        const used = usedPorts.length;
        const pct = Math.round((used / total) * 100);

        return (
          <div key={range.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{range.name}</span>
              <span className="text-xs text-text-muted dark:text-text-muted-dark font-mono">
                {used}/{total} ({pct}%)
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-text-muted dark:text-text-muted-dark mb-1.5">
              <span className="font-mono">{range.startPort}</span>
              <span>-</span>
              <span className="font-mono">{range.endPort}</span>
            </div>
            <div className="h-3 bg-surface-warm dark:bg-surface-warm-dark rounded-full overflow-hidden">
              <div
                className="h-full bg-terracotta rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {usedPorts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {usedPorts.map((p) => (
                  <span
                    key={`${p.machineId}:${p.port}`}
                    className="text-[10px] font-mono bg-surface-elevated dark:bg-surface-elevated-dark px-1.5 py-0.5 rounded border border-warm-gray/10"
                    title={`${p.serviceName ?? p.processName ?? "?"} on ${p.machineHostname}`}
                  >
                    {p.port}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
