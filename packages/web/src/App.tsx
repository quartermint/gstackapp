import { useState, useEffect } from 'react'
import { Shell } from './components/layout/Shell'
import { PipelineHero } from './components/pipeline/PipelineHero'
import { useSSEQuerySync } from './hooks/useSSEQuerySync'
import { PRFeed } from './components/feed/PRFeed'
import { PRDetail } from './components/feed/PRDetail'
import { useOnboardingStatus } from './hooks/useOnboardingStatus'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'

export function App() {
  useSSEQuerySync()
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)

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

  return (
    <Shell>
      {showWizard ? (
        <OnboardingWizard status={status} onDismiss={handleDismiss} />
      ) : (
        <>
          <PipelineHero />

          {/* Feed + Detail split view */}
          <div className="flex flex-1 overflow-hidden">
            {/* PR Feed — fixed width when detail is open, full width otherwise */}
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

            {/* PR Detail — appears when a card is selected */}
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
