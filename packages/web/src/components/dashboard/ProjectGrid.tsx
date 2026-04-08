import type { ProjectState } from '@gstackapp/shared'
import { ProjectCard, ProjectCardSkeleton } from './ProjectCard'

interface ProjectGridProps {
  projects?: ProjectState[]
  isLoading: boolean
  isError: boolean
  onSelectProject: (project: ProjectState) => void
}

/** Sort order: active first, then stale, then ideating. Within group, most recent first. */
function sortProjects(projects: ProjectState[]): ProjectState[] {
  const statusOrder: Record<string, number> = { active: 0, stale: 1, ideating: 2 }

  return [...projects].sort((a, b) => {
    const orderDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
    if (orderDiff !== 0) return orderDiff

    // Within same status group, sort by last activity (most recent first)
    const dateA = a.gitStatus?.lastCommitDate || a.gsdState?.last_activity || ''
    const dateB = b.gitStatus?.lastCommitDate || b.gsdState?.last_activity || ''
    return dateB.localeCompare(dateA)
  })
}

/**
 * CSS grid of project cards with loading/empty/error states.
 * Per UI spec: auto-fill grid with 280px min-width, 24px gap.
 */
export function ProjectGrid({ projects, isLoading, isError, onSelectProject }: ProjectGridProps) {
  if (isError) {
    return (
      <section>
        <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">Projects</h2>
        <p className="text-text-muted font-body text-[15px]">
          Could not scan projects. Check filesystem permissions and try refreshing.
        </p>
      </section>
    )
  }

  if (isLoading) {
    return (
      <section>
        <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">Projects</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      </section>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <section>
        <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">Projects</h2>
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <h3 className="font-display text-lg font-semibold text-text-primary mb-2">
            No projects detected
          </h3>
          <p className="text-text-muted font-body text-[15px]">
            Add projects with .planning/ directories or list them in ~/CLAUDE.md to see them here.
          </p>
        </div>
      </section>
    )
  }

  const sorted = sortProjects(projects)

  return (
    <section>
      <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">Projects</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
        {sorted.map((project) => (
          <ProjectCard
            key={project.name}
            project={project}
            onSelect={onSelectProject}
          />
        ))}
      </div>
    </section>
  )
}
