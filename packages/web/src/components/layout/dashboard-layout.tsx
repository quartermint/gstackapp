import type { ReactNode } from "react";
import { ThemeToggle } from "../ui/theme-toggle.js";
import { TriageBadge } from "../triage/triage-badge.js";
import { HealthPanel } from "../health/health-panel.js";
import type { SystemHealth } from "../../hooks/use-health.js";

type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unreachable";

const HEALTH_DOT_COLORS: Record<HealthStatus, string> = {
  healthy: "bg-sage",
  degraded: "bg-amber-500",
  unhealthy: "bg-rust",
  unreachable: "bg-rust",
};

interface DashboardLayoutProps {
  children: ReactNode;
  healthOk: boolean;
  theme: "light" | "dark";
  onThemeToggle: () => void;
  staleCount?: number;
  onTriageClick?: () => void;
  healthStatus?: HealthStatus;
  onHealthClick?: () => void;
  healthPanelOpen?: boolean;
  healthData?: SystemHealth | null;
  onHealthPanelClose?: () => void;
}

export function DashboardLayout({
  children,
  healthOk,
  theme,
  onThemeToggle,
  staleCount,
  onTriageClick,
  healthStatus,
  onHealthClick,
  healthPanelOpen,
  healthData,
  onHealthPanelClose,
}: DashboardLayoutProps) {
  // Determine dot color: prefer healthStatus if provided, fall back to healthOk
  const dotColor = healthStatus
    ? HEALTH_DOT_COLORS[healthStatus]
    : healthOk
      ? "bg-sage"
      : "bg-rust";

  const dotTitle = healthStatus
    ? `System ${healthStatus}`
    : healthOk
      ? "API healthy"
      : "API unreachable";

  return (
    <div className="bg-surface dark:bg-surface-dark text-text-primary dark:text-text-primary-dark font-sans min-h-screen">
      <header className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
          <div className="relative">
            <button
              type="button"
              onClick={onHealthClick}
              className="flex items-center gap-1.5 text-xs text-text-muted dark:text-text-muted-dark hover:opacity-80 transition-opacity"
              title={dotTitle}
            >
              <span
                className={`w-2 h-2 rounded-full inline-block ${dotColor}`}
              />
            </button>
            {/* Health panel dropdown */}
            {healthPanelOpen && healthData && onHealthPanelClose && (
              <HealthPanel health={healthData} onClose={onHealthPanelClose} />
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {staleCount !== undefined && onTriageClick && (
            <TriageBadge count={staleCount} onClick={onTriageClick} />
          )}
          <span className="text-[10px] font-mono text-text-muted dark:text-text-muted-dark opacity-50">
            {__COMMIT_HASH__}
          </span>
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {children}
      </main>
    </div>
  );
}
