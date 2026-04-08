import { IdeationStageNode } from './IdeationStageNode'
import type { StageStatus } from '../../hooks/useIdeation'

/** Fixed ideation stage order */
const IDEATION_STAGES = [
  'office-hours',
  'plan-ceo-review',
  'plan-eng-review',
  'design-consultation',
] as const

interface IdeationPipelineProps {
  stages: Map<string, StageStatus>
  activeStage: string | null
  artifacts: Array<{ stage: string; title: string | null; excerpt: string | null }>
  onStageClick: (stage: string) => void
}

/**
 * Horizontal 4-node pipeline topology for ideation.
 *
 * Reuses the StageConnector visual pattern (dashed SVG line with trace-flow animation)
 * inline to avoid import dependency on the PR pipeline's StageConnector.
 *
 * Per DESIGN.md:
 * - D-01: Horizontal left-to-right flow
 * - D-04: Pipeline trace animation (2.5s linear loop) on active connectors
 */
export function IdeationPipeline({
  stages,
  activeStage,
  artifacts,
  onStageClick,
}: IdeationPipelineProps) {
  // Build artifact lookup by stage
  const artifactByStage = new Map(
    artifacts.map((a) => [a.stage, { title: a.title, excerpt: a.excerpt }])
  )

  return (
    <div className="flex items-center justify-center py-4">
      {IDEATION_STAGES.map((stage, index) => {
        const status = stages.get(stage) ?? 'pending'
        const artifact = artifactByStage.get(stage)

        // Connector is active when the preceding stage is running or complete
        const prevStatus = index > 0 ? stages.get(IDEATION_STAGES[index - 1]) : undefined
        const connectorActive = prevStatus === 'running' || prevStatus === 'complete'

        return (
          <div key={stage} className="flex items-center">
            {/* Connector before each stage except the first */}
            {index > 0 && (
              <IdeationConnector active={connectorActive} />
            )}
            <IdeationStageNode
              skill={stage}
              status={status}
              artifactSummary={artifact ?? undefined}
              onClick={status === 'complete' ? () => onStageClick(stage) : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}

/**
 * SVG connector between ideation pipeline nodes.
 * Mirrors StageConnector pattern: dashed line with trace-flow animation when active.
 */
function IdeationConnector({ active }: { active: boolean }) {
  return (
    <svg
      width="48"
      height="2"
      className="mx-1 shrink-0"
      viewBox="0 0 48 2"
    >
      <line
        x1="0"
        y1="1"
        x2="48"
        y2="1"
        stroke={active ? 'var(--color-accent)' : '#2A2F3A'}
        strokeWidth="2"
        strokeDasharray="8 8"
        style={
          active
            ? {
                animation: 'trace-flow 2.5s linear infinite',
                strokeDashoffset: 100,
              }
            : undefined
        }
      />
    </svg>
  )
}
