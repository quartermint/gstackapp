import { useState, useCallback, useRef, useEffect } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type PhaseStatus = 'pending' | 'running' | 'complete' | 'failed' | 'blocked'

export interface PhaseInfo {
  number: number
  name: string
  status: PhaseStatus
}

export interface CommitInfo {
  phase: number
  hash: string
  message: string
  timestamp: string
}

export interface AgentSpawn {
  phase: number
  agentId: string
  role: string
}

export interface CompletionSummary {
  totalPhases: number
  totalCommits: number
  elapsedMs: number
}

export type ExecutionStatus = 'idle' | 'launching' | 'running' | 'complete' | 'failed'

export interface DecisionGate {
  id: string
  title: string
  description: string
  options: Array<{ id: string; label: string }>
  blocking: boolean
  response: string | null
}

interface AutonomousState {
  runId: string | null
  status: ExecutionStatus
  phases: PhaseInfo[]
  commits: CommitInfo[]
  agentSpawns: AgentSpawn[]
  completionSummary: CompletionSummary | null
  error: string | null
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAutonomousCallbacks {
  onGateCreated?: (gate: DecisionGate) => void
  onGateResolved?: (gateId: string) => void
}

export function useAutonomous(callbacks?: UseAutonomousCallbacks) {
  const [state, setState] = useState<AutonomousState>({
    runId: null,
    status: 'idle',
    phases: [],
    commits: [],
    agentSpawns: [],
    completionSummary: null,
    error: null,
  })

  const sourceRef = useRef<EventSource | null>(null)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        sourceRef.current.close()
        sourceRef.current = null
      }
    }
  }, [])

  const handleSSEEvent = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'autonomous:phases:discovered':
          setState(prev => ({
            ...prev,
            phases: data.phases.map((p: { number: number; name: string }) => ({
              number: p.number,
              name: p.name,
              status: 'pending' as PhaseStatus,
            })),
          }))
          break

        case 'autonomous:phase:start':
          setState(prev => ({
            ...prev,
            phases: prev.phases.map(p =>
              p.number === data.phase ? { ...p, status: 'running' as PhaseStatus } : p
            ),
          }))
          break

        case 'autonomous:phase:complete':
          setState(prev => ({
            ...prev,
            phases: prev.phases.map(p =>
              p.number === data.phase ? { ...p, status: 'complete' as PhaseStatus } : p
            ),
          }))
          break

        case 'autonomous:phase:failed':
          setState(prev => ({
            ...prev,
            phases: prev.phases.map(p =>
              p.number === data.phase ? { ...p, status: 'failed' as PhaseStatus } : p
            ),
          }))
          break

        case 'autonomous:commit':
          setState(prev => ({
            ...prev,
            commits: [...prev.commits, {
              phase: data.phase,
              hash: data.hash,
              message: data.message,
              timestamp: data.timestamp,
            }],
          }))
          break

        case 'autonomous:agent:spawn':
          setState(prev => ({
            ...prev,
            agentSpawns: [...prev.agentSpawns, {
              phase: data.phase,
              agentId: data.agentId,
              role: data.role,
            }],
          }))
          break

        case 'autonomous:gate:created':
          callbacksRef.current?.onGateCreated?.({
            id: data.gateId,
            title: data.title,
            description: data.description,
            options: data.options,
            blocking: data.blocking,
            response: null,
          })
          // If blocking, mark the current running phase as blocked
          if (data.blocking) {
            setState(prev => ({
              ...prev,
              phases: prev.phases.map(p =>
                p.status === 'running' ? { ...p, status: 'blocked' as PhaseStatus } : p
              ),
            }))
          }
          break

        case 'autonomous:gate:resolved':
          callbacksRef.current?.onGateResolved?.(data.gateId)
          // Unblock: set blocked phase back to running
          setState(prev => ({
            ...prev,
            phases: prev.phases.map(p =>
              p.status === 'blocked' ? { ...p, status: 'running' as PhaseStatus } : p
            ),
          }))
          break

        case 'autonomous:complete':
          setState(prev => ({
            ...prev,
            status: 'complete',
            completionSummary: {
              totalPhases: data.totalPhases,
              totalCommits: data.totalCommits,
              elapsedMs: data.elapsedMs,
            },
          }))
          if (sourceRef.current) {
            sourceRef.current.close()
            sourceRef.current = null
          }
          break

        case 'autonomous:error':
          setState(prev => ({
            ...prev,
            status: 'failed',
            error: data.message,
          }))
          if (sourceRef.current) {
            sourceRef.current.close()
            sourceRef.current = null
          }
          break
      }
    } catch {
      // Ignore parse errors on SSE data
    }
  }, [])

  const launchExecution = useCallback(async (projectPath: string, ideationSessionId?: string) => {
    setState(prev => ({ ...prev, status: 'launching', error: null }))

    try {
      const body: Record<string, string> = { projectPath }
      if (ideationSessionId) body.ideationSessionId = ideationSessionId

      const res = await fetch('/api/autonomous/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Launch failed' }))
        setState(prev => ({
          ...prev,
          status: 'failed',
          error: err.message || 'Launch failed',
        }))
        return
      }

      const { runId } = await res.json()

      setState(prev => ({
        ...prev,
        runId,
        status: 'running',
        phases: [],
        commits: [],
        agentSpawns: [],
        completionSummary: null,
      }))

      // Open SSE connection
      const source = new EventSource(`/api/autonomous/stream/${runId}`)
      sourceRef.current = source

      source.onmessage = handleSSEEvent

      source.onerror = () => {
        setState(prev => ({
          ...prev,
          status: prev.status === 'complete' ? 'complete' : 'failed',
          error: prev.status === 'complete' ? prev.error : 'Connection lost. Check your connection and try again.',
        }))
        source.close()
        sourceRef.current = null
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Launch failed',
      }))
    }
  }, [handleSSEEvent])

  const cancelExecution = useCallback(async () => {
    if (!state.runId) return

    try {
      await fetch(`/api/autonomous/${state.runId}/cancel`, { method: 'POST' })
    } catch {
      // Best-effort cancel
    }

    if (sourceRef.current) {
      sourceRef.current.close()
      sourceRef.current = null
    }

    setState(prev => ({
      ...prev,
      status: 'failed',
      error: 'Execution cancelled by user.',
    }))
  }, [state.runId])

  return {
    runId: state.runId,
    status: state.status,
    phases: state.phases,
    commits: state.commits,
    agentSpawns: state.agentSpawns,
    completionSummary: state.completionSummary,
    error: state.error,
    launchExecution,
    cancelExecution,
  }
}
