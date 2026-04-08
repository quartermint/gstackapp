import { cn } from '../../lib/cn'

/** Stage-to-display-name mapping */
const STAGE_DISPLAY_NAMES: Record<string, string> = {
  'office-hours': 'Office Hours',
  'plan-ceo-review': 'CEO Review',
  'plan-eng-review': 'Eng Review',
  'design-consultation': 'Design',
}

/** Stage-to-spectral-color mapping per DESIGN.md */
const STAGE_COLORS: Record<string, string> = {
  'office-hours': '#FF8B3E',
  'plan-ceo-review': '#FF8B3E',
  'plan-eng-review': '#36C9FF',
  'design-consultation': '#B084FF',
}

interface IdeationStageNodeProps {
  skill: string
  displayName?: string
  status: 'pending' | 'running' | 'complete' | 'error'
  stageColor?: string
  artifactSummary?: { title: string | null; excerpt: string | null }
  onClick?: () => void
}

/**
 * Individual stage node for the ideation pipeline topology.
 *
 * Same dimensions as pipeline StageNode (w-36 h-44).
 *
 * Per DESIGN.md Motion Contract:
 * - pending: opacity 20%, muted text
 * - running: full opacity, box-shadow pulse glow in stageColor (2s ease-in-out loop)
 * - complete: full opacity, green badge (#2EDB87), artifact preview visible
 * - error: full opacity, red badge (#FF5A67), error indicator
 *
 * Per D-05: Dim-to-bright reveal (20% -> 100% opacity over 400ms ease)
 * Per D-06: Running pulse (2s ease-in-out infinite glow)
 */
export function IdeationStageNode({
  skill,
  displayName,
  status,
  stageColor,
  artifactSummary,
  onClick,
}: IdeationStageNodeProps) {
  const color = stageColor ?? STAGE_COLORS[skill] ?? '#8B95A7'
  const label = displayName ?? STAGE_DISPLAY_NAMES[skill] ?? skill

  const isPending = status === 'pending'
  const isRunning = status === 'running'
  const isComplete = status === 'complete'
  const isError = status === 'error'
  const isClickable = isComplete && !!onClick

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={cn(
        'relative w-36 h-44 rounded-lg bg-surface border border-border flex flex-col overflow-hidden',
        'transition-opacity duration-[400ms] ease-out',
        isPending ? 'opacity-20' : 'opacity-100',
        isRunning && 'animate-[pulse-glow_2s_ease-in-out_infinite]',
        isClickable && 'cursor-pointer hover:bg-surface-hover',
        !isClickable && 'cursor-default'
      )}
      style={
        isRunning
          ? ({ '--glow-color': color } as React.CSSProperties)
          : undefined
      }
    >
      {/* Top edge: 3px colored bar using stage spectral identity */}
      <div
        className="h-[3px] w-full shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Content area */}
      <div className="flex flex-col items-center justify-center flex-1 gap-2 px-3 py-3">
        {/* Stage label */}
        <span
          className="font-mono text-[11px] uppercase tracking-[0.06em] font-medium"
          style={{ color: isRunning || isComplete ? color : undefined }}
        >
          {label}
        </span>

        {/* Status indicator */}
        <StatusIndicator status={status} />

        {/* Artifact preview (complete only) */}
        {isComplete && artifactSummary?.title && (
          <p className="text-[11px] text-text-muted text-center line-clamp-2 leading-tight mt-1">
            {artifactSummary.title}
          </p>
        )}
      </div>
    </button>
  )
}

function StatusIndicator({ status }: { status: 'pending' | 'running' | 'complete' | 'error' }) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono font-medium uppercase tracking-[0.06em] text-text-muted bg-surface-hover">
          Pending
        </span>
      )
    case 'running':
      return (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono font-medium uppercase tracking-[0.06em]"
          style={{ color: '#36C9FF', backgroundColor: 'rgba(54, 201, 255, 0.12)' }}
        >
          Running
        </span>
      )
    case 'complete':
      return (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono font-medium uppercase tracking-[0.06em]"
          style={{ color: '#2EDB87', backgroundColor: 'rgba(46, 219, 135, 0.12)' }}
        >
          Done
        </span>
      )
    case 'error':
      return (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono font-medium uppercase tracking-[0.06em]"
          style={{ color: '#FF5A67', backgroundColor: 'rgba(255, 90, 103, 0.12)' }}
        >
          Error
        </span>
      )
  }
}
