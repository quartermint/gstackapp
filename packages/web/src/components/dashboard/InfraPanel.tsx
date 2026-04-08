import type { InfraStatus } from '@gstackapp/shared'
import { ServiceStatus, ServiceStatusSkeleton } from './ServiceStatus'

interface InfraPanelProps {
  infra?: InfraStatus
  isLoading: boolean
}

/**
 * Mac Mini infrastructure health panel.
 * Shows services in a horizontal row with status dots and endpoints.
 */
export function InfraPanel({ infra, isLoading }: InfraPanelProps) {
  if (isLoading) {
    return (
      <section>
        <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">
          Infrastructure
        </h2>
        <div className="flex gap-4 flex-wrap">
          {Array.from({ length: 3 }).map((_, i) => (
            <ServiceStatusSkeleton key={i} />
          ))}
        </div>
      </section>
    )
  }

  if (!infra || !infra.reachable) {
    return (
      <section>
        <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">
          Infrastructure
        </h2>
        <p className="text-text-muted font-body text-[15px]">
          Mac Mini unreachable. Verify Tailscale connection and retry.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">
        Infrastructure
      </h2>
      <div className="flex gap-4 flex-wrap">
        {infra.services.map((service) => (
          <ServiceStatus key={service.name} service={service} />
        ))}
      </div>
    </section>
  )
}
