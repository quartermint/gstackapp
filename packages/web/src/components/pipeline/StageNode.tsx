import type { Stage, Verdict } from '@gstackapp/shared'
import { STAGE_COLORS, STAGE_LABELS } from '../../lib/constants'
import { VerdictBadge } from '../shared/VerdictBadge'
import { cn } from '../../lib/cn'

interface StageNodeProps {
  stage: Stage
  verdict: Verdict | 'RUNNING' | 'PENDING'
  summary?: string
}

/**
 * Individual stage node in the pipeline topology.
 *
 * Visual states:
 * - PENDING: dimmed at 20% opacity
 * - RUNNING: full opacity with pulsing glow in stage spectral color
 * - PASS/FLAG/BLOCK/SKIP: full opacity, no animation, verdict badge shown
 *
 * Per DESIGN.md:
 * - D-05: Dim-to-bright reveal (20% -> 100% opacity over 400ms ease)
 * - D-06: Running pulse (2s ease-in-out infinite glow via pulse-glow keyframe)
 */
export function StageNode({ stage, verdict, summary }: StageNodeProps) {
  const stageColor = STAGE_COLORS[stage]
  const isPending = verdict === 'PENDING'
  const isRunning = verdict === 'RUNNING'

  return (
    <div
      className={cn(
        'relative w-36 h-44 rounded-lg bg-surface border border-border flex flex-col overflow-hidden',
        'transition-opacity duration-[400ms] ease-out',
        isPending ? 'opacity-20' : 'opacity-100',
        isRunning && 'animate-[pulse-glow_2s_ease-in-out_infinite]'
      )}
      style={
        isRunning
          ? ({ '--glow-color': stageColor } as React.CSSProperties)
          : undefined
      }
    >
      {/* Top edge: 3px colored bar using stage spectral identity color */}
      <div
        className="h-[3px] w-full shrink-0"
        style={{ backgroundColor: stageColor }}
      />

      {/* Content area */}
      <div className="flex flex-col items-center justify-center flex-1 gap-3 px-3 py-4">
        {/* Stage label */}
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted">
          {STAGE_LABELS[stage]}
        </span>

        {/* Verdict badge */}
        <VerdictBadge verdict={verdict} />

        {/* Optional summary (truncated) */}
        {summary && (
          <p className="text-[11px] text-text-muted text-center line-clamp-2 leading-tight">
            {summary}
          </p>
        )}
      </div>
    </div>
  )
}
