import type { PhaseStatus } from '../../hooks/useAutonomous'
import { AgentSpawnIndicator } from './AgentSpawnIndicator'
import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface PhaseNodeProps {
  phase: { number: number; name: string }
  status: PhaseStatus
  commitCount?: number
  agentSpawns?: Array<{ agentId: string; role: string }>
}

// ── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<PhaseStatus, {
  color: string
  label: string
  dotClass: string
}> = {
  pending: {
    color: '#6F7C90',
    label: 'Pending',
    dotClass: 'bg-[#6F7C90]',
  },
  running: {
    color: '#36C9FF',
    label: 'Running',
    dotClass: 'bg-[#36C9FF]',
  },
  complete: {
    color: '#2EDB87',
    label: 'Complete',
    dotClass: 'bg-[#2EDB87]',
  },
  failed: {
    color: '#FF5A67',
    label: 'Failed',
    dotClass: 'bg-[#FF5A67]',
  },
  blocked: {
    color: '#FFB020',
    label: 'Waiting for input',
    dotClass: 'bg-[#FFB020]',
  },
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Individual GSD phase node in the autonomous pipeline.
 *
 * Per UI spec: Full-width, 64px height compact horizontal card.
 * - Phase number (mono label) left
 * - Phase name center (15px Geist 500)
 * - Commit count + agent spawns right
 * - Running: pulse glow animation (2s ease-in-out, same keyframe as StageNode)
 * - Blocked: amber border + "Waiting for input" label
 */
export function PhaseNode({ phase, status, commitCount = 0, agentSpawns = [] }: PhaseNodeProps) {
  const config = STATUS_CONFIG[status]
  const isRunning = status === 'running'
  const isPending = status === 'pending'
  const isBlocked = status === 'blocked'

  return (
    <div
      className={cn(
        'relative w-full h-16 rounded-md bg-surface border flex items-center px-4 gap-4',
        'transition-all duration-[400ms] ease-out',
        isPending ? 'opacity-40 border-border' : 'opacity-100',
        isRunning && 'animate-[pulse-glow_2s_ease-in-out_infinite] border-[#36C9FF]/30',
        isBlocked && 'border-[#FFB020]/50',
        !isPending && !isRunning && !isBlocked && 'border-border',
      )}
      style={
        isRunning
          ? ({ '--glow-color': 'rgba(54, 201, 255, 0.4)' } as React.CSSProperties)
          : undefined
      }
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md"
        style={{ backgroundColor: config.color }}
      />

      {/* Phase number */}
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted shrink-0 ml-1 w-8">
        P{String(phase.number).padStart(2, '0')}
      </span>

      {/* Phase name */}
      <span className={cn(
        'text-[15px] font-medium flex-1 truncate',
        isPending ? 'text-text-muted' : 'text-text-primary',
      )}>
        {phase.name}
      </span>

      {/* Status label for blocked */}
      {isBlocked && (
        <span className="text-[11px] font-medium text-[#FFB020] shrink-0">
          Waiting for input
        </span>
      )}

      {/* Agent spawns (when running) */}
      {(isRunning || isBlocked) && agentSpawns.length > 0 && (
        <AgentSpawnIndicator agents={agentSpawns} />
      )}

      {/* Commit count */}
      {commitCount > 0 && (
        <span className="text-[11px] font-mono text-text-muted shrink-0">
          {commitCount} {commitCount === 1 ? 'commit' : 'commits'}
        </span>
      )}

      {/* Status dot */}
      <div className={cn('w-2 h-2 rounded-full shrink-0', config.dotClass)} />
    </div>
  )
}
