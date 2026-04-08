import { useEffect, useRef } from 'react'
import { getProviderColor } from './RoutingBadge'

interface RoutingRationaleProps {
  provider: string
  model: string
  taskType?: string
  reason?: string
  confidence?: number
  tier?: string
  onClose: () => void
}

/**
 * Expandable popover showing routing rationale.
 * Per 13-UI-SPEC.md Section 2: RoutingRationale.
 *
 * Shows task classification, routing reason, confidence, tier.
 * Dismisses on click-outside or Escape.
 */
export function RoutingRationale({
  provider,
  model,
  taskType,
  reason,
  confidence,
  tier,
  onClose,
}: RoutingRationaleProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  // Click-outside detection
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    // Delay adding listener to avoid immediate close from the click that opened us
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 10)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const isManifest = confidence !== undefined && confidence >= 1.0
  const confidenceLabel = isManifest ? 'manifest' : 'heuristic'
  const classificationColor = isManifest ? '#C6FF3B' : '#8B95A7'
  const providerColor = getProviderColor(provider)

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full mt-1 z-50"
      style={{
        width: 280,
        backgroundColor: '#13161C',
        border: '1px solid #2A2F3A',
        borderRadius: 8,
        padding: 16,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        animation: 'rationaleIn 150ms ease-out forwards',
      }}
    >
      <style>{`
        @keyframes rationaleIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Model + provider */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-block shrink-0 rounded-full"
          style={{ width: 6, height: 6, backgroundColor: providerColor }}
        />
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-primary leading-[1.4]">
          {model}
        </span>
      </div>

      {/* Task classification */}
      {taskType && (
        <div className="mb-3">
          <div className="text-[12px] font-medium text-text-muted leading-[1.4] mb-1">
            Task classification
          </div>
          <span
            className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] leading-[1.4]"
            style={{ color: classificationColor }}
          >
            {taskType}
          </span>
        </div>
      )}

      {/* Routing reason */}
      {reason && (
        <div className="mb-3">
          <div className="text-[12px] font-medium text-text-muted leading-[1.4] mb-1">
            Routing reason
          </div>
          <div className="font-body text-[13px] font-normal text-text-primary leading-[1.5]">
            {reason}
          </div>
        </div>
      )}

      {/* Confidence + Tier row */}
      <div className="flex items-center gap-4">
        {confidence !== undefined && (
          <div>
            <div className="text-[12px] font-medium text-text-muted leading-[1.4] mb-0.5">
              Confidence
            </div>
            <span
              className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] leading-[1.4]"
              style={{ color: classificationColor }}
            >
              {confidenceLabel}
            </span>
          </div>
        )}
        {tier && (
          <div>
            <div className="text-[12px] font-medium text-text-muted leading-[1.4] mb-0.5">
              Tier
            </div>
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-primary leading-[1.4]">
              {tier}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
