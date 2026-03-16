import { useMemo, type ReactNode } from "react";
import { ThemeToggle } from "../ui/theme-toggle.js";
import { TriageBadge } from "../triage/triage-badge.js";
import { HealthPanel } from "../health/health-panel.js";
import { SessionsIndicator } from "../sessions/sessions-indicator.js";
import type { SystemHealth } from "../../hooks/use-health.js";
import type { SessionItem } from "../../hooks/use-sessions.js";
import type { BudgetData, BudgetSuggestion } from "../../hooks/use-budget.js";

type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unreachable";

const HEALTH_DOT_COLORS: Record<HealthStatus, string> = {
  healthy: "bg-sage",
  degraded: "bg-amber-500",
  unhealthy: "bg-rust",
  unreachable: "bg-rust",
};

type View = "dashboard" | "network";

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
  sessions?: SessionItem[];
  sessionsLoading?: boolean;
  budget?: BudgetData | null;
  budgetSuggestion?: BudgetSuggestion | null;
  view?: View;
  onViewChange?: (view: View) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 17) return "Good afternoon.";
  return "Good evening.";
}

function getFormattedDate(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
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
  sessions,
  sessionsLoading,
  budget,
  budgetSuggestion,
  view = "dashboard",
  onViewChange,
}: DashboardLayoutProps) {
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

  const greeting = useMemo(() => getGreeting(), []);
  const formattedDate = useMemo(() => getFormattedDate(), []);

  return (
    <div className="grain bg-ambient bg-surface dark:bg-surface-dark text-text-primary dark:text-text-primary-dark font-sans min-h-screen">
      {/* Thin status bar header */}
      <header className="border-b border-warm-gray/10 dark:border-warm-gray/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          {/* Left: Logo + health */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onViewChange?.("dashboard")}
              className="font-display italic text-xl tracking-tight hover:opacity-70 transition-opacity"
            >
              Mission Control
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={onHealthClick}
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                title={dotTitle}
              >
                <span
                  className={`w-2 h-2 rounded-full inline-block ${dotColor} ${
                    healthStatus === "healthy" ? "animate-pulse" : ""
                  }`}
                  style={healthStatus === "healthy" ? { animationDuration: "3s" } : undefined}
                />
              </button>
              {healthPanelOpen && healthData && onHealthPanelClose && (
                <HealthPanel health={healthData} onClose={onHealthPanelClose} />
              )}
            </div>
            <div className="relative">
              <SessionsIndicator
                sessions={sessions ?? []}
                budget={budget ?? null}
                suggestion={budgetSuggestion ?? null}
                loading={sessionsLoading ?? true}
              />
            </div>
          </div>

          {/* Right: Nav + controls */}
          <div className="flex items-center gap-3">
            {onViewChange && (
              <nav className="flex items-center bg-surface-warm/60 dark:bg-surface-warm-dark/60 rounded-full p-0.5 mr-1">
                {(["dashboard", "network"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onViewChange(v)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                      view === v
                        ? "bg-surface-elevated dark:bg-surface-elevated-dark text-text-primary dark:text-text-primary-dark shadow-sm"
                        : "text-text-muted dark:text-text-muted-dark hover:text-text-secondary dark:hover:text-text-secondary-dark"
                    }`}
                  >
                    {v === "dashboard" ? "Dashboard" : "Network"}
                  </button>
                ))}
              </nav>
            )}
            {staleCount !== undefined && onTriageClick && (
              <TriageBadge count={staleCount} onClick={onTriageClick} />
            )}
            <span className="text-[9px] font-mono text-text-muted dark:text-text-muted-dark opacity-30 hidden sm:inline">
              {__COMMIT_HASH__}
            </span>
            <ThemeToggle theme={theme} onToggle={onThemeToggle} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8 pt-8 pb-16">
        {/* Greeting zone — only on dashboard view */}
        {view === "dashboard" && (
          <div
            className="flex items-baseline justify-between mb-7 animate-fade-up"
          >
            <h1 className="font-display italic text-3xl sm:text-4xl text-text-primary dark:text-text-primary-dark">
              {greeting}
            </h1>
            <time className="text-sm font-mono text-text-muted dark:text-text-muted-dark hidden sm:block">
              {formattedDate}
            </time>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
