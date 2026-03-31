import type { Stage } from '@gstackapp/shared'
import { STAGE_COLORS } from '../../lib/constants'
import { cn } from '../../lib/cn'

interface StageDotProps {
  stage: Stage
  size?: 'sm' | 'md'
}

/**
 * Colored circle representing a pipeline stage's spectral identity.
 * Per D-08: verdict dots on PR cards use stage spectral identity colors.
 */
export function StageDot({ stage, size = 'sm' }: StageDotProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full',
        size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'
      )}
      style={{ backgroundColor: STAGE_COLORS[stage] }}
      aria-label={stage}
    />
  )
}
