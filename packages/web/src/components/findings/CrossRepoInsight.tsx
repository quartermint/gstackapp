import type { CrossRepoMatchData } from '../../hooks/usePipelineFeed'

interface CrossRepoInsightProps {
  match: CrossRepoMatchData
}

/**
 * Individual cross-repo match card with warm gold (#FFD166) styling.
 * Per DESIGN.md D-06: "Seen in your other repos" callouts use warm gold highlight.
 * Compact: 2-3 lines per match maximum.
 */
export function CrossRepoInsight({ match }: CrossRepoInsightProps) {
  const similarity = ((1 - match.distance) * 100).toFixed(0)

  return (
    <div
      className="px-3 py-2 rounded-md"
      style={{
        borderLeft: '3px solid #FFD166',
        background: 'rgba(255, 209, 102, 0.06)',
      }}
    >
      {/* Title */}
      <p className="font-body text-sm font-medium text-text-primary">
        {match.title}
      </p>

      {/* Repo + similarity */}
      <p
        className="font-mono text-[11px] uppercase tracking-[0.06em]"
        style={{ color: '#FFD166' }}
      >
        {match.repo_full_name} — {similarity}% similar
      </p>

      {/* File path (optional) */}
      {match.file_path && (
        <p className="font-mono text-[11px] text-text-muted">
          File: {match.file_path}
        </p>
      )}
    </div>
  )
}
