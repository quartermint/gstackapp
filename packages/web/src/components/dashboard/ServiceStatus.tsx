import { StatusDot } from './StatusDot'
import type { ServiceHealth } from '@gstackapp/shared'

interface ServiceStatusProps {
  service: ServiceHealth
}

const statusLabels: Record<string, string> = {
  degraded: 'degraded',
  down: 'unreachable',
}

/**
 * Individual service health card showing status dot, name, and optional endpoint.
 */
export function ServiceStatus({ service }: ServiceStatusProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex items-start gap-3">
      <StatusDot status={service.status} className="mt-1.5" />
      <div className="min-w-0">
        <div className="font-body text-[15px] text-text-primary">{service.name}</div>
        {service.endpoint && (
          <a
            href={service.endpoint}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted hover:text-accent transition-colors duration-150 break-all"
          >
            {service.endpoint}
          </a>
        )}
        {service.status !== 'healthy' && (
          <span className="font-body text-[13px] text-text-muted block">
            {statusLabels[service.status]}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Skeleton loading state for a service status card.
 */
export function ServiceStatusSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 animate-pulse flex items-center gap-3">
      <div className="w-1 h-1 rounded-full bg-border" />
      <div>
        <div className="h-4 w-24 rounded bg-border mb-1" />
        <div className="h-3 w-32 rounded bg-border" />
      </div>
    </div>
  )
}
