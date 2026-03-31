import type { Stage, Verdict } from '@gstackapp/shared'
import { StageNode } from './StageNode'
import { StageConnector } from './StageConnector'

/** Fixed stage execution order: CEO -> Eng -> Design -> QA -> Security */
const STAGE_ORDER: Stage[] = ['ceo', 'eng', 'design', 'qa', 'security']

interface StageData {
  stage: Stage
  verdict: Verdict | 'RUNNING' | 'PENDING'
  summary?: string
}

interface PipelineTopologyProps {
  stages: StageData[]
}

/**
 * 5-node horizontal pipeline topology layout.
 *
 * Per DESIGN.md:
 * - D-01: Horizontal left-to-right flow
 * - D-03: 5 stages as connected flow nodes
 *
 * Stage order is always CEO -> Eng -> Design -> QA -> Security.
 * Missing stages default to PENDING verdict.
 * Uses stable React keys (stage name) per Pitfall 4.
 */
export function PipelineTopology({ stages }: PipelineTopologyProps) {
  // Create a lookup map from stage data
  const stageMap = new Map(stages.map((s) => [s.stage, s]))

  // Build the ordered stage list, defaulting to PENDING for missing stages
  const orderedStages: StageData[] = STAGE_ORDER.map((stage) => ({
    stage,
    verdict: 'PENDING' as const,
    ...stageMap.get(stage),
  }))

  return (
    <div className="flex items-center justify-center">
      {orderedStages.map((stageData, index) => (
        // Use stage name as key (stable, not array index) per Pitfall 4
        <div key={stageData.stage} className="flex items-center">
          {/* Connector before each stage except the first */}
          {index > 0 && (
            <StageConnector
              active={orderedStages[index - 1].verdict !== 'PENDING'}
            />
          )}
          <StageNode
            stage={stageData.stage}
            verdict={stageData.verdict}
            summary={stageData.summary}
          />
        </div>
      ))}
    </div>
  )
}
