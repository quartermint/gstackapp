import { EventEmitter } from 'node:events'

// ── Event Types ─────────────────────────────────────────────────────────────

export type PipelineEventType =
  | 'pipeline:started'
  | 'pipeline:completed'
  | 'pipeline:failed'
  | 'stage:running'
  | 'stage:completed'

export interface PipelineEvent {
  type: PipelineEventType
  runId: string
  stage?: string
  verdict?: string
  timestamp: string
}

// ── Event Bus Singleton ─────────────────────────────────────────────────────

export const pipelineBus = new EventEmitter()

// Allow up to 50 concurrent SSE listeners without warnings
pipelineBus.setMaxListeners(50)
