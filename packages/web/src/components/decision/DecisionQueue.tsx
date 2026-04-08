import { DecisionGateCard } from './DecisionGateCard'
import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface DecisionGate {
  id: string
  title: string
  description: string
  options: Array<{ id: string; label: string }>
  blocking: boolean
  response: string | null
}

interface DecisionQueueProps {
  gates: DecisionGate[]
  onDecide: (gateId: string, optionId: string) => void
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Sidebar section showing pending decision gates with badge count.
 *
 * Per UI spec:
 * - Badge: small pill, #FFB020 bg when blocking gates exist, text-muted otherwise
 * - Blocking gates sorted first (per D-11)
 * - Empty state: section not visible when zero pending gates
 */
export function DecisionQueue({ gates, onDecide }: DecisionQueueProps) {
  const pendingGates = gates.filter(g => g.response === null)
  const hasBlocking = pendingGates.some(g => g.blocking)

  // Empty state: hide entire section
  if (pendingGates.length === 0) return null

  return (
    <div className="px-2 py-3 border-t border-border">
      {/* Header with badge */}
      <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-[12px] font-medium tracking-wide uppercase text-text-muted">
          Decisions
        </span>
        <span
          className={cn(
            'text-[11px] font-medium px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
            hasBlocking
              ? 'bg-[#FFB020] text-[#0B0D11]'
              : 'bg-[#2A2F3A] text-text-muted',
          )}
        >
          {pendingGates.length}
        </span>
      </div>

      {/* Scrollable gate list */}
      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto px-1">
        {pendingGates.map(gate => (
          <DecisionGateCard
            key={gate.id}
            gate={gate}
            onDecide={onDecide}
          />
        ))}
      </div>
    </div>
  )
}
