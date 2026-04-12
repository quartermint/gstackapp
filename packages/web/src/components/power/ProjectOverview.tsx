import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { ProjectState } from '@gstackapp/shared'
import { useProjects } from '../../hooks/useProjects'
import { StatusDot } from '../dashboard/StatusDot'
import { HealthBadge } from './HealthBadge'
import { ProjectDetailDrawer } from './ProjectDetailDrawer'
import { ProjectCardSkeleton } from '../dashboard/ProjectCard'

export function ProjectOverview() {
  const { data: projects, isLoading } = useProjects()
  const [selectedProject, setSelectedProject] = useState<ProjectState | null>(null)

  // Health summary counts
  const healthy = projects?.filter((p) => (p.healthScore ?? 0) >= 80).length ?? 0
  const attention = projects?.filter((p) => {
    const s = p.healthScore ?? 0
    return s >= 50 && s < 80
  }).length ?? 0
  const critical = projects?.filter((p) => (p.healthScore ?? 0) < 50).length ?? 0

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-[1400px] p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-7 w-28 rounded bg-border animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if (!projects || projects.length === 0) {
    return (
      <div className="max-w-[1400px] p-8">
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <h2 className="font-display text-lg font-semibold text-text-primary mb-2">
              No projects found
            </h2>
            <p className="font-body text-sm text-text-muted">
              Connect your GitHub repositories to see project status here.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[24px] font-semibold text-text-primary">
          Projects
        </h1>
        <span className="font-body text-[13px] text-text-muted">
          {projects.length}
        </span>
      </div>

      {/* Health summary bar */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-6 font-body text-[13px] text-text-muted">
          <span>
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#2EDB87' }} />
            {healthy} healthy
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#FFB020' }} />
            {attention} need attention
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#FF5A67' }} />
            {critical} critical
          </span>
        </div>
      </div>

      {/* Project grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((project) => (
          <ProjectOverviewCard
            key={project.name}
            project={project}
            onSelect={setSelectedProject}
          />
        ))}
      </div>

      {/* Detail drawer */}
      <ProjectDetailDrawer
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
      />
    </div>
  )
}

// ── Project card for overview ────────────────────────────────────────────────

function ProjectOverviewCard({
  project,
  onSelect,
}: {
  project: ProjectState
  onSelect: (project: ProjectState) => void
}) {
  const { name, description, gsdState, gitStatus, status, healthScore } = project

  // GSD phase text
  const phaseText = gsdState?.progress
    ? `Phase ${gsdState.progress.completed_phases + 1} of ${gsdState.progress.total_phases}`
    : null

  // Last activity
  const lastActivityDate = gitStatus?.lastCommitDate
    ?? gsdState?.last_activity
    ?? null
  const lastActivity = lastActivityDate
    ? formatDistanceToNow(new Date(lastActivityDate), { addSuffix: true })
    : null

  return (
    <button
      type="button"
      onClick={() => onSelect(project)}
      className="bg-surface border border-border rounded-md p-4 hover:bg-surface-hover transition-colors duration-150 cursor-pointer text-left w-full flex flex-col gap-2"
    >
      {/* Row 1: Status dot + name + health badge */}
      <div className="flex items-center gap-2">
        <StatusDot status={status} />
        <span className="font-body text-[15px] font-semibold text-text-primary truncate flex-1">
          {name}
        </span>
        {healthScore !== undefined && (
          <HealthBadge score={healthScore} />
        )}
      </div>

      {/* Row 2: Description */}
      {description && (
        <p className="font-body text-[13px] text-text-muted line-clamp-2">
          {description}
        </p>
      )}

      {/* Row 3: GSD phase progress */}
      {phaseText && (
        <span className="font-body text-[13px] text-text-muted">
          {phaseText}
        </span>
      )}

      {/* Row 4: Last activity */}
      {lastActivity && (
        <span className="font-body text-[13px] text-text-muted">
          {lastActivity}
        </span>
      )}

      {/* Row 5: Git branch + uncommitted */}
      {gitStatus && (
        <div className="font-mono text-[11px] text-text-muted flex items-center gap-1">
          <span>{gitStatus.branch ?? 'unknown'}</span>
          {gitStatus.uncommitted > 0 && (
            <>
              <span className="mx-0.5">&middot;</span>
              <span className="text-accent">{gitStatus.uncommitted} uncommitted</span>
            </>
          )}
        </div>
      )}
    </button>
  )
}
