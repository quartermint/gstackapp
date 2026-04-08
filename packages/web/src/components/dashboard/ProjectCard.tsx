import { formatDistanceToNow } from 'date-fns'
import { cn } from '../../lib/cn'
import { StatusDot } from './StatusDot'
import type { ProjectState } from '@gstackapp/shared'

interface ProjectCardProps {
  project: ProjectState
  onSelect: (project: ProjectState) => void
}

/**
 * Individual project card with status dot, GSD phase, git info, and last activity.
 * Per UI spec: surface card with hover transition, 4 rows of information.
 */
export function ProjectCard({ project, onSelect }: ProjectCardProps) {
  const { name, gsdState, gitStatus, status } = project

  // Format GSD phase summary
  const phaseText = gsdState?.progress
    ? `Phase ${gsdState.progress.completed_phases + 1} of ${gsdState.progress.total_phases} \u2014 ${gsdState.milestone_name || gsdState.milestone || 'In progress'}`
    : null

  // Format last activity
  const lastActivity = gitStatus?.lastCommitDate
    ? formatDistanceToNow(new Date(gitStatus.lastCommitDate), { addSuffix: true })
    : gsdState?.last_activity
      ? formatDistanceToNow(new Date(gsdState.last_activity), { addSuffix: true })
      : null

  return (
    <button
      type="button"
      onClick={() => onSelect(project)}
      className={cn(
        'bg-surface border border-border rounded-lg p-4 text-left w-full',
        'hover:bg-surface-hover hover:border-border-focus',
        'transition-colors duration-150 cursor-pointer',
        'flex flex-col gap-2',
      )}
    >
      {/* Row 1: Status dot + name */}
      <div className="flex items-center gap-2">
        <StatusDot status={status} />
        <span className="font-body text-lg font-medium text-text-primary truncate">
          {name}
        </span>
      </div>

      {/* Row 2: GSD phase */}
      <div className="text-text-muted">
        {phaseText ? (
          <span className="font-body text-[15px]">{phaseText}</span>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-[0.06em]">
            No GSD
          </span>
        )}
      </div>

      {/* Row 3: Git branch + uncommitted */}
      {gitStatus && (
        <div className="font-body text-[13px] text-text-muted flex items-center gap-1">
          <span>{gitStatus.branch || 'unknown'}</span>
          {gitStatus.uncommitted > 0 && (
            <>
              <span className="mx-1">&middot;</span>
              <span className="text-accent">
                {gitStatus.uncommitted} uncommitted
              </span>
            </>
          )}
        </div>
      )}

      {/* Row 4: Last activity */}
      {lastActivity && (
        <div className="font-body text-[12px] font-medium text-text-muted">
          {lastActivity}
        </div>
      )}
    </button>
  )
}

/**
 * Skeleton loading state for a project card.
 */
export function ProjectCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-1 rounded-full bg-border" />
        <div className="h-5 w-32 rounded bg-border" />
      </div>
      <div className="h-4 w-48 rounded bg-border mb-2" />
      <div className="h-3 w-36 rounded bg-border mb-2" />
      <div className="h-3 w-20 rounded bg-border" />
    </div>
  )
}
