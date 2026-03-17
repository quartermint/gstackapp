import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import "./app.css";
import { useProjects } from "./hooks/use-projects.js";
import { useProjectDetail } from "./hooks/use-project-detail.js";
import { useTheme } from "./hooks/use-theme.js";
import { useCaptureSubmit } from "./hooks/use-capture-submit.js";
import { useCaptures, useUnlinkedCaptures, useCaptureCounts, useStaleCount } from "./hooks/use-captures.js";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts.js";
import { useHealth } from "./hooks/use-health.js";
import { useSSE } from "./hooks/use-sse.js";
import { useRisks } from "./hooks/use-risks.js";
import { useSessions, deriveSessionCounts } from "./hooks/use-sessions.js";
import { useBudget } from "./hooks/use-budget.js";
import { useConvergence, deriveConvergenceCounts } from "./hooks/use-convergence.js";
import { useDiscoveries, promoteDiscovery, dismissDiscovery } from "./hooks/use-discoveries.js";
import { useStars, updateStarIntent } from "./hooks/use-stars.js";
import { useSessionHistory } from "./hooks/use-session-history.js";
import { DashboardLayout } from "./components/layout/dashboard-layout.js";
import { NetworkPage } from "./components/network/network-page.js";
import { HeroCard } from "./components/hero/hero-card.js";
import { SprintTimeline } from "./components/sprint-timeline/sprint-timeline.js";
import { RiskFeed } from "./components/risk-feed/risk-feed.js";
import { DepartureBoard } from "./components/departure-board/departure-board.js";
import { CaptureField } from "./components/capture/capture-field.js";
import { CommandPalette } from "./components/command-palette/command-palette.js";
import { LooseThoughts } from "./components/loose-thoughts/loose-thoughts.js";
import { TriageView } from "./components/triage/triage-view.js";
import { HeroSkeleton, BoardSkeleton } from "./components/ui/loading-skeleton.js";
import { WhatsNewStrip } from "./components/whats-new/whats-new-strip.js";

type View = "dashboard" | "network";

export function App() {
  const { theme, toggle } = useTheme();
  const [view, setView] = useState<View>("dashboard");
  const { groups, loading, error, refetch: refetchProjects } = useProjects();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const { detail, loading: detailLoading } = useProjectDetail(selectedSlug);
  const { health, overallStatus } = useHealth();
  const [healthPanelOpen, setHealthPanelOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);
  const captureFieldRef = useRef<HTMLTextAreaElement>(null);

  const { captures: heroCaptures, refetch: refetchHeroCaptures } = useCaptures(detail?.slug ?? undefined);
  const { captures: unlinkedCaptures, refetch: refetchUnlinked } = useUnlinkedCaptures();
  const { counts: captureCounts, refetch: refetchCounts } = useCaptureCounts();
  const { count: staleCount } = useStaleCount();

  const handleCapturesChanged = useCallback(() => {
    refetchHeroCaptures();
    refetchUnlinked();
    refetchCounts();
  }, [refetchHeroCaptures, refetchUnlinked, refetchCounts]);

  const { submit, isPending } = useCaptureSubmit(handleCapturesChanged);

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

  const { data: risksData, loading: risksLoading, refetch: refetchRisks } = useRisks();
  const { sessions, loading: sessionsLoading, refetch: refetchSessions } = useSessions();
  const { budget, suggestion: budgetSuggestion, loading: budgetLoading, refetch: refetchBudget } = useBudget();
  const { convergences, refetch: refetchConvergence } = useConvergence();
  const { discoveries, refetch: refetchDiscoveries } = useDiscoveries();
  const { stars, refetch: refetchStars } = useStars();
  const { sessions: sessionHistory, refetch: refetchSessionHistory } = useSessionHistory();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sessionCounts = useMemo(() => deriveSessionCounts(sessions), [sessions]);
  const convergenceCounts = useMemo(() => deriveConvergenceCounts(convergences), [convergences]);

  // Compute set of slugs with diverged copies (for split-dot indicator)
  const divergedSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const f of [...(risksData?.critical ?? []), ...(risksData?.warning ?? [])]) {
      if (f.checkType === "diverged_copies") slugs.add(f.projectSlug);
    }
    return slugs;
  }, [risksData]);

  const handlePromote = useCallback(async (id: string) => {
    await promoteDiscovery(id);
    refetchDiscoveries();
    refetchProjects();
  }, [refetchDiscoveries, refetchProjects]);

  const handleDismiss = useCallback(async (id: string) => {
    await dismissDiscovery(id);
    refetchDiscoveries();
  }, [refetchDiscoveries]);

  const handleUpdateStarIntent = useCallback(async (githubId: number, intent: string) => {
    await updateStarIntent(githubId, intent);
    refetchStars();
  }, [refetchStars]);

  useSSE({
    onCaptureCreated: () => handleCapturesChanged(),
    onCaptureEnriched: () => handleCapturesChanged(),
    onCaptureArchived: () => handleCapturesChanged(),
    onScanComplete: () => {
      refetchProjects();
      refetchConvergence();
    },
    onHealthChanged: () => {
      refetchRisks();
      refetchProjects();
    },
    onSessionConflict: () => {
      refetchRisks();
      refetchSessions();
    },
    onSessionStarted: () => {
      refetchSessions();
      refetchBudget();
      refetchProjects();
      refetchSessionHistory();
    },
    onSessionStopped: () => {
      refetchSessions();
      refetchBudget();
      refetchProjects();
      refetchConvergence();
      refetchSessionHistory();
    },
    onConvergenceDetected: () => {
      refetchConvergence();
    },
    onDiscoveryFound: () => refetchDiscoveries(),
    onDiscoveryPromoted: () => { refetchDiscoveries(); refetchProjects(); },
    onDiscoveryDismissed: () => refetchDiscoveries(),
    onStarSynced: () => refetchStars(),
    onStarCategorized: () => refetchStars(),
  });

  // Document title: show risk count in browser tab
  useEffect(() => {
    const count = risksData?.riskCount ?? 0;
    document.title = count > 0 ? `(${count}) Mission Control` : "Mission Control";
  }, [risksData?.riskCount]);

  useEffect(() => {
    if (!groups || selectedSlug !== null) return;

    const firstProject =
      groups.active[0] ?? groups.idle[0] ?? groups.stale[0] ?? null;

    if (firstProject) {
      setSelectedSlug(firstProject.slug);
    }
  }, [groups, selectedSlug]);

  const totalProjects = groups
    ? groups.active.length + groups.idle.length + groups.stale.length
    : 0;

  const allProjects = groups
    ? [...groups.active, ...groups.idle, ...groups.stale]
    : [];

  const selectedDetail = detail
    ? { commits: detail.commits, gsdState: detail.gsdState }
    : null;

  return (
    <DashboardLayout
      healthOk={overallStatus === "healthy"}
      healthStatus={overallStatus}
      theme={theme}
      onThemeToggle={toggle}
      staleCount={staleCount}
      onTriageClick={() => setTriageOpen(true)}
      onHealthClick={() => setHealthPanelOpen((prev) => !prev)}
      healthPanelOpen={healthPanelOpen}
      healthData={health}
      onHealthPanelClose={() => setHealthPanelOpen(false)}
      sessions={sessions}
      sessionsLoading={sessionsLoading}
      budget={budget}
      budgetSuggestion={budgetSuggestion}
      view={view}
      onViewChange={setView}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen((prev) => !prev)}
      sessionHistory={sessionHistory}
    >
      {view === "network" ? (
        <NetworkPage />
      ) : (
        <>
          {/* Capture field */}
          <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
            <CaptureField
              onSubmit={submit}
              isPending={isPending}
              inputRef={captureFieldRef}
            />
          </div>

          {/* Risk feed */}
          <div className="mt-6 animate-fade-up" style={{ animationDelay: "140ms" }}>
            <RiskFeed data={risksData} loading={risksLoading} />
          </div>

          {/* Sprint timeline */}
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "200ms" }}>
            <SprintTimeline onSelect={setSelectedSlug} />
          </div>

          {/* What's New strip */}
          <div className="mt-6 animate-fade-up relative z-30" style={{ animationDelay: "230ms" }}>
            <WhatsNewStrip
              discoveries={discoveries}
              stars={stars}
              onPromote={handlePromote}
              onDismiss={handleDismiss}
              onUpdateStarIntent={handleUpdateStarIntent}
            />
          </div>

          {/* Hero card */}
          <div className="mt-8 animate-fade-up" style={{ animationDelay: "290ms" }}>
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
          </div>

          {/* Departure board */}
          <div className="mt-10 animate-fade-up" style={{ animationDelay: "350ms" }}>
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
                  sessionCounts={sessionCounts}
                  convergenceCounts={convergenceCounts}
                  selectedDetail={selectedDetail}
                  divergedSlugs={divergedSlugs}
                />
              )
            )}
          </div>

          {/* Loose thoughts */}
          {!loading && unlinkedCaptures.length > 0 && (
            <div className="mt-8 animate-fade-up" style={{ animationDelay: "410ms" }}>
              <LooseThoughts
                captures={unlinkedCaptures}
                projects={allProjects}
                onCorrected={handleCapturesChanged}
              />
            </div>
          )}

          {/* Error banner */}
          {error && <ErrorBanner message={error} />}

          {/* Empty state */}
          {!loading && groups && totalProjects === 0 && <EmptyState />}
        </>
      )}

      {/* Command palette */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        projects={allProjects}
        onCaptureSubmit={submit}
        onProjectSelect={setSelectedSlug}
      />

      {/* Triage view */}
      <TriageView
        open={triageOpen}
        onClose={() => setTriageOpen(false)}
        projects={allProjects}
      />
    </DashboardLayout>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rust/20 bg-rust/5 dark:bg-rust/10 p-4 mt-6">
      <p className="text-sm font-medium text-rust">{message}</p>
      <p className="text-xs mt-1 text-rust/60">
        Make sure the API server is running and try refreshing.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <p className="text-lg text-text-secondary dark:text-text-secondary-dark font-light">
        No projects configured yet.
      </p>
      <p className="text-sm text-text-muted dark:text-text-muted-dark mt-2">
        Add projects to <span className="font-mono text-xs">mc.config.json</span> and
        restart the API.
      </p>
    </div>
  );
}
