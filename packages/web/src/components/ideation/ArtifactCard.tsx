import { formatDistanceToNow } from 'date-fns'
import { cn } from '../../lib/cn'

/** Stage-to-color mapping for ideation stages */
const IDEATION_STAGE_COLORS: Record<string, string> = {
  'office-hours': '#FF8B3E',
  'plan-ceo-review': '#FF8B3E',
  'plan-eng-review': '#36C9FF',
  'design-consultation': '#B084FF',
}

/** Stage-to-label mapping */
const IDEATION_STAGE_LABELS: Record<string, string> = {
  'office-hours': 'Office Hours',
  'plan-ceo-review': 'CEO Review',
  'plan-eng-review': 'Eng Review',
  'design-consultation': 'Design',
}

interface ArtifactCardProps {
  artifact: {
    id: string
    stage: string
    title: string | null
    excerpt: string | null
    artifactPath: string
    createdAt: string
  }
  selected?: boolean
  onClick?: () => void
}

/**
 * Card displaying a stage artifact with stage-colored left accent bar.
 *
 * Per DESIGN.md:
 * - Card: --color-surface bg, 1px --color-border, border-radius --radius-md (8px)
 * - Left accent bar: 3px, colored by stage spectral identity
 * - Stage label: 11px mono uppercase, 0.06em tracking, stage color
 * - Title: 15px Geist 500
 * - Excerpt: 13px Geist 400 text-muted, 3-line clamp
 * - Timestamp: 12px Geist 400 text-muted, relative
 * - Selected: border-focus, slightly brighter bg
 * - Hover: bg surface-hover, cursor pointer
 */
export function ArtifactCard({ artifact, selected, onClick }: ArtifactCardProps) {
  const stageColor = IDEATION_STAGE_COLORS[artifact.stage] ?? '#8B95A7'
  const stageLabel = IDEATION_STAGE_LABELS[artifact.stage] ?? artifact.stage

  const relativeTime = (() => {
    try {
      return formatDistanceToNow(new Date(artifact.createdAt), { addSuffix: true })
    } catch {
      return ''
    }
  })()

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex rounded-lg overflow-hidden text-left',
        'border transition-colors duration-150',
        selected
          ? 'border-border-focus bg-surface-hover'
          : 'border-border bg-surface hover:bg-surface-hover',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Left accent bar */}
      <div
        className="w-[3px] shrink-0"
        style={{ backgroundColor: stageColor }}
      />

      {/* Content */}
      <div className="flex flex-col gap-1.5 px-3 py-3 min-w-0">
        {/* Stage label */}
        <span
          className="font-mono text-[11px] uppercase tracking-[0.06em] font-medium"
          style={{ color: stageColor }}
        >
          {stageLabel}
        </span>

        {/* Title */}
        {artifact.title && (
          <p className="font-body text-[15px] font-medium text-text-primary truncate">
            {artifact.title}
          </p>
        )}

        {/* Excerpt */}
        {artifact.excerpt && (
          <p className="font-body text-[13px] text-text-muted leading-[1.5] line-clamp-3">
            {artifact.excerpt}
          </p>
        )}

        {/* Timestamp */}
        {relativeTime && (
          <span className="font-body text-[12px] text-text-muted">
            {relativeTime}
          </span>
        )}
      </div>
    </button>
  )
}
