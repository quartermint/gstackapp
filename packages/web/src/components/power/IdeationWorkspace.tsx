import { FlowStepNode } from './FlowStepNode'
import { IdeationView } from '../ideation/IdeationView'

interface IdeationWorkspaceProps {
  onLaunchExecution: (sessionId: string) => void
}

/**
 * Flow step definitions for the ideation pipeline.
 * Colors match DESIGN.md stage identity colors (FLAG amber for Office Hours intake).
 */
const FLOW_STEPS = [
  { label: 'Office Hours', color: '#FFB020' },
  { label: 'CEO Review', color: '#FF8B3E' },
  { label: 'Eng Review', color: '#36C9FF' },
  { label: 'Execution', color: '#2EDB87' },
] as const

/**
 * Enhanced ideation workspace with flow diagram header (DASH-03).
 *
 * Shows a horizontal pipeline flow (Office Hours -> CEO Review -> Eng Review -> Execution)
 * above the existing IdeationView. All steps start as pending — active step detection
 * requires reading ideation session state (future enhancement).
 *
 * Per UI-SPEC: Flow header is 80px height, full width, border-b, bg-surface.
 */
export function IdeationWorkspace({ onLaunchExecution }: IdeationWorkspaceProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Flow diagram header */}
      <div className="h-[80px] flex items-center justify-center gap-0 px-8 border-b border-border bg-surface shrink-0">
        {FLOW_STEPS.map((step, index) => (
          <div key={step.label} className="flex items-center">
            {/* Connector line before each step except the first */}
            {index > 0 && (
              <div className="w-12 h-[2px] bg-border" />
            )}
            <FlowStepNode
              label={step.label}
              color={step.color}
              state="pending"
            />
          </div>
        ))}
      </div>

      {/* Existing IdeationView below */}
      <div className="flex-1 overflow-hidden">
        <IdeationView onLaunchExecution={onLaunchExecution} />
      </div>
    </div>
  )
}
