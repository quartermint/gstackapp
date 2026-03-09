import { useState, useEffect, useRef, useCallback } from "react";
import "./app.css";
import { useProjects } from "./hooks/use-projects.js";
import { useProjectDetail } from "./hooks/use-project-detail.js";
import { useTheme } from "./hooks/use-theme.js";
import { useCaptureSubmit } from "./hooks/use-capture-submit.js";
import { useCaptures, useUnlinkedCaptures, useCaptureCounts } from "./hooks/use-captures.js";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts.js";
import { DashboardLayout } from "./components/layout/dashboard-layout.js";
import { HeroCard } from "./components/hero/hero-card.js";
import { DepartureBoard } from "./components/departure-board/departure-board.js";
import { CaptureField } from "./components/capture/capture-field.js";
import { CommandPalette } from "./components/command-palette/command-palette.js";
import { LooseThoughts } from "./components/loose-thoughts/loose-thoughts.js";
import { HeroSkeleton, BoardSkeleton } from "./components/ui/loading-skeleton.js";

export function App() {
  const { theme, toggle } = useTheme();
  const { groups, loading, error } = useProjects();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const { detail, loading: detailLoading } = useProjectDetail(selectedSlug);
  const [healthOk, setHealthOk] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const captureFieldRef = useRef<HTMLTextAreaElement>(null);

  // Capture data for dashboard integration
  const { captures: heroCaptures, refetch: refetchHeroCaptures } = useCaptures(detail?.slug ?? undefined);
  const { captures: unlinkedCaptures, refetch: refetchUnlinked } = useUnlinkedCaptures();
  const { counts: captureCounts, refetch: refetchCounts } = useCaptureCounts();

  // Callback when captures change (submission or correction)
  const handleCapturesChanged = useCallback(() => {
    refetchHeroCaptures();
    refetchUnlinked();
    refetchCounts();
  }, [refetchHeroCaptures, refetchUnlinked, refetchCounts]);

  // Capture submission with refetch on success
  const { submit, isPending } = useCaptureSubmit(handleCapturesChanged);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onCmdK: () => setPaletteOpen(true),
    onSlash: () => captureFieldRef.current?.focus(),
    onEscape: () => {
      if (paletteOpen) {
        setPaletteOpen(false);
      } else {
        captureFieldRef.current?.blur();
      }
    },
  });

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

  // Flatten all projects for command palette
  const allProjects = groups
    ? [...groups.active, ...groups.idle, ...groups.stale]
    : [];

  return (
    <DashboardLayout
      healthOk={healthOk}
      theme={theme}
      onThemeToggle={toggle}
    >
      {/* Capture field -- always visible at top */}
      <CaptureField
        onSubmit={submit}
        isPending={isPending}
        inputRef={captureFieldRef}
      />

      {/* Spacing between capture field and hero */}
      <div className="mb-4" />

      {/* Hero card */}
      {loading ? (
        <HeroSkeleton />
      ) : (
        <HeroCard
          detail={detail}
          loading={detailLoading}
          captures={heroCaptures}
          projects={allProjects}
          onCapturesCorrected={handleCapturesChanged}
        />
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
            captureCounts={captureCounts}
          />
        )
      )}

      {/* Loose thoughts -- unlinked captures below departure board */}
      {!loading && unlinkedCaptures.length > 0 && (
        <LooseThoughts
          captures={unlinkedCaptures}
          projects={allProjects}
          onCorrected={handleCapturesChanged}
        />
      )}

      {/* Error banner */}
      {error && <ErrorBanner message={error} />}

      {/* Empty state */}
      {!loading && groups && totalProjects === 0 && <EmptyState />}

      {/* Command palette (fixed overlay) */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        projects={allProjects}
        onCaptureSubmit={submit}
        onProjectSelect={setSelectedSlug}
      />
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
