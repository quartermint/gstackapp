import { useRef, useEffect } from 'react'
import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface CommitInfo {
  phase: number
  hash: string
  message: string
  timestamp: string
}

interface CommitStreamProps {
  commits: CommitInfo[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAX_RENDERED_COMMITS = 500 // T-15-16: cap to prevent memory bloat

function formatRelativeTime(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffMs = now - then

  if (diffMs < 5000) return 'just now'
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`
  return `${Math.floor(diffMs / 3600_000)}h ago`
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Live commit feed during autonomous execution.
 *
 * Per UI spec:
 * - Scrollable feed, auto-scrolls to bottom on new commits
 * - Each entry: short hash (7 chars, mono 11px accent), message (13px Geist 400), timestamp (12px text-muted)
 * - New commit enter animation: opacity 0 -> 1, 150ms ease-out
 * - Empty state: "Waiting for commits..." in text-muted
 * - T-15-16 mitigation: cap rendered commits to 500
 */
export function CommitStream({ commits }: CommitStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new commits arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [commits.length])

  // T-15-16: Only render last 500 commits to prevent memory bloat
  const visibleCommits = commits.length > MAX_RENDERED_COMMITS
    ? commits.slice(-MAX_RENDERED_COMMITS)
    : commits

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[13px] text-text-muted">Waiting for commits...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto h-full px-3 py-2">
      {commits.length > MAX_RENDERED_COMMITS && (
        <p className="text-[11px] text-text-muted text-center py-1">
          {commits.length - MAX_RENDERED_COMMITS} earlier commits hidden
        </p>
      )}

      {visibleCommits.map((commit, idx) => (
        <div
          key={`${commit.hash}-${idx}`}
          className={cn(
            'flex items-start gap-3 py-2 border-b border-border/50 last:border-b-0',
            'animate-[fadeIn_150ms_ease-out_both]',
          )}
        >
          {/* Short hash */}
          <code className="font-mono text-[11px] text-accent shrink-0 mt-0.5">
            {commit.hash.slice(0, 7)}
          </code>

          {/* Message + timestamp */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-text-primary leading-snug truncate">
              {commit.message}
            </p>
            <p className="text-[12px] text-text-muted mt-0.5">
              Phase {commit.phase} · {formatRelativeTime(commit.timestamp)}
            </p>
          </div>
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  )
}
