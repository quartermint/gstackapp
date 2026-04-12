import { cn } from '../../lib/cn'

interface HealthBadgeProps {
  score: number // 0-100
  className?: string
}

export function HealthBadge({ score, className }: HealthBadgeProps) {
  const color = score >= 80 ? '#2EDB87' : score >= 50 ? '#FFB020' : '#FF5A67'
  const bgColor = score >= 80
    ? 'rgba(46, 219, 135, 0.08)'
    : score >= 50
    ? 'rgba(255, 176, 32, 0.08)'
    : 'rgba(255, 90, 103, 0.08)'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold uppercase',
        className
      )}
      style={{ color, backgroundColor: bgColor }}
    >
      {score}
    </span>
  )
}
