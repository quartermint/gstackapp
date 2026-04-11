import { useState, useEffect } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface OperatorProgressBarProps {
  currentStage: 'thinking' | 'planning' | 'building' | 'checking' | 'done'
  statusMessage?: string
  startedAt?: string // ISO timestamp for elapsed time calculation
}

// ── Constants ────────────────────────────────────────────────────────────────

const STEPS = ['thinking', 'planning', 'building', 'checking', 'done'] as const

const STEP_LABELS: Record<string, string> = {
  thinking: 'Thinking',
  planning: 'Planning',
  building: 'Building',
  checking: 'Checking',
  done: 'Done',
}

const STATUS_MESSAGES: Record<string, string> = {
  thinking: 'Understanding your request...',
  planning: 'Planning the approach...',
  building: 'Building your request...',
  checking: 'Checking quality...',
  done: 'Complete',
}

/**
 * Maps harness stage names to operator-facing step names.
 */
export const STAGE_MAP: Record<string, string> = {
  clarify: 'thinking',
  plan: 'planning',
  execute: 'building',
  verify: 'checking',
}

// ── Step Icon ────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: 'pending' | 'running' | 'complete' }) {
  if (status === 'complete') {
    return (
      <div className="w-5 h-5 rounded-full bg-pass/20 flex items-center justify-center">
        <svg className="w-3 h-3 text-pass" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div className="w-5 h-5 rounded-full border-2 border-running flex items-center justify-center animate-[pulse-glow_2s_ease-in-out_infinite]">
        <div className="w-2 h-2 rounded-full bg-running" />
      </div>
    )
  }
  return (
    <div className="w-5 h-5 rounded-full border border-border" />
  )
}

// ── Elapsed Time Hook ────────────────────────────────────────────────────────

function useElapsedTime(startedAt?: string): string {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    if (!startedAt) return

    const start = new Date(startedAt).getTime()

    const update = () => {
      const diff = Math.floor((Date.now() - start) / 1000)
      const minutes = Math.floor(diff / 60)
      const seconds = diff % 60
      setElapsed(`${minutes}:${String(seconds).padStart(2, '0')}`)
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return elapsed
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Horizontal 5-step progress indicator (D-03).
 * Shows Thinking -> Planning -> Building -> Checking -> Done with pulse
 * animation on the active step, checkmarks on completed steps, and
 * elapsed time counter.
 */
export function OperatorProgressBar({
  currentStage,
  statusMessage,
  startedAt,
}: OperatorProgressBarProps) {
  const elapsed = useElapsedTime(startedAt)
  const currentIdx = STEPS.indexOf(currentStage)

  function getStatus(stepIdx: number): 'pending' | 'running' | 'complete' {
    if (currentStage === 'done') return 'complete'
    if (stepIdx < currentIdx) return 'complete'
    if (stepIdx === currentIdx) return 'running'
    return 'pending'
  }

  return (
    <div className="py-md">
      {/* Step indicators with connecting lines */}
      <div className="flex items-center justify-between w-full">
        {STEPS.map((step, idx) => {
          const status = getStatus(idx)
          return (
            <div key={step} className="flex items-center" style={{ flex: idx < STEPS.length - 1 ? 1 : 'none' }}>
              {/* Step column */}
              <div className="flex flex-col items-center">
                <StepIcon status={status} />
                <span
                  className={`text-[11px] font-mono uppercase tracking-[0.06em] mt-1 ${
                    status === 'running'
                      ? 'text-text-primary'
                      : status === 'complete'
                        ? 'text-text-muted'
                        : 'text-text-muted/50'
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>

              {/* Connecting line */}
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-2 ${
                    idx < currentIdx || currentStage === 'done' ? 'bg-pass' : 'bg-border'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Status message + elapsed time */}
      <div className="flex items-center justify-between mt-sm">
        <span className="text-[13px] font-body text-text-muted">
          {statusMessage || STATUS_MESSAGES[currentStage] || ''}
        </span>
        {elapsed && (
          <span className="text-[11px] font-mono text-text-muted">
            {elapsed}
          </span>
        )}
      </div>
    </div>
  )
}
