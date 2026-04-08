import { useState, useEffect, useCallback } from 'react'
import { Shell } from './components/layout/Shell'
import type { AppView } from './components/layout/Sidebar'
import { PipelineHero } from './components/pipeline/PipelineHero'
import { useSSEQuerySync } from './hooks/useSSEQuerySync'
import { PRFeed } from './components/feed/PRFeed'
import { PRDetail } from './components/feed/PRDetail'
import { useOnboardingStatus } from './hooks/useOnboardingStatus'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { TrendsView } from './components/trends/TrendsView'
import { SessionView } from './components/session/SessionView'
import { useSessions, useCreateSession } from './hooks/useSession'
import { ReposView } from './components/repos/ReposView'
import { DashboardView } from './components/dashboard/DashboardView'
import { DesignDocBrowser } from './components/dashboard/DesignDocBrowser'
import type { ProjectState } from '@gstackapp/shared'

export function App() {
  useSSEQuerySync()
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [view, setView] = useState<AppView>('projects')
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  // Session data
  const { data: sessions } = useSessions()
  const createSession = useCreateSession()

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

  const handleNewSession = useCallback(() => {
    createSession.mutate({}, {
      onSuccess: (data) => {
        setActiveSessionId(data.session.id)
        setView('session')
      },
    })
  }, [createSession])

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id)
    setView('session')
  }, [])

  const handleSessionCreated = useCallback((id: string) => {
    setActiveSessionId(id)
  }, [])

  const handleProjectSelect = useCallback((_project: ProjectState) => {
    // When a project card is clicked, create a new session and navigate to it.
    // Session-project linking is Phase 12 territory; for now just start a session.
    handleNewSession()
  }, [handleNewSession])

  // Show wizard when not complete, not dismissed, and not still loading
  const showWizard =
    !onboardingLoading && status && status.step !== 'complete' && !dismissed

  const renderContent = () => {
    if (showWizard) {
      return <OnboardingWizard status={status} onDismiss={handleDismiss} />
    }

    switch (view) {
      case 'projects':
        return <DashboardView onSelectProject={handleProjectSelect} />
      case 'session':
        return (
          <SessionView
            sessionId={activeSessionId}
            onSessionCreated={handleSessionCreated}
          />
        )
      case 'repos':
        return <ReposView />
      case 'trends':
        return <TrendsView />
      case 'design-docs':
        return <DesignDocBrowser />
      case 'pr-reviews':
        return (
          <>
            <PipelineHero selectedPipelineId={selectedPipelineId} />
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
        return <DashboardView onSelectProject={handleProjectSelect} />
    }
  }

  return (
    <Shell
      activeView={view}
      onNavigate={setView}
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={handleSelectSession}
      onNewSession={handleNewSession}
    >
      {renderContent()}
    </Shell>
  )
}
