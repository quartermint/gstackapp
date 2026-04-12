import { EventEmitter } from 'node:events'

// ── Event Types ─────────────────────────────────────────────────────────────

export type PipelineEventType =
  | 'pipeline:started'
  | 'pipeline:completed'
  | 'pipeline:failed'
  | 'stage:running'
  | 'stage:completed'

// ── Ideation Event Types ───────────────────────────────────────────────────

export type IdeationEventType =
  | 'ideation:stage:start'
  | 'ideation:stage:event'
  | 'ideation:stage:complete'
  | 'ideation:stage:artifact'
  | 'ideation:stage:error'
  | 'ideation:pipeline:complete'

// ── Autonomous Event Types ─────────────────────────────────────────────────

export type AutonomousEventType =
  | 'autonomous:phase:start'
  | 'autonomous:phase:complete'
  | 'autonomous:phase:failed'
  | 'autonomous:commit'
  | 'autonomous:agent:spawn'
  | 'autonomous:gate:created'
  | 'autonomous:gate:resolved'
  | 'autonomous:complete'

// ── Operator Pipeline Event Types ─────────────────────────────────────────

export type OperatorEventType =
  | 'operator:progress'
  | 'operator:gate'
  | 'operator:gate:resolved'
  | 'operator:complete'
  | 'operator:clarification:question'
  | 'operator:clarification:complete'
  | 'operator:brief:generated'
  | 'operator:brief:approved'
  | 'operator:error'
  | 'operator:verification:report'
  | 'operator:gbrain:degraded'

export interface OperatorEvent {
  type: OperatorEventType
  runId: string
  stage?: string
  status?: string
  message?: string
  result?: unknown
  gateId?: string
  title?: string
  description?: string
  options?: string[]
  timestamp: string
}

export interface PipelineEvent {
  type: PipelineEventType
  runId: string
  stage?: string
  verdict?: string
  timestamp: string
}

export interface IdeationEvent {
  type: IdeationEventType
  sessionId: string
  stage?: string
  artifactPath?: string
  error?: string
  timestamp: string
}

export interface AutonomousEvent {
  type: AutonomousEventType
  runId: string
  phase?: string
  commitHash?: string
  agentId?: string
  gateId?: string
  timestamp: string
}

// ── Event Bus Singleton ─────────────────────────────────────────────────────

export const pipelineBus = new EventEmitter()

// Allow up to 50 concurrent SSE listeners without warnings
pipelineBus.setMaxListeners(50)
