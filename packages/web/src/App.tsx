import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Shell } from './components/layout/Shell'
import type { AppView } from './components/layout/Sidebar'
import { PipelineHero } from './components/pipeline/PipelineHero'
import { useSSEQuerySync } from './hooks/useSSEQuerySync'
import { PRFeed } from './components/feed/PRFeed'
import { PRDetail } from './components/feed/PRDetail'
import { useOnboardingStatus } from './hooks/useOnboardingStatus'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { TrendsView } from './components/trends/TrendsView'
import { IdeationView } from './components/ideation/IdeationView'
import { AutonomousView } from './components/autonomous/AutonomousView'
import { RepoScaffoldForm } from './components/ideation/RepoScaffoldForm'
import { OperatorHome } from './components/operator/OperatorHome'
import { ProjectOverview } from './components/power/ProjectOverview'
import { TopologyView } from './components/power/TopologyView'
import { IdeationWorkspace } from './components/power/IdeationWorkspace'
import { LoginPage } from './components/auth/LoginPage'
import { useSessionTabs } from './hooks/useSessionTabs'
import { useDecisionGates } from './hooks/useDecisionGates'
// Simple ID generator — avoids nanoid dependency
const genId = () => Math.random().toString(36).slice(2, 10)

interface AuthMe {
  user: { id: string; email: string; role: 'admin' | 'operator' }
}

export function App() {
  useSSEQuerySync()

  // Auth check: GET /api/auth/me — returns user or 401
  const { data: authData, isLoading: authLoading } = useQuery<AuthMe | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me')
      if (res.status === 401) return null
      if (!res.ok) return null
      return res.json()
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min
  })

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [view, setView] = useState<AppView>('dashboard')

  // Multi-tab session management
  const {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    setActiveTab,
    updateTabStatus,
    maxReached,
  } = useSessionTabs()

  // Autonomous execution state
  const [autonomousProjectPath, setAutonomousProjectPath] = useState<string | null>(null)
  const [autonomousIdeationId, setAutonomousIdeationId] = useState<string | null>(null)
  const [autonomousRunId, setAutonomousRunId] = useState<string | null>(null)

  // Decision gates (shared across autonomous sessions)
  const { gates: decisionGates, respondToGate } = useDecisionGates(autonomousRunId)

  // Scaffold form state
  const [showScaffoldForm, setShowScaffoldForm] = useState(false)
  const [scaffoldContext, setScaffoldContext] = useState<{
    name?: string
    description?: string
    stack?: string
    excerpt?: string
    sessionId?: string
  } | null>(null)

  // Onboarding state
  const { data: status, isLoading: onboardingLoading } = useOnboardingStatus()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('gstackapp:onboarding-dismissed') === 'true'
  )

  // Auto-dismiss when onboarding completes
  useEffect(() => {
    if (status?.step === 'complete') {
      setDismissed(true)
    }
  }, [status?.step])

  const handleDismiss = () => {
    localStorage.setItem('gstackapp:onboarding-dismissed', 'true')
    setDismissed(true)
  }

  // Show wizard when not complete, not dismissed, and not still loading
  const showWizard =
    !onboardingLoading && status && status.step !== 'complete' && !dismissed

  // ── Flow handlers ────────────────────────────────────────────────────────

  const handleLaunchExecution = useCallback(
    (sessionId: string) => {
      setAutonomousIdeationId(sessionId)
      // Open scaffold form — idea-first flow needs a repo
      setScaffoldContext({ sessionId })
      setShowScaffoldForm(true)
    },
    []
  )

  const handleScaffoldComplete = useCallback(
    (result: { path: string; filesCreated: string[] }) => {
      setAutonomousProjectPath(result.path)
      // Create new autonomous tab
      const tabId = genId()
      addTab({
        id: tabId,
        title: result.path.split('/').pop() ?? 'Autonomous',
        projectPath: result.path,
        type: 'autonomous',
      })
      setView('autonomous')
    },
    [addTab]
  )

  const handleExecutionComplete = useCallback(() => {
    // Update active tab status to idle
    if (activeTabId) {
      updateTabStatus(activeTabId, 'idle')
    }
  }, [activeTabId, updateTabStatus])

  const handleNewTab = useCallback(() => {
    const tabId = genId()
    addTab({
      id: tabId,
      title: 'New Idea',
      type: 'ideation',
    })
    setView('ideation')
  }, [addTab])

  const handleDecideGate = useCallback(
    (gateId: string, optionId: string) => {
      respondToGate(gateId, optionId)
    },
    [respondToGate]
  )

  // ── Content rendering ────────────────────────────────────────────────────

  const renderContent = () => {
    // Auth loading state
    if (authLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="font-body text-sm text-text-muted">Loading...</p>
        </div>
      )
    }

    // Unauthenticated: show login page
    if (!authData?.user) {
      return <LoginPage />
    }

    // Operator role: show operator home
    if (authData.user.role === 'operator') {
      return <OperatorHome />
    }

    // Admin flow: existing dashboard behavior
    if (showWizard) {
      return <OnboardingWizard status={status} onDismiss={handleDismiss} />
    }

    switch (view) {
      case 'trends':
        return <TrendsView />

      case 'ideation':
        return <IdeationWorkspace onLaunchExecution={handleLaunchExecution} />

      case 'autonomous':
        return autonomousProjectPath ? (
          <AutonomousView
            projectPath={autonomousProjectPath}
            ideationSessionId={autonomousIdeationId ?? undefined}
            onComplete={handleExecutionComplete}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="font-display text-lg font-semibold text-text-primary mb-2">
                No Active Execution
              </h2>
              <p className="font-body text-sm text-text-muted">
                Start from Ideation to launch an autonomous execution pipeline.
              </p>
            </div>
          </div>
        )

      case 'topology':
        return <TopologyView />

      case 'knowledge':
      case 'intelligence':
        return (
          <div className="p-8">
            <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
              Coming in Plan 03
            </span>
          </div>
        )

      case 'repos':
        return (
          <>
            <PipelineHero />
            <div className="flex flex-1 overflow-hidden">
              <div
                className={
                  selectedPipelineId
                    ? 'w-[360px] shrink-0 border-r border-border overflow-y-auto'
                    : 'flex-1 overflow-y-auto'
                }
              >
                <PRFeed
                  selectedId={selectedPipelineId}
                  onSelect={setSelectedPipelineId}
                />
              </div>
              {selectedPipelineId && (
                <PRDetail
                  pipelineId={selectedPipelineId}
                  onClose={() => setSelectedPipelineId(null)}
                />
              )}
            </div>
          </>
        )

      default:
        return <ProjectOverview />
    }
  }

  return (
    <>
      <Shell
        activeView={view}
        onNavigate={setView}
        role={authData?.user?.role}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTab}
        onCloseTab={removeTab}
        onNewTab={handleNewTab}
        maxTabsReached={maxReached}
        decisionGates={decisionGates}
        onDecideGate={handleDecideGate}
      >
        {renderContent()}
      </Shell>

      {/* Scaffold modal overlay */}
      {showScaffoldForm && (
        <RepoScaffoldForm
          ideationContext={scaffoldContext ?? undefined}
          onScaffold={handleScaffoldComplete}
          onClose={() => setShowScaffoldForm(false)}
        />
      )}
    </>
  )
}
