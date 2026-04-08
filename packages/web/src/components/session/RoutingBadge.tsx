import { useState, useRef } from 'react'
import { RoutingRationale } from './RoutingRationale'

// ── Provider Identity Colors ───────────────────────────────────────────────
// From 13-UI-SPEC.md: reuses existing stage identity colors

const PROVIDER_COLORS: Record<string, string> = {
  claude: '#FF8B3E',
  anthropic: '#FF8B3E',
  gpt: '#36C9FF',
  openai: '#36C9FF',
  codex: '#36C9FF',
  gemini: '#B084FF',
  google: '#B084FF',
  local: '#2EDB87',
}

export function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] ?? '#8B95A7'
}

// ── Component ──────────────────────────────────────────────────────────────

export interface RoutingBadgeProps {
  provider: string
  model: string
  taskType?: string
  reason?: string
  confidence?: number
  tier?: string
}

/**
 * Pill-shaped badge showing provider dot + model name.
 * Per 13-UI-SPEC.md Section 1: RoutingBadge.
 *
 * - 6px colored circle dot using provider identity colors
 * - Model name in 11px JetBrains Mono 500 uppercase 0.06em tracking
 * - Click toggles RoutingRationale popover
 */
export function RoutingBadge({ provider, model, taskType, reason, confidence, tier }: RoutingBadgeProps) {
  const [showRationale, setShowRationale] = useState(false)
  const badgeRef = useRef<HTMLButtonElement>(null)
  const color = getProviderColor(provider)

  // Shorten model name for display (e.g., 'claude-opus-4-6' -> 'claude-opus-4-6')
  const displayModel = model.length > 28 ? model.slice(0, 26) + '\u2026' : model

  return (
    <div className="relative inline-block">
      <button
        ref={badgeRef}
        type="button"
        onClick={() => setShowRationale(prev => !prev)}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 cursor-pointer transition-colors duration-150"
        style={{
          backgroundColor: showRationale ? '#1A1D24' : '#13161C',
          border: `1px solid ${showRationale ? '#3D4350' : '#2A2F3A'}`,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = '#1A1D24'
          e.currentTarget.style.borderColor = '#3D4350'
        }}
        onMouseLeave={e => {
          if (!showRationale) {
            e.currentTarget.style.backgroundColor = '#13161C'
            e.currentTarget.style.borderColor = '#2A2F3A'
          }
        }}
        aria-label={`Routing: ${model} via ${provider}`}
      >
        {/* Provider identity dot */}
        <span
          className="inline-block shrink-0 rounded-full"
          style={{ width: 6, height: 6, backgroundColor: color }}
        />
        {/* Model name */}
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted leading-[1.4]">
          {displayModel}
        </span>
      </button>

      {showRationale && (
        <RoutingRationale
          provider={provider}
          model={model}
          taskType={taskType}
          reason={reason}
          confidence={confidence}
          tier={tier}
          onClose={() => setShowRationale(false)}
        />
      )}
    </div>
  )
}
