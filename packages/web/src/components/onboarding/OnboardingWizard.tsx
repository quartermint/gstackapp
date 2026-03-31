import type { OnboardingStatus } from '../../hooks/useOnboardingStatus'
import { StepInstallApp } from './StepInstallApp'
import { StepSelectRepos } from './StepSelectRepos'
import { StepFirstReview } from './StepFirstReview'
import { cn } from '../../lib/cn'

interface OnboardingWizardProps {
  status: OnboardingStatus
  onDismiss: () => void
}

const STEPS = ['install', 'select-repos', 'first-review'] as const
type WizardStep = (typeof STEPS)[number]

const STEP_INDEX: Record<WizardStep, number> = {
  'install': 0,
  'select-repos': 1,
  'first-review': 2,
}

/**
 * Multi-step onboarding wizard container.
 *
 * Per D-02: walks through install app -> select repos -> first review.
 * Renders inside Shell so the sidebar remains visible for spatial context.
 * Includes step indicator dots and a skip/dismiss button.
 *
 * localStorage key: gstackapp:onboarding-dismissed
 */
export function OnboardingWizard({ status, onDismiss }: OnboardingWizardProps) {
  const currentStep = status.step as WizardStep
  const currentIndex = STEP_INDEX[currentStep] ?? 0

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar: step indicator + skip button */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-border">
        {/* Step indicator dots */}
        <div className="flex items-center gap-3">
          {STEPS.map((step, i) => {
            const isCompleted = i < currentIndex
            const isCurrent = i === currentIndex

            return (
              <div key={step} className="flex items-center gap-3">
                {i > 0 && (
                  <div
                    className={cn(
                      'w-8 h-px',
                      isCompleted ? 'bg-accent' : 'bg-border'
                    )}
                  />
                )}
                <div
                  className={cn(
                    'w-3 h-3 rounded-full transition-all duration-300',
                    isCompleted && 'bg-accent',
                    isCurrent && 'bg-accent shadow-[0_0_8px_rgba(198,255,59,0.5)]',
                    !isCompleted && !isCurrent && 'border border-border bg-transparent'
                  )}
                />
              </div>
            )
          })}
        </div>

        {/* Skip setup button */}
        <button
          onClick={onDismiss}
          className="font-body text-text-muted text-sm hover:text-text-primary transition-colors duration-150"
        >
          Skip setup
        </button>
      </div>

      {/* Step content area with CSS transitions */}
      <div className="flex-1 flex items-center justify-center px-8 py-12 overflow-y-auto">
        <div
          key={currentStep}
          className="w-full animate-[fadeIn_300ms_ease-out]"
          style={{
            animation: 'fadeIn 300ms ease-out',
          }}
        >
          {currentStep === 'install' && (
            <StepInstallApp githubAppUrl={status.githubAppUrl} />
          )}
          {currentStep === 'select-repos' && (
            <StepSelectRepos
              repoCount={status.repoCount}
              githubAppUrl={status.githubAppUrl}
            />
          )}
          {currentStep === 'first-review' && (
            <StepFirstReview
              pipelineCount={status.pipelineCount}
              onComplete={onDismiss}
            />
          )}
        </div>
      </div>
    </div>
  )
}
