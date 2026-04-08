import type { ProjectState } from '@gstackapp/shared'
import { useProjects } from '../../hooks/useProjects'
import { useCarryover, useInfraStatus } from '../../hooks/useDashboard'
import { ProjectGrid } from './ProjectGrid'
import { CarryoverSection } from './CarryoverSection'
import { InfraPanel } from './InfraPanel'

interface DashboardViewProps {
  onSelectProject: (project: ProjectState) => void
}

/**
 * Top-level dashboard composition: ProjectGrid + CarryoverSection + InfraPanel.
 * This is the landing page when the app opens.
 */
export function DashboardView({ onSelectProject }: DashboardViewProps) {
  const projects = useProjects()
  const carryover = useCarryover()
  const infra = useInfraStatus()

  return (
    <div className="p-8 space-y-8 max-w-[1400px]">
      <ProjectGrid
        projects={projects.data}
        isLoading={projects.isLoading}
        isError={projects.isError}
        onSelectProject={onSelectProject}
      />

      <CarryoverSection
        items={carryover.data}
        isLoading={carryover.isLoading}
      />

      <InfraPanel
        infra={infra.data}
        isLoading={infra.isLoading}
      />
    </div>
  )
}
