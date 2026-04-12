import { useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { ProjectState } from '@gstackapp/shared'
import { HealthBadge } from './HealthBadge'
import { usePipelineList } from '../../hooks/usePipelineFeed'

interface ProjectDetailDrawerProps {
  project: ProjectState | null
  onClose: () => void
}

const verdictColor: Record<string, string> = {
  PASS: '#2EDB87',
  FLAG: '#FFB020',
  BLOCK: '#FF5A67',
  SKIP: '#6F7C90',
  RUNNING: '#36C9FF',
}

export function ProjectDetailDrawer({ project, onClose }: ProjectDetailDrawerProps) {
  const { data: pipelines } = usePipelineList()

  // Escape key closes drawer
  useEffect(() => {
    if (!project) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [project, onClose])

  if (!project) return null

  // Filter pipelines by project name
  const projectPipelines = pipelines
    ?.filter((p) => p.repo.fullName.toLowerCase().includes(project.name.toLowerCase()))
    .slice(0, 5) ?? []

  // Last activity date
  const lastActivityDate = project.gitStatus?.lastCommitDate
    ?? project.gsdState?.last_activity
    ?? null

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-[#0B0D11]/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-surface border-l border-border overflow-y-auto p-6 space-y-6 transform transition-transform duration-[250ms] ease-out">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close project detail"
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Header: name + health */}
        <div className="flex items-center gap-3">
          <h2 className="font-display text-[24px] font-semibold text-text-primary">
            {project.name}
          </h2>
          {project.healthScore !== undefined && (
            <HealthBadge score={project.healthScore} />
          )}
        </div>

        {/* Last activity */}
        {lastActivityDate && (
          <p className="font-body text-[13px] text-text-muted">
            Last active {formatDistanceToNow(new Date(lastActivityDate), { addSuffix: true })}
          </p>
        )}

        {/* Description */}
        {project.description && (
          <p className="font-body text-[13px] text-text-muted">
            {project.description}
          </p>
        )}

        {/* Git Status */}
        {project.gitStatus && (
          <div className="space-y-2">
            <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
              Git Status
            </span>
            <div className="bg-background rounded-md p-3 space-y-1 font-body text-[13px]">
              <div className="flex justify-between">
                <span className="text-text-muted">Branch</span>
                <span className="text-text-primary font-mono text-[11px]">
                  {project.gitStatus.branch ?? 'unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Uncommitted</span>
                <span className={project.gitStatus.uncommitted > 0 ? 'text-accent' : 'text-text-primary'}>
                  {project.gitStatus.uncommitted}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Ahead / Behind</span>
                <span className="text-text-primary">
                  {project.gitStatus.ahead} / {project.gitStatus.behind}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* GSD Progress */}
        {project.gsdState?.progress && (
          <div className="space-y-2">
            <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
              GSD Progress
            </span>
            <div className="bg-background rounded-md p-3 space-y-2">
              {project.gsdState.milestone_name && (
                <p className="font-body text-[13px] text-text-primary">
                  {project.gsdState.milestone_name}
                </p>
              )}
              <p className="font-body text-[13px] text-text-muted">
                Phase {project.gsdState.progress.completed_phases} of {project.gsdState.progress.total_phases}
              </p>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${project.gsdState.progress.percent}%` }}
                />
              </div>
              <p className="font-mono text-[11px] text-text-muted">
                {project.gsdState.progress.percent}% complete
              </p>
            </div>
          </div>
        )}

        {/* Recent Pipelines */}
        <div className="space-y-2">
          <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
            Recent Pipelines
          </span>
          {projectPipelines.length > 0 ? (
            <div className="space-y-2">
              {projectPipelines.map((pipeline) => (
                <div
                  key={pipeline.id}
                  className="bg-background rounded-md p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-body text-[13px] text-text-primary truncate flex-1 mr-2">
                      {pipeline.reviewUnit.title}
                    </span>
                    <span className="font-mono text-[11px] text-text-muted">
                      {pipeline.createdAt
                        ? formatDistanceToNow(new Date(pipeline.createdAt), { addSuffix: true })
                        : ''}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {pipeline.stages.map((stage) => (
                      <span
                        key={stage.stage}
                        className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded"
                        style={{
                          color: verdictColor[stage.verdict] ?? '#6F7C90',
                          backgroundColor: `${verdictColor[stage.verdict] ?? '#6F7C90'}14`,
                        }}
                      >
                        {stage.stage.replace('_review', '')}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-body text-[13px] text-text-muted">
              No pipeline runs found for this project.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
