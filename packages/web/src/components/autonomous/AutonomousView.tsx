import { useEffect, useCallback } from 'react'
import { useAutonomous } from '../../hooks/useAutonomous'
import { useDecisionGates } from '../../hooks/useDecisionGates'
import type { DecisionGate } from '../../hooks/useAutonomous'
import { AutonomousPipeline } from './AutonomousPipeline'
import { CommitStream } from './CommitStream'
import { ExecutionSummary } from './ExecutionSummary'
import { DecisionQueue } from '../decision/DecisionQueue'
import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface AutonomousViewProps {
  projectPath: string
  ideationSessionId?: string
  onComplete?: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Full autonomous execution view: two-column with phase pipeline left, commit stream right.
 *
 * Per UI spec:
 * - idle/launching: "Ready to build" empty state with loading indicator
 * - running: Two-column layout with AutonomousPipeline left, CommitStream right
 * - complete: ExecutionSummary replaces pipeline view
 * - failed: Error message per copywriting contract
 *
 * Auto-launches execution on mount.
 */
export function AutonomousView({ projectPath, ideationSessionId, onComplete }: AutonomousViewProps) {
  const {
    runId,
    status,
    phases,
    commits,
    agentSpawns,
    completionSummary,
    error,
    launchExecution,
    cancelExecution,
  } = useAutonomous({
    onGateCreated: (gate: DecisionGate) => addGate(gate),
    onGateResolved: (gateId: string) => resolveGate(gateId),
  })

  const { gates, pendingCount, addGate, respondToGate, resolveGate } = useDecisionGates(runId)

  // Auto-launch on mount
  useEffect(() => {
    launchExecution(projectPath, ideationSessionId)
  }, [projectPath, ideationSessionId, launchExecution])

  // Notify parent on completion
  useEffect(() => {
    if (status === 'complete' && onComplete) {
      onComplete()
    }
  }, [status, onComplete])

  const handleDecision = useCallback((gateId: string, optionId: string) => {
    respondToGate(gateId, optionId)
  }, [respondToGate])

  // Find the failed phase number for error message
  const failedPhase = phases.find(p => p.status === 'failed')

  // Count decisions resolved for summary
  const decisionsResolved = gates.filter(g => g.response !== null).length

  // ── Idle / Launching ────────────────────────────────────────────────────

  if (status === 'idle' || status === 'launching') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h2 className="text-[24px] font-semibold text-text-primary" style={{ fontFamily: 'var(--font-display)' }}>
          Ready to build
        </h2>
        <p className="text-[15px] text-text-muted max-w-md text-center leading-relaxed">
          Complete an ideation pipeline first, then launch autonomous execution to build it end-to-end.
        </p>
        {status === 'launching' && (
          <div className="flex items-center gap-2 mt-2">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-[13px] text-text-muted">Launching execution...</span>
          </div>
        )}
      </div>
    )
  }

  // ── Complete ────────────────────────────────────────────────────────────

  if (status === 'complete' && completionSummary) {
    return (
      <ExecutionSummary
        result={{
          ...completionSummary,
          decisionsResolved,
        }}
      />
    )
  }

  // ── Failed ──────────────────────────────────────────────────────────────

  if (status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
        <div className="bg-[rgba(255,90,103,0.08)] border border-[rgba(255,90,103,0.2)] rounded-lg p-6 max-w-lg w-full">
          <h3 className="text-[18px] font-medium text-[#FF5A67] mb-2" style={{ fontFamily: 'var(--font-body)' }}>
            Execution stopped
          </h3>
          <p className="text-[15px] text-text-muted leading-relaxed">
            {failedPhase
              ? `Execution stopped at Phase ${failedPhase.number} \u2014 ${error || 'Unknown error'}. Review the error and restart from this phase.`
              : error || 'An unknown error occurred.'}
          </p>
        </div>
      </div>
    )
  }

  // ── Running ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Cancel button */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#36C9FF] animate-pulse" />
          <span className="text-[13px] text-text-muted">
            Executing {phases.filter(p => p.status === 'complete').length}/{phases.length} phases
          </span>
        </div>
        <button
          onClick={cancelExecution}
          className={cn(
            'text-[12px] font-medium px-3 py-1 rounded-md',
            'text-[#FF5A67] hover:bg-[rgba(255,90,103,0.08)]',
            'transition-colors',
          )}
        >
          Cancel execution
        </button>
      </div>

      {/* Two-column layout: pipeline left, commits right */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Phase pipeline */}
        <div className="w-1/2 border-r border-border overflow-y-auto p-4">
          <AutonomousPipeline
            phases={phases}
            commits={commits}
            agentSpawns={agentSpawns}
          />
        </div>

        {/* Right: Commit stream */}
        <div className="w-1/2 flex flex-col min-h-0">
          <CommitStream commits={commits} />
        </div>
      </div>

      {/* Decision gate queue (rendered as overlay-style in sidebar) */}
      {pendingCount > 0 && (
        <div className="absolute right-0 top-16 w-72 z-10">
          <DecisionQueue gates={gates} onDecide={handleDecision} />
        </div>
      )}
    </div>
  )
}
