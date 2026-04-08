import { useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DecisionGate {
  id: string
  title: string
  description: string
  options: Array<{ id: string; label: string }>
  blocking: boolean
  response: string | null
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages decision gate queue for autonomous execution.
 * Blocking gates sort first per D-11: blocking decisions surface prominently.
 */
export function useDecisionGates(runId: string | null) {
  const [gates, setGates] = useState<DecisionGate[]>([])

  const pendingCount = gates.filter(g => g.response === null).length

  const addGate = useCallback((gate: DecisionGate) => {
    setGates(prev => {
      const updated = [...prev, gate]
      // Sort: blocking gates first, then by insertion order
      return updated.sort((a, b) => {
        if (a.response !== null && b.response === null) return 1
        if (a.response === null && b.response !== null) return -1
        if (a.blocking && !b.blocking) return -1
        if (!a.blocking && b.blocking) return 1
        return 0
      })
    })
  }, [])

  const respondToGate = useCallback(async (gateId: string, response: string) => {
    if (!runId) return

    try {
      const res = await fetch(`/api/autonomous/${runId}/gate-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateId, response }),
      })

      if (!res.ok) return

      // Optimistically update the gate as resolved
      setGates(prev =>
        prev.map(g => g.id === gateId ? { ...g, response } : g)
      )
    } catch {
      // Silent fail — SSE will confirm resolution
    }
  }, [runId])

  const resolveGate = useCallback((gateId: string) => {
    setGates(prev =>
      prev.map(g => g.id === gateId ? { ...g, response: g.response ?? 'resolved' } : g)
    )
  }, [])

  return {
    gates,
    pendingCount,
    addGate,
    respondToGate,
    resolveGate,
  }
}
