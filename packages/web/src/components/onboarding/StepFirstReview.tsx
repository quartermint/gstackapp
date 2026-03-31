import { useState, useEffect } from 'react'
import { PipelineHero } from '../pipeline/PipelineHero'

type FailurePreference = 'retry-flag' | 'retry-skip' | 'fail-fast'

interface StepFirstReviewProps {
  pipelineCount: number
  onComplete: () => void
}

const PREFERENCE_KEY = 'gstackapp:failure-preference'

const PREFERENCE_OPTIONS: Array<{
  value: FailurePreference
  label: string
  description: string
}> = [
  {
    value: 'retry-flag',
    label: 'Retry + FLAG',
    description: 'Retry failed stages, flag results for human review. Best for most teams.',
  },
  {
    value: 'retry-skip',
    label: 'Retry + SKIP',
    description: 'Retry failed stages, skip if retry fails. Keeps pipeline moving.',
  },
  {
    value: 'fail-fast',
    label: 'Fail Fast',
    description: 'Stop the pipeline on first stage failure. Strictest quality gate.',
  },
]

/**
 * Onboarding Step 3: Trigger first review.
 *
 * Per D-03: when a pipeline exists, show the REAL PipelineHero component
 * so the user sees their actual review running, not dummy data.
 * Per D-04: capture failure handling preference.
 */
export function StepFirstReview({ pipelineCount, onComplete }: StepFirstReviewProps) {
  const [failurePreference, setFailurePreference] = useState<FailurePreference>(() => {
    const stored = localStorage.getItem(PREFERENCE_KEY)
    return (stored as FailurePreference) || 'retry-flag'
  })

  // Persist preference to localStorage on change
  useEffect(() => {
    localStorage.setItem(PREFERENCE_KEY, failurePreference)
  }, [failurePreference])

  // Show real pipeline when one exists (per D-03)
  if (pipelineCount > 0) {
    return (
      <div className="flex flex-col items-center w-full">
        <PipelineHero />

        <button
          onClick={onComplete}
          className="mt-6 px-6 py-3 rounded-[--radius-md] bg-accent text-background font-body font-medium text-[15px] hover:bg-accent-hover transition-colors duration-150"
        >
          Go to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center text-center max-w-lg mx-auto">
      <div className="w-14 h-14 rounded-[--radius-lg] bg-accent-muted flex items-center justify-center mb-6">
        <svg
          className="w-7 h-7 text-accent"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
          />
        </svg>
      </div>

      <h2 className="font-display text-2xl font-semibold text-text-primary tracking-[-0.02em] mb-3">
        Trigger Your First Review
      </h2>

      <p className="font-body text-text-muted text-[15px] leading-relaxed mb-6">
        Open a pull request on a connected repository to see the pipeline in action.
      </p>

      {/* How to trigger instructions */}
      <div className="text-left w-full bg-surface rounded-[--radius-md] border border-border p-5 mb-8">
        <p className="font-body text-text-primary text-sm font-medium mb-3">How to trigger a review:</p>
        <ul className="space-y-2">
          <li className="flex items-start gap-2.5">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            <span className="font-body text-text-muted text-sm">
              Open a new pull request on any connected repository
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            <span className="font-body text-text-muted text-sm">
              Push a new commit to an existing pull request
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            <span className="font-body text-text-muted text-sm">
              The five-stage cognitive pipeline will start automatically
            </span>
          </li>
        </ul>
      </div>

      {/* Failure handling preference (D-04) */}
      <div className="w-full text-left">
        <p className="font-body text-text-primary text-sm font-medium mb-3">
          Stage failure handling
        </p>
        <div className="space-y-2">
          {PREFERENCE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-[--radius-md] border cursor-pointer transition-colors duration-150 ${
                failurePreference === opt.value
                  ? 'border-accent bg-accent-dim'
                  : 'border-border hover:border-border-focus'
              }`}
            >
              <input
                type="radio"
                name="failure-preference"
                value={opt.value}
                checked={failurePreference === opt.value}
                onChange={() => setFailurePreference(opt.value)}
                className="mt-0.5 accent-accent"
              />
              <div>
                <span className="font-body text-text-primary text-sm font-medium">
                  {opt.label}
                </span>
                <p className="font-body text-text-muted text-xs mt-0.5">
                  {opt.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Waiting indicator */}
      <div className="flex items-center gap-2 text-text-muted text-sm mt-8">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        Waiting for first pull request...
      </div>
    </div>
  )
}
