import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface ErrorCardProps {
  type: 'timeout' | 'verification-failure' | 'ambiguous-scope' | 'provider-exhaustion'
  message?: string
  onAction: (action: string) => void
  isSubmitting?: boolean
}

// ── Error Configuration ─────────────────────────────────────────────────────

export const ERROR_CONFIG: Record<
  string,
  {
    borderColor: string
    title: string
    body: string
    buttons: Array<{ label: string; action: string; preSelected?: boolean }>
  }
> = {
  'timeout': {
    borderColor: 'border-l-flag',
    title: 'Taking longer than expected',
    body: 'The system is still working on your request. You can wait or ask Ryan to check on it.',
    buttons: [
      { label: 'Keep Waiting', action: 'wait' },
      { label: 'Ask Ryan', action: 'escalate' },
    ],
  },
  'verification-failure': {
    borderColor: 'border-l-block',
    title: 'Quality check found issues',
    body: "Some checks didn't pass. You can request changes to address them or ask Ryan for help.",
    buttons: [
      { label: 'Request Changes', action: 'request-changes', preSelected: true },
      { label: 'Ask Ryan', action: 'escalate' },
    ],
  },
  'ambiguous-scope': {
    borderColor: 'border-l-flag',
    title: "We couldn't fully pin down the scope",
    body: "Here's what we have so far. Ryan can help clarify the rest.",
    buttons: [
      { label: 'Ask Ryan', action: 'escalate' },
    ],
  },
  'provider-exhaustion': {
    borderColor: 'border-l-[#6F7C90]',
    title: 'Temporarily unavailable',
    body: 'The AI service is currently at capacity. Your request has been saved and can be retried later.',
    buttons: [
      { label: 'Retry Later', action: 'retry' },
    ],
  },
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Inline error card in the chat thread (D-04).
 * Renders with severity-appropriate left border color and action buttons.
 * Supports 4 error types: timeout, verification-failure, ambiguous-scope,
 * and provider-exhaustion.
 */
export function ErrorCard({ type, message, onAction, isSubmitting }: ErrorCardProps) {
  const config = ERROR_CONFIG[type]
  if (!config) return null

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-md p-md border-l-2',
        config.borderColor,
        'animate-[fadeIn_250ms_ease-out_both]',
      )}
    >
      {/* Title */}
      <h4 className="text-[13px] font-medium text-text-primary mb-1">
        {config.title}
      </h4>

      {/* Body */}
      <p className="text-[13px] text-text-muted leading-relaxed mb-3">
        {config.body}
        {message && (
          <>
            {' '}
            {message}
          </>
        )}
      </p>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {config.buttons.map((btn, idx) => (
          <button
            key={btn.action}
            onClick={() => onAction(btn.action)}
            disabled={isSubmitting}
            className={cn(
              'text-[12px] font-medium px-3 py-1.5 rounded border transition-colors',
              btn.preSelected || idx === 0
                ? 'border-accent/30 text-accent hover:bg-accent/10 hover:text-accent-hover'
                : 'border-border text-text-muted hover:text-text-primary hover:border-border-focus',
              isSubmitting && 'opacity-40 cursor-not-allowed',
            )}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}
