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

export function App() {
  useSSEQuerySync()
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [view, setView] = useState<AppView>('dashboard')
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

  // Show wizard when not complete, not dismissed, and not still loading
  const showWizard =
    !onboardingLoading && status && status.step !== 'complete' && !dismissed

  return (
    <Shell
      activeView={view}
      onNavigate={setView}
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={handleSelectSession}
      onNewSession={handleNewSession}
    >
      {showWizard ? (
        <OnboardingWizard status={status} onDismiss={handleDismiss} />
      ) : view === 'session' ? (
        <SessionView
          sessionId={activeSessionId}
          onSessionCreated={handleSessionCreated}
        />
      ) : view === 'repos' ? (
        <ReposView />
      ) : view === 'trends' ? (
        <TrendsView />
      ) : (
        <>
          <PipelineHero selectedPipelineId={selectedPipelineId} />

          {/* Feed + Detail split view */}
          <div className="flex flex-1 overflow-hidden">
            {/* PR Feed -- fixed width when detail is open, full width otherwise */}
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

            {/* PR Detail -- appears when a card is selected */}
            {selectedPipelineId && (
              <PRDetail
                pipelineId={selectedPipelineId}
                onClose={() => setSelectedPipelineId(null)}
              />
            )}
          </div>
        </>
      )}
    </Shell>
  )
}
