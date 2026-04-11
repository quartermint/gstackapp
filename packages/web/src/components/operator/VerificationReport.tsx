import { useState } from 'react'
import { VerdictBadge } from '../shared/VerdictBadge'

// ── Types ────────────────────────────────────────────────────────────────────

interface VerificationReportProps {
  report: {
    passed: boolean
    summary: string
    whatBuilt: string[]
    qualityChecks: { passed: number; total: number }
    filesChanged: number
    failureDetails?: string
  }
}

// ── Accordion Section ────────────────────────────────────────────────────────

function AccordionSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full cursor-pointer py-xs"
      >
        <span className="text-[11px] font-mono text-text-muted uppercase tracking-[0.06em]">
          {label}
        </span>
        <svg
          className={`w-4 h-4 text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-out"
        style={{ maxHeight: isOpen ? '500px' : '0' }}
      >
        <div className="pb-sm">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Verification report results card (D-05).
 * Shows pass/fail verdict badge with summary text and three expandable
 * accordion sections: What was built, Quality checks, Files changed.
 * Entry animation uses dim-to-bright (opacity 20% to 100% over 400ms).
 */
export function VerificationReport({ report }: VerificationReportProps) {
  return (
    <div className="bg-surface border border-border rounded-md p-md animate-[fadeIn_400ms_ease_both]">
      {/* Top section: verdict badge + summary */}
      <div className="flex items-start gap-sm mb-md">
        <VerdictBadge verdict={report.passed ? 'PASS' : 'BLOCK'} />
        <p className="text-[15px] font-body text-text-primary">
          {report.summary}
        </p>
      </div>

      {/* Failure details if present */}
      {report.failureDetails && (
        <p className="text-[13px] text-text-muted mb-md leading-relaxed">
          {report.failureDetails}
        </p>
      )}

      {/* Expandable sections */}
      <div>
        <AccordionSection label="What was built">
          <ul className="space-y-1">
            {report.whatBuilt.map((item, idx) => (
              <li key={idx} className="text-[13px] text-text-primary font-body">
                &bull; {item}
              </li>
            ))}
          </ul>
        </AccordionSection>

        <AccordionSection label="Quality checks">
          <p className="text-[13px] text-text-primary font-body">
            {report.qualityChecks.passed}/{report.qualityChecks.total} passed
          </p>
        </AccordionSection>

        <AccordionSection label="Files changed">
          <p className="text-[13px] text-text-primary font-body">
            {report.filesChanged} files
          </p>
        </AccordionSection>
      </div>
    </div>
  )
}
