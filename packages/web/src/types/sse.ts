export type PipelineEventType =
  | 'pipeline:started'
  | 'pipeline:completed'
  | 'pipeline:failed'
  | 'stage:running'
  | 'stage:completed'

export interface PipelineSSEEvent {
  type: PipelineEventType
  runId: string
  stage?: string
  verdict?: string
  timestamp: string
}
