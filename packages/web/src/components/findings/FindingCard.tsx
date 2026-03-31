import { cn } from '../../lib/cn'
import { FeedbackUI } from './FeedbackUI'
import type { FindingData } from '../../hooks/usePipelineFeed'

interface FindingCardProps {
  finding: FindingData
}

const SEVERITY_STYLES: Record<string, string> = {
  critical:
    'bg-[rgba(255,90,103,0.08)] text-[#FF5A67] border border-[rgba(255,90,103,0.2)]',
  notable:
    'bg-[rgba(255,176,32,0.08)] text-[#FFB020] border border-[rgba(255,176,32,0.2)]',
  minor:
    'bg-[rgba(139,149,167,0.08)] text-text-muted border border-border',
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  notable: 'Notable',
  minor: 'Minor',
}

/**
 * Individual finding card with severity badge, description, file reference,
 * code snippet, and feedback controls.
 * Per D-12: structured finding display.
 */
export function FindingCard({ finding }: FindingCardProps) {
  const fileRef =
    finding.filePath && finding.lineStart
      ? `${finding.filePath}:${finding.lineStart}`
      : finding.filePath

  return (
    <div className="p-3 bg-surface rounded-md border border-border space-y-2">
      {/* Header: severity badge + title */}
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'inline-flex items-center shrink-0 rounded-full px-2 py-0.5 text-[11px] font-mono font-medium uppercase tracking-[0.06em]',
            SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.minor
          )}
        >
          {SEVERITY_LABELS[finding.severity] ?? finding.severity}
        </span>
        <span className="font-body text-sm font-medium text-text-primary">
          {finding.title}
        </span>
      </div>

      {/* Description */}
      <p className="font-body text-sm text-text-muted line-clamp-3">
        {finding.description}
      </p>

      {/* File reference */}
      {fileRef && (
        <p className="font-mono text-[12px] text-text-muted">{fileRef}</p>
      )}

      {/* Code snippet */}
      {finding.codeSnippet && (
        <pre className="font-mono text-[14px] leading-[1.7] bg-background p-2 rounded-sm overflow-x-auto text-text-primary">
          {finding.codeSnippet}
        </pre>
      )}

      {/* Suggestion */}
      {finding.suggestion && (
        <p className="font-body text-sm text-accent-hover italic">
          {finding.suggestion}
        </p>
      )}

      {/* Feedback */}
      <FeedbackUI
        findingId={finding.id}
        currentVote={finding.feedbackVote as 'up' | 'down' | null}
      />
    </div>
  )
}
