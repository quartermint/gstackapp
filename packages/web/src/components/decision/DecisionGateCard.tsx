import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface DecisionGateCardProps {
  gate: {
    id: string
    title: string
    description: string
    options: Array<{ id: string; label: string }>
    blocking: boolean
  }
  onDecide: (gateId: string, optionId: string) => void
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Decision gate notification card for the sidebar queue.
 *
 * Per UI spec:
 * - Full sidebar width minus 16px padding
 * - 2px left accent: #FFB020 blocking, --color-border-focus non-blocking
 * - Enter animation: translateY 8px -> 0, opacity 0 -> 1, 250ms ease-out
 * - First option styled as recommended (accent color)
 */
export function DecisionGateCard({ gate, onDecide }: DecisionGateCardProps) {
  const isBlocking = gate.blocking

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-md p-3',
        'animate-[fadeIn_250ms_ease-out_both]',
      )}
      style={{
        borderLeftWidth: '2px',
        borderLeftColor: isBlocking ? '#FFB020' : 'var(--color-border-focus)',
      }}
    >
      {/* Title */}
      <h4 className="text-[13px] font-medium text-text-primary leading-snug mb-1">
        {gate.title}
      </h4>

      {/* Description */}
      <p className="text-[13px] text-text-muted leading-relaxed mb-3">
        {isBlocking
          ? 'This decision blocks progress. Choose an option to continue.'
          : 'The pipeline is continuing. Address this when ready.'}
      </p>

      {/* Option buttons */}
      <div className="flex flex-wrap gap-2">
        {gate.options.map((option, idx) => (
          <button
            key={option.id}
            onClick={() => onDecide(gate.id, option.id)}
            className={cn(
              'text-[12px] font-medium px-2 py-1 rounded transition-colors',
              idx === 0
                ? 'text-accent hover:text-accent-hover'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
