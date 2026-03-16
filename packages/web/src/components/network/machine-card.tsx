import type { Machine } from "../../hooks/use-machines.js";
import type { PortMapEntry } from "../../hooks/use-port-map.js";

interface MachineCardProps {
  machine: Machine;
  ports: PortMapEntry[];
}

export function MachineCard({ machine, ports }: MachineCardProps) {
  const greenCount = ports.filter((p) => p.liveStatus === "green").length;
  const yellowCount = ports.filter((p) => p.liveStatus === "yellow").length;
  const redCount = ports.filter((p) => p.liveStatus === "red").length;

  return (
    <div className="bg-surface-elevated dark:bg-surface-elevated-dark rounded-lg border border-warm-gray/15 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm">{machine.hostname}</h3>
          {machine.tailnetIp && (
            <p className="text-xs text-text-muted dark:text-text-muted-dark font-mono">
              {machine.tailnetIp}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-text-muted dark:text-text-muted-dark">
          {machine.os && <span>{machine.os}</span>}
          {machine.arch && <span>/ {machine.arch}</span>}
        </div>
      </div>

      {/* Status summary */}
      <div className="flex items-center gap-3 mb-3 text-xs">
        {greenCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sage inline-block" />
            {greenCount}
          </span>
        )}
        {yellowCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gold-status inline-block" />
            {yellowCount}
          </span>
        )}
        {redCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rust inline-block" />
            {redCount}
          </span>
        )}
        {ports.length === 0 && (
          <span className="text-text-muted dark:text-text-muted-dark">No ports</span>
        )}
      </div>

      {/* Port list */}
      {ports.length > 0 && (
        <div className="space-y-1">
          {ports.map((port) => (
            <div
              key={`${port.port}:${port.protocol}`}
              className="flex items-center justify-between text-xs py-0.5"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono w-12 text-right">{port.port}</span>
                <span className="text-text-secondary dark:text-text-secondary-dark">
                  {port.serviceName ?? port.processName ?? "unknown"}
                </span>
              </div>
              {port.projectSlug && (
                <span className="font-mono text-text-muted dark:text-text-muted-dark">
                  {port.projectSlug}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
