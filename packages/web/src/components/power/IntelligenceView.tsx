import { useIntelligenceFeed, type IntelligenceAlert } from '../../hooks/useIntelligence'
import { PatternCard } from './PatternCard'

export function IntelligenceView() {
  const { data, isLoading } = useIntelligenceFeed()

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 space-y-8 max-w-[1400px] animate-pulse">
        <div className="h-7 w-56 rounded bg-border" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 w-full rounded bg-border" />
          ))}
        </div>
      </div>
    )
  }

  const alerts = data?.alerts ?? []
  const total = data?.total ?? 0

  // Empty state
  if (alerts.length === 0) {
    return (
      <div className="p-8 space-y-8 max-w-[1400px]">
        <h1 className="font-display text-[24px] font-semibold text-text-primary leading-[1.2]">
          Cross-Repo Intelligence
        </h1>
        <div className="text-center py-12">
          <h3 className="font-display text-[18px] font-semibold text-text-primary mb-2">
            No cross-repo patterns detected yet
          </h3>
          <p className="font-body text-[15px] text-text-muted">
            Patterns will appear as more pipeline reviews are indexed across your repositories.
          </p>
        </div>
      </div>
    )
  }

  // Group alerts by stage
  const byStage = alerts.reduce<Record<string, IntelligenceAlert[]>>((acc, alert) => {
    const stage = alert.stage
    if (!acc[stage]) acc[stage] = []
    acc[stage].push(alert)
    return acc
  }, {})

  return (
    <div className="p-8 space-y-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[24px] font-semibold text-text-primary leading-[1.2]">
          Cross-Repo Intelligence
        </h1>
        <span className="font-body text-[13px] rounded-full bg-[rgba(255,209,102,0.08)] text-[#FFD166] px-2 py-0.5">
          {total}
        </span>
      </div>

      {/* Active Alerts */}
      <div>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted block mb-3">
          Active Alerts
        </span>
        <div className="space-y-3">
          {alerts
            .sort((a, b) => b.count - a.count)
            .map((alert, i) => (
              <PatternCard key={`${alert.title}-${i}`} pattern={alert} />
            ))}
        </div>
      </div>

      {/* Pattern Detection by Stage */}
      <div>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted block mb-3">
          Pattern Detection
        </span>
        <div className="space-y-6">
          {Object.entries(byStage).map(([stage, stageAlerts]) => (
            <div key={stage}>
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted block mb-2">
                {stage}
              </span>
              <div className="space-y-3">
                {stageAlerts.map((alert, i) => (
                  <PatternCard key={`${stage}-${alert.title}-${i}`} pattern={alert} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
