import { useState, useRef, useCallback, useEffect } from 'react'
import type { IdeationArtifact, IdeationStage } from '@gstackapp/shared'

/**
 * SSE event types from ideation orchestrator (Plan 01).
 */
type IdeationSSEEvent =
  | { type: 'ideation:stage:start'; stage: string }
  | { type: 'ideation:stage:event'; stage: string; event: AgentSSEEvent }
  | { type: 'ideation:stage:complete'; stage: string }
  | { type: 'ideation:stage:artifact'; stage: string; path: string }
  | { type: 'ideation:stage:error'; stage: string; error: string }
  | { type: 'ideation:pipeline:complete' }

/**
 * Agent-level SSE events forwarded from skill execution.
 */
export interface AgentSSEEvent {
  type: string
  content?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_result?: string
  error?: string
}

export type IdeationStatus = 'idle' | 'submitting' | 'running' | 'complete' | 'error'
export type StageStatus = 'pending' | 'running' | 'complete' | 'error'

const IDEATION_STAGES: IdeationStage[] = [
  'office-hours',
  'plan-ceo-review',
  'plan-eng-review',
  'design-consultation',
]

/**
 * Custom hook managing full ideation lifecycle with SSE consumption.
 *
 * Handles: idea submission, SSE event stream, stage state tracking,
 * artifact fetching, and conversation event forwarding.
 */
export function useIdeation() {
  const [idea, setIdea] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<IdeationStatus>('idle')
  const [stages, setStages] = useState<Map<string, StageStatus>>(() => {
    const m = new Map<string, StageStatus>()
    for (const s of IDEATION_STAGES) m.set(s, 'pending')
    return m
  })
  const [artifacts, setArtifacts] = useState<IdeationArtifact[]>([])
  const [activeStage, setActiveStage] = useState<string | null>(null)
  const [conversationEvents, setConversationEvents] = useState<AgentSSEEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  const sourceRef = useRef<EventSource | null>(null)

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      sourceRef.current?.close()
      sourceRef.current = null
    }
  }, [])

  const fetchArtifacts = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/ideation/artifacts/${sid}`)
      if (res.ok) {
        const data = await res.json()
        setArtifacts(data.artifacts ?? data)
      }
    } catch {
      // Non-critical — artifact list will refresh on next stage
    }
  }, [])

  const connectSSE = useCallback(
    (sid: string) => {
      // Close existing connection
      sourceRef.current?.close()

      const source = new EventSource(`/api/ideation/stream/${sid}`)
      sourceRef.current = source

      source.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as IdeationSSEEvent

          switch (data.type) {
            case 'ideation:stage:start':
              setStages((prev) => {
                const next = new Map(prev)
                next.set(data.stage, 'running')
                return next
              })
              setActiveStage(data.stage)
              setConversationEvents([])
              break

            case 'ideation:stage:event':
              setConversationEvents((prev) => [...prev, data.event])
              break

            case 'ideation:stage:complete':
              setStages((prev) => {
                const next = new Map(prev)
                next.set(data.stage, 'complete')
                return next
              })
              break

            case 'ideation:stage:artifact':
              fetchArtifacts(sid)
              break

            case 'ideation:stage:error':
              setStages((prev) => {
                const next = new Map(prev)
                next.set(data.stage, 'error')
                return next
              })
              setError(`Stage ${data.stage} failed: ${data.error}`)
              break

            case 'ideation:pipeline:complete':
              setStatus('complete')
              source.close()
              sourceRef.current = null
              break
          }
        } catch {
          // Ignore malformed events
        }
      }

      source.onerror = () => {
        // EventSource auto-reconnects on transient errors.
        // Check if the session is in a terminal state and stop if so.
        fetch(`/api/ideation/${sid}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.status === 'failed' || data.status === 'complete' || data.error) {
              source.close()
              sourceRef.current = null
              if (data.status === 'failed') {
                setStatus('error')
                setError(data.error ?? 'Pipeline failed')
              }
            }
          })
          .catch(() => {
            // Session not found — stop retrying
            source.close()
            sourceRef.current = null
            setStatus('error')
            setError('Lost connection to pipeline')
          })
      }
    },
    [fetchArtifacts]
  )

  const startIdeation = useCallback(
    async (ideaText: string) => {
      setStatus('submitting')
      setError(null)

      // Reset stages
      setStages(() => {
        const m = new Map<string, StageStatus>()
        for (const s of IDEATION_STAGES) m.set(s, 'pending')
        return m
      })
      setArtifacts([])
      setConversationEvents([])
      setActiveStage(null)

      try {
        const res = await fetch('/api/ideation/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idea: ideaText }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Request failed' }))
          throw new Error(err.error ?? 'Failed to start ideation')
        }

        const data = await res.json()
        setSessionId(data.id)
        setStatus('running')
        connectSSE(data.id)
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    },
    [connectSSE]
  )

  return {
    idea,
    setIdea,
    startIdeation,
    sessionId,
    status,
    stages,
    artifacts,
    activeStage,
    conversationEvents,
    error,
  }
}
