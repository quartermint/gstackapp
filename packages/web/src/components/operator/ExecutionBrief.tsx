import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface ExecutionBriefProps {
  requestId: string
  brief: {
    scope: string[]
    assumptions: string[]
    acceptanceCriteria: string[]
  }
  onApprove: () => void
  onReject: () => void
  isSubmitting?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Execution brief card (D-02).
 * Shows scope, assumptions, and acceptance criteria with approve/reject buttons.
 * Renders inline in the chat thread after clarification is complete.
 */
export function ExecutionBrief({
  requestId: _requestId,
  brief,
  onApprove,
  onReject,
  isSubmitting,
}: ExecutionBriefProps) {
  const disabled = isSubmitting

  return (
    <div className="bg-surface border border-border rounded-md p-md animate-[fadeIn_250ms_ease-out_both]">
      {/* Intro text */}
      <p className="text-[13px] font-body text-text-muted mb-md">
        Here&apos;s what I&apos;m planning to do. Review and approve to begin.
      </p>

      <div className="space-y-md">
        {/* Scope */}
        <div>
          <h4 className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] mb-xs">
            Scope
          </h4>
          <ul className="space-y-1">
            {brief.scope.map((item, idx) => (
              <li key={idx} className="text-[13px] text-text-primary font-body">
                &bull; {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Assumptions */}
        <div>
          <h4 className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] mb-xs">
            Assumptions
          </h4>
          <ul className="space-y-1">
            {brief.assumptions.map((item, idx) => (
              <li key={idx} className="text-[13px] text-text-primary font-body">
                &bull; {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Acceptance Criteria */}
        <div>
          <h4 className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] mb-xs">
            Acceptance Criteria
          </h4>
          <ol className="space-y-1">
            {brief.acceptanceCriteria.map((item, idx) => (
              <li key={idx} className="text-[13px] text-text-primary font-body">
                {idx + 1}. {item}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-sm mt-md">
        <button
          onClick={onApprove}
          disabled={disabled}
          className={cn(
            'bg-accent text-background font-body text-[15px] font-medium rounded-md px-lg py-xs hover:bg-accent-hover transition-colors duration-150',
            disabled && 'opacity-40 cursor-not-allowed',
          )}
        >
          Approve &amp; Start
        </button>
        <button
          onClick={onReject}
          disabled={disabled}
          className={cn(
            'border border-border text-text-muted font-body text-[15px] rounded-md px-lg py-xs hover:text-text-primary hover:border-border-focus transition-colors duration-150',
            disabled && 'opacity-40 cursor-not-allowed',
          )}
        >
          Request Changes
        </button>
      </div>
    </div>
  )
}
