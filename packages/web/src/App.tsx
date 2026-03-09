import { useState, useEffect } from "react";
import "./app.css";
import { useProjects } from "./hooks/use-projects.js";
import { useProjectDetail } from "./hooks/use-project-detail.js";
import { useTheme } from "./hooks/use-theme.js";
import { DashboardLayout } from "./components/layout/dashboard-layout.js";
import { HeroCard } from "./components/hero/hero-card.js";
import { DepartureBoard } from "./components/departure-board/departure-board.js";
import { HeroSkeleton, BoardSkeleton } from "./components/ui/loading-skeleton.js";

export function App() {
  const { theme, toggle } = useTheme();
  const { groups, loading, error } = useProjects();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const { detail, loading: detailLoading } = useProjectDetail(selectedSlug);
  const [healthOk, setHealthOk] = useState(false);

  // Fetch health check
  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        setHealthOk(res.ok);
      })
      .catch(() => {
        setHealthOk(false);
      });
  }, []);

  // Auto-select most recently active project on initial load
  useEffect(() => {
    if (!groups || selectedSlug !== null) return;

    const firstProject =
      groups.active[0] ?? groups.idle[0] ?? groups.stale[0] ?? null;

    if (firstProject) {
      setSelectedSlug(firstProject.slug);
    }
  }, [groups, selectedSlug]);

  // Count total projects across all groups
  const totalProjects = groups
    ? groups.active.length + groups.idle.length + groups.stale.length
    : 0;

  return (
    <DashboardLayout
      healthOk={healthOk}
      theme={theme}
      onThemeToggle={toggle}
    >
      {/* Hero card */}
      {loading ? (
        <HeroSkeleton />
      ) : (
        <HeroCard detail={detail} loading={detailLoading} />
      )}

      {/* Spacing between hero and board */}
      <div className="mb-5 sm:mb-7" />

      {/* Departure board */}
      {loading ? (
        <BoardSkeleton />
      ) : (
        groups &&
        totalProjects > 0 && (
          <DepartureBoard
            groups={groups}
            selectedSlug={selectedSlug}
            onSelect={setSelectedSlug}
          />
        )
      )}

      {/* Error banner */}
      {error && <ErrorBanner message={error} />}

      {/* Empty state */}
      {!loading && groups && totalProjects === 0 && <EmptyState />}
    </DashboardLayout>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-rust/10 text-rust rounded-lg p-4 mt-4">
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs mt-1 opacity-70">
        Make sure the API server is running and try refreshing.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <p className="text-lg text-text-secondary dark:text-text-secondary-dark">
        No projects configured yet.
      </p>
      <p className="text-sm text-text-muted dark:text-text-muted-dark mt-2">
        Add projects to <span className="font-mono">mc.config.json</span> and
        restart the API.
      </p>
    </div>
  );
}
