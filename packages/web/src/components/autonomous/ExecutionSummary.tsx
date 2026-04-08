// ── Types ────────────────────────────────────────────────────────────────────

interface ExecutionResult {
  totalPhases: number
  totalCommits: number
  elapsedMs: number
  decisionsResolved?: number
}

interface ExecutionSummaryProps {
  result: ExecutionResult
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Summary view after autonomous execution completes.
 *
 * Per copywriting contract:
 * "Execution complete -- {N} phases, {N} commits, {N} decisions resolved in {time}."
 *
 * Card: --color-surface bg, large padding, centered.
 * Stats in a grid: phases (checkmark), commits (code icon), time elapsed.
 */
export function ExecutionSummary({ result }: ExecutionSummaryProps) {
  const decisions = result.decisionsResolved ?? 0

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <div className="bg-surface border border-border rounded-lg p-8 max-w-md w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-[rgba(46,219,135,0.12)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M6 10l3 3 5-6"
                stroke="#2EDB87"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3 className="text-[18px] font-medium text-text-primary" style={{ fontFamily: 'var(--font-body)' }}>
            Execution complete
          </h3>
        </div>

        {/* Summary sentence */}
        <p className="text-[15px] text-text-muted leading-relaxed mb-6">
          Execution complete &mdash; {result.totalPhases} {result.totalPhases === 1 ? 'phase' : 'phases'},{' '}
          {result.totalCommits} {result.totalCommits === 1 ? 'commit' : 'commits'}
          {decisions > 0 && <>, {decisions} {decisions === 1 ? 'decision' : 'decisions'} resolved</>}
          {' '}in {formatDuration(result.elapsedMs)}.
        </p>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4">
          {/* Phases */}
          <div className="flex flex-col items-center gap-1 py-3 px-2 rounded-md bg-background">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 8l3 3 5-6"
                stroke="#2EDB87"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[20px] font-semibold text-text-primary" style={{ fontFamily: 'var(--font-display)' }}>
              {result.totalPhases}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
              Phases
            </span>
          </div>

          {/* Commits */}
          <div className="flex flex-col items-center gap-1 py-3 px-2 rounded-md bg-background">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="#C6FF3B" strokeWidth="1.5" />
              <line x1="8" y1="0" x2="8" y2="5" stroke="#C6FF3B" strokeWidth="1.5" />
              <line x1="8" y1="11" x2="8" y2="16" stroke="#C6FF3B" strokeWidth="1.5" />
            </svg>
            <span className="text-[20px] font-semibold text-text-primary" style={{ fontFamily: 'var(--font-display)' }}>
              {result.totalCommits}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
              Commits
            </span>
          </div>

          {/* Time */}
          <div className="flex flex-col items-center gap-1 py-3 px-2 rounded-md bg-background">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="#8B95A7" strokeWidth="1.5" />
              <polyline points="8,4 8,8 11,10" stroke="#8B95A7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[20px] font-semibold text-text-primary" style={{ fontFamily: 'var(--font-display)' }}>
              {formatDuration(result.elapsedMs)}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
              Elapsed
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
