import type { Verdict } from '@gstackapp/shared'
import { VERDICT_COLORS } from '../../lib/constants'

interface VerdictBadgeProps {
  verdict: Verdict | 'RUNNING' | 'PENDING'
}

/**
 * Pill-shaped badge displaying verdict status with color coding.
 * Background uses verdict color at 12% opacity, text uses full verdict color.
 */
export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const color = verdict === 'PENDING' ? VERDICT_COLORS.SKIP : VERDICT_COLORS[verdict]
  const label = verdict

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono font-medium uppercase tracking-[0.06em]"
      style={{
        backgroundColor: `${color}1F`, // ~12% opacity
        color,
      }}
    >
      {label}
    </span>
  )
}
