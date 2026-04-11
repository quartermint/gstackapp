import { useState, useEffect, useCallback } from 'react'
import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface StageProgress {
  stage: string
  status: 'running' | 'complete'
  message?: string
}

interface GateEvent {
  gateId: string
  title: string
  description: string
  options: string[]
}

interface PipelineProgressProps {
  requestId: string
}

// ── Stage display helpers ────────────────────────────────────────────────────

const STAGE_ORDER = ['clarify', 'plan', 'execute', 'verify']

const stageLabels: Record<string, string> = {
  clarify: 'Understanding request',
  plan: 'Planning approach',
  execute: 'Executing changes',
  verify: 'Verifying results',
}

function StageIcon({ status }: { status: 'pending' | 'running' | 'complete' }) {
  if (status === 'complete') {
    return (
      <div className="w-5 h-5 rounded-full bg-pass/20 flex items-center justify-center flex-shrink-0">
        <svg className="w-3 h-3 text-pass" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    )
  }
  if (status === 'running') {
    return (
      <div className="w-5 h-5 rounded-full border-2 border-running flex items-center justify-center flex-shrink-0 animate-pulse">
        <div className="w-2 h-2 rounded-full bg-running" />
      </div>
    )
  }
  return (
    <div className="w-5 h-5 rounded-full border border-border flex-shrink-0" />
  )
}

// ── Gate Card ────────────────────────────────────────────────────────────────

function GateCard({
  gate,
  requestId,
  onResolved,
}: {
  gate: GateEvent
  requestId: string
  onResolved: () => void
}) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleResponse = async (response: string) => {
    setSending(true)
    try {
      const res = await fetch(`/api/operator/${requestId}/gate-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateId: gate.gateId, response }),
      })
      if (res.ok) {
        setSent(true)
        onResolved()
      }
    } catch {
      // Silently fail -- user can retry
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="bg-surface border border-border rounded-md p-3 border-l-2 border-l-pass">
        <p className="text-[13px] text-text-muted">
          Response sent. Waiting for pipeline to continue...
        </p>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-md p-3 border-l-2 border-l-flag animate-[fadeIn_250ms_ease-out_both]">
      <h4 className="text-[13px] font-medium text-text-primary leading-snug mb-1">
        {gate.title}
      </h4>
      <p className="text-[13px] text-text-muted leading-relaxed mb-3">
        {gate.description}
      </p>
      <div className="flex flex-wrap gap-2">
        {gate.options.map((option, idx) => (
          <button
            key={option}
            onClick={() => handleResponse(option)}
            disabled={sending}
            className={cn(
              'text-[12px] font-medium px-3 py-1.5 rounded border transition-colors',
              idx === 0
                ? 'border-accent/30 text-accent hover:bg-accent/10 hover:text-accent-hover'
                : 'border-border text-text-muted hover:text-text-primary hover:border-border-focus',
              sending && 'opacity-40 cursor-not-allowed',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

/**
 * Real-time pipeline progress display with SSE.
 * Shows stages as a vertical progress list, renders decision gate buttons,
 * and displays completion state.
 *
 * Per 17-CONTEXT.md: "feels like texting a capable assistant, not enterprise software."
 */
export function PipelineProgress({ requestId }: PipelineProgressProps) {
  const [stages, setStages] = useState<Map<string, StageProgress>>(new Map())
  const [gates, setGates] = useState<GateEvent[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [connected, setConnected] = useState(false)

  const handleGateResolved = useCallback(() => {
    // Gate was responded to -- UI already shows "waiting" state
  }, [])

  useEffect(() => {
    const eventSource = new EventSource('/api/sse')

    eventSource.onopen = () => setConnected(true)
    eventSource.onerror = () => setConnected(false)

    // Listen for all event types via generic message handler
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.runId !== requestId) return

        if (data.type === 'operator:progress') {
          setStages((prev) => {
            const next = new Map(prev)
            next.set(data.stage, {
              stage: data.stage,
              status: data.status,
              message: data.message,
            })
            return next
          })
        }

        if (data.type === 'operator:gate') {
          setGates((prev) => [...prev, {
            gateId: data.gateId,
            title: data.title,
            description: data.description,
            options: data.options,
          }])
        }

        if (data.type === 'operator:gate:resolved') {
          setGates((prev) => prev.filter(g => g.gateId !== data.gateId))
        }

        if (data.type === 'operator:complete') {
          setIsComplete(true)
        }
      } catch {
        // Ignore non-JSON events (heartbeat, etc.)
      }
    }

    // Also listen for typed events
    const handleTypedEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (data.runId !== requestId) return

        if (event.type === 'operator:progress') {
          setStages((prev) => {
            const next = new Map(prev)
            next.set(data.stage, {
              stage: data.stage,
              status: data.status,
              message: data.message,
            })
            return next
          })
        }
        if (event.type === 'operator:gate') {
          setGates((prev) => {
            if (prev.some(g => g.gateId === data.gateId)) return prev
            return [...prev, {
              gateId: data.gateId,
              title: data.title,
              description: data.description,
              options: data.options,
            }]
          })
        }
        if (event.type === 'operator:gate:resolved') {
          setGates((prev) => prev.filter(g => g.gateId !== data.gateId))
        }
        if (event.type === 'operator:complete') {
          setIsComplete(true)
        }
      } catch {
        // Ignore parse errors
      }
    }

    eventSource.addEventListener('operator:progress', handleTypedEvent)
    eventSource.addEventListener('operator:gate', handleTypedEvent)
    eventSource.addEventListener('operator:gate:resolved', handleTypedEvent)
    eventSource.addEventListener('operator:complete', handleTypedEvent)

    return () => {
      eventSource.close()
    }
  }, [requestId])

  // Derive stage display order
  const stageList = STAGE_ORDER.map((stageName) => {
    const progress = stages.get(stageName)
    return {
      name: stageName,
      label: stageLabels[stageName] ?? stageName,
      status: progress?.status ?? 'pending' as 'pending' | 'running' | 'complete',
      message: progress?.message,
    }
  })

  return (
    <div className="space-y-sm">
      {/* Connection indicator */}
      {!connected && (
        <div className="text-[11px] font-mono text-text-muted flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-flag animate-pulse" />
          Connecting...
        </div>
      )}

      {/* Completion badge */}
      {isComplete && (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-pass/10 border border-pass/20">
          <svg className="w-3.5 h-3.5 text-pass" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-mono text-[11px] text-pass uppercase tracking-[0.06em]">
            Complete
          </span>
        </div>
      )}

      {/* Stage progress list */}
      <div className="space-y-1">
        {stageList.map((stage) => (
          <div
            key={stage.name}
            className={cn(
              'flex items-center gap-2 py-1',
              stage.status === 'running' && 'text-text-primary',
              stage.status === 'complete' && 'text-text-muted',
              stage.status === 'pending' && 'text-text-muted/50',
            )}
          >
            <StageIcon status={stage.status} />
            <span className="font-body text-[13px]">{stage.label}</span>
            {stage.message && stage.status === 'running' && (
              <span className="font-body text-[12px] text-text-muted ml-1 truncate">
                — {stage.message}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Decision gates */}
      {gates.length > 0 && (
        <div className="space-y-2 mt-sm">
          {gates.map((gate) => (
            <GateCard
              key={gate.gateId}
              gate={gate}
              requestId={requestId}
              onResolved={handleGateResolved}
            />
          ))}
        </div>
      )}
    </div>
  )
}
