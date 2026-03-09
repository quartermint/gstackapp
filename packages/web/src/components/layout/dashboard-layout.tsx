import type { ReactNode } from "react";
import { ThemeToggle } from "../ui/theme-toggle.js";
import { TriageBadge } from "../triage/triage-badge.js";

interface DashboardLayoutProps {
  children: ReactNode;
  healthOk: boolean;
  theme: "light" | "dark";
  onThemeToggle: () => void;
  staleCount?: number;
  onTriageClick?: () => void;
}

export function DashboardLayout({
  children,
  healthOk,
  theme,
  onThemeToggle,
  staleCount,
  onTriageClick,
}: DashboardLayoutProps) {
  return (
    <div className="bg-surface dark:bg-surface-dark text-text-primary dark:text-text-primary-dark font-sans min-h-screen">
      <header className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
          <span
            className="flex items-center gap-1.5 text-xs text-text-muted dark:text-text-muted-dark"
            title={healthOk ? "API healthy" : "API unreachable"}
          >
            <span
              className={`w-2 h-2 rounded-full inline-block ${
                healthOk ? "bg-sage" : "bg-rust"
              }`}
            />
          </span>
        </div>
        <div className="flex items-center gap-3">
          {staleCount !== undefined && onTriageClick && (
            <TriageBadge count={staleCount} onClick={onTriageClick} />
          )}
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {children}
      </main>
    </div>
  );
}
