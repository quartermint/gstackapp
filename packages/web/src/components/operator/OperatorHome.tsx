import { IntakeForm } from './IntakeForm'
import { RequestHistory } from './RequestHistory'

/**
 * Operator home page per D-06.
 * "Operator home IS the intake form" - form at top, history below.
 * No sidebar, no extra navigation. Clean and focused.
 */
export function OperatorHome() {
  return (
    <div className="flex-1 overflow-y-auto px-xl py-xl max-w-[720px]">
      {/* Heading */}
      <h1 className="font-display text-[24px] leading-[1.2] font-semibold text-text-primary tracking-[-0.02em] mb-lg">
        What can I help with?
      </h1>

      {/* Intake form */}
      <IntakeForm />

      {/* Divider */}
      <div className="border-t border-border my-xl" />

      {/* Request history */}
      <div>
        <h2 className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] mb-sm">
          Recent Requests
        </h2>
        <RequestHistory />
      </div>
    </div>
  )
}
