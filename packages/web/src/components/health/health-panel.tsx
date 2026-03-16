import { useEffect, useRef } from "react";
import type { SystemHealth } from "../../hooks/use-health.js";
import { useLmStudio } from "../../hooks/use-lm-studio.js";
import type { LmStudioHealth } from "../../hooks/use-lm-studio.js";

interface HealthPanelProps {
  health: SystemHealth;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  up: "bg-sage",
  down: "bg-rust",
  unknown: "bg-amber-500",
};

const LM_HEALTH_COLORS: Record<LmStudioHealth, string> = {
  ready: "bg-sage",
  loading: "bg-amber-500",
  unavailable: "bg-rust",
};

const LM_HEALTH_LABELS: Record<LmStudioHealth, string> = {
  ready: "Ready",
  loading: "Loading...",
  unavailable: "Offline",
};

/**
 * Format uptime seconds into a human-readable string like "3d 14h".
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Expandable health details panel anchored below the health dot in the header.
 * Shows CPU, memory, disk, uptime, and per-service status.
 * Dismisses on click outside or Escape key.
 */
export function HealthPanel({ health, onClose }: HealthPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { status: lmStatus } = useLmStudio();

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay adding the listener to avoid the triggering click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-0 mt-1 w-72 bg-surface dark:bg-surface-dark border border-black/10 dark:border-white/10 rounded-lg shadow-lg p-4 z-50"
    >
      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted-dark mb-3">
        System Health
      </h4>

      {/* CPU */}
      <div className="mb-3">
        <div className="text-xs font-medium text-text-secondary dark:text-text-secondary-dark mb-1">
          CPU
        </div>
        <div className="text-xs text-text-muted dark:text-text-muted-dark space-y-0.5">
          <div className="flex justify-between">
            <span>Load (1m / 5m)</span>
            <span className="font-mono">
              {health.cpu.loadAvg1m.toFixed(2)} / {health.cpu.loadAvg5m.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Cores</span>
            <span className="font-mono">{health.cpu.cores}</span>
          </div>
        </div>
      </div>

      {/* Memory */}
      <div className="mb-3">
        <div className="text-xs font-medium text-text-secondary dark:text-text-secondary-dark mb-1">
          Memory
        </div>
        <div className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-terracotta rounded-full transition-all"
            style={{ width: `${Math.min(health.memory.usedPercent, 100)}%` }}
          />
        </div>
        <div className="text-xs text-text-muted dark:text-text-muted-dark flex justify-between">
          <span>
            {(health.memory.totalMB - health.memory.freeMB).toLocaleString()} /{" "}
            {health.memory.totalMB.toLocaleString()} MB
          </span>
          <span className="font-mono">{health.memory.usedPercent}%</span>
        </div>
      </div>

      {/* Disk */}
      <div className="mb-3">
        <div className="text-xs font-medium text-text-secondary dark:text-text-secondary-dark mb-1">
          Disk
        </div>
        <div className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-terracotta rounded-full transition-all"
            style={{ width: `${Math.min(health.disk.usedPercent, 100)}%` }}
          />
        </div>
        <div className="text-xs text-text-muted dark:text-text-muted-dark flex justify-between">
          <span>
            {health.disk.usedGB} / {health.disk.totalGB} GB
          </span>
          <span className="font-mono">{health.disk.usedPercent}%</span>
        </div>
      </div>

      {/* Uptime */}
      <div className="mb-3">
        <div className="text-xs font-medium text-text-secondary dark:text-text-secondary-dark mb-1">
          Uptime
        </div>
        <div className="text-xs text-text-muted dark:text-text-muted-dark font-mono">
          {formatUptime(health.uptime)}
        </div>
      </div>

      {/* LM Studio */}
      <div className="mb-3">
        <div className="text-xs font-medium text-text-secondary dark:text-text-secondary-dark mb-1">
          LM Studio
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted dark:text-text-muted-dark">
          <span
            className={`w-1.5 h-1.5 rounded-full inline-block ${
              lmStatus ? LM_HEALTH_COLORS[lmStatus.health] : "bg-rust"
            }`}
          />
          <span>{lmStatus ? LM_HEALTH_LABELS[lmStatus.health] : "Offline"}</span>
          {lmStatus?.modelId && (
            <span
              className="ml-auto font-mono opacity-70 truncate max-w-[140px]"
              title={lmStatus.modelId}
            >
              {lmStatus.modelId}
            </span>
          )}
        </div>
      </div>

      {/* Services */}
      <div>
        <div className="text-xs font-medium text-text-secondary dark:text-text-secondary-dark mb-1">
          Services
        </div>
        {health.services.length === 0 ? (
          <div className="text-xs text-text-muted dark:text-text-muted-dark italic">
            No services configured
          </div>
        ) : (
          <div className="space-y-1">
            {health.services.map((svc) => (
              <div
                key={svc.name}
                className="flex items-center gap-2 text-xs text-text-muted dark:text-text-muted-dark"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full inline-block ${STATUS_COLORS[svc.status] ?? "bg-amber-500"}`}
                />
                <span>{svc.name}</span>
                <span className="ml-auto font-mono opacity-70">{svc.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
