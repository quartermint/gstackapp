import type { PhaseStatus } from '../../hooks/useAutonomous'
import { PhaseNode } from './PhaseNode'

// ── Types ────────────────────────────────────────────────────────────────────

interface Phase {
  number: number
  name: string
  status: PhaseStatus
}

interface Commit {
  phase: number
}

interface AgentSpawn {
  phase: number
  agentId: string
  role: string
}

interface AutonomousPipelineProps {
  phases: Phase[]
  commits: Commit[]
  agentSpawns: AgentSpawn[]
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Vertical pipeline visualization for GSD autonomous execution.
 * Shows phases as connected nodes (top to bottom) with vertical connectors.
 *
 * Per UI spec:
 * - Vertical flex layout, nodes connected by vertical connectors
 * - Connector: 2px line, --color-border default, animated dashed when tracing
 * - Each PhaseNode receives filtered commit count and agent spawns
 */
export function AutonomousPipeline({ phases, commits, agentSpawns }: AutonomousPipelineProps) {
  return (
    <div className="flex flex-col items-stretch w-full">
      {phases.map((phase, idx) => {
        const phaseCommits = commits.filter(c => c.phase === phase.number).length
        const phaseAgents = agentSpawns.filter(a => a.phase === phase.number)
        const isLast = idx === phases.length - 1

        // Connector is active if this phase is complete/running and next exists
        const nextPhase = phases[idx + 1]
        const connectorActive =
          !isLast &&
          (phase.status === 'complete' || phase.status === 'running') &&
          nextPhase !== undefined

        return (
          <div key={phase.number}>
            <PhaseNode
              phase={phase}
              status={phase.status}
              commitCount={phaseCommits}
              agentSpawns={phaseAgents}
            />

            {/* Vertical connector between nodes */}
            {!isLast && (
              <div className="flex justify-center py-0">
                <svg width="2" height="24" viewBox="0 0 2 24" className="shrink-0">
                  <line
                    x1="1"
                    y1="0"
                    x2="1"
                    y2="24"
                    stroke={connectorActive ? 'var(--color-accent)' : '#2A2F3A'}
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    style={
                      connectorActive
                        ? {
                            animation: 'trace-flow 2.5s linear infinite',
                            strokeDashoffset: 100,
                          }
                        : undefined
                    }
                  />
                </svg>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
