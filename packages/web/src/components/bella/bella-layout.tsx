import type { ReactNode } from "react";

interface BellaLayoutProps {
  children: ReactNode;
  onExplorerToggle: () => void;
}

export function BellaLayout({ children, onExplorerToggle }: BellaLayoutProps) {
  return (
    <div className="grain bg-ambient bg-surface dark:bg-surface-dark text-text-primary dark:text-text-primary-dark font-sans min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-warm-gray/10 dark:border-warm-gray/5">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="font-display italic text-xl tracking-tight hover:opacity-70 transition-opacity"
            >
              Mission Control
            </a>
            <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-terracotta/10 text-terracotta">
              Bella
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onExplorerToggle}
              className="text-xs text-text-muted dark:text-text-muted-dark hover:text-text-secondary dark:hover:text-text-secondary-dark transition-colors"
            >
              API Explorer
            </button>
            <a
              href="/"
              className="text-xs text-text-muted dark:text-text-muted-dark hover:text-text-secondary dark:hover:text-text-secondary-dark transition-colors"
            >
              Dashboard
            </a>
          </div>
        </div>
      </header>

      {/* Main content fills remaining height */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        {children}
      </div>
    </div>
  );
}
