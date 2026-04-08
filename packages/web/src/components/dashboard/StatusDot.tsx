import { cn } from '../../lib/cn'

type ProjectStatus = 'active' | 'stale' | 'ideating'
type ServiceHealth = 'healthy' | 'degraded' | 'down'

interface StatusDotProps {
  status: ProjectStatus | ServiceHealth
  className?: string
}

const projectClasses: Record<ProjectStatus, string> = {
  active: 'bg-accent',
  stale: 'border border-[#FFB020] animate-[pulse_2s_ease-in-out_infinite]',
  ideating: 'bg-[#B084FF]',
}

const serviceClasses: Record<ServiceHealth, string> = {
  healthy: 'bg-[#2EDB87]',
  degraded: 'bg-[#FFB020]',
  down: 'bg-[#FF5A67]',
}

/**
 * 4px colored circle indicating project or service status.
 */
export function StatusDot({ status, className }: StatusDotProps) {
  const isService = status === 'healthy' || status === 'degraded' || status === 'down'
  const colorClass = isService
    ? serviceClasses[status as ServiceHealth]
    : projectClasses[status as ProjectStatus]

  return (
    <span
      className={cn(
        'inline-block w-1 h-1 rounded-full shrink-0',
        colorClass,
        className,
      )}
      aria-label={`Status: ${status}`}
    />
  )
}
