import { useState, useEffect, useCallback, useRef } from 'react'
import { IntakeForm } from './IntakeForm'
import { RequestHistory } from './RequestHistory'
import { ClarificationThread } from './ClarificationThread'
import { ExecutionBrief } from './ExecutionBrief'
import { OperatorProgressBar, STAGE_MAP } from './OperatorProgressBar'
import { ErrorCard } from './ErrorCard'
import { VerificationReport } from './VerificationReport'
import { AuditTrail } from './AuditTrail'
import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface ExecutionBriefData {
  scope: string[]
  assumptions: string[]
  acceptanceCriteria: string[]
}

interface VerificationReportData {
  passed: boolean
  summary: string
  whatBuilt: string[]
  qualityChecks: { passed: number; total: number }
  filesChanged: number
  failureDetails?: string
}

interface GateEvent {
  gateId: string
  title: string
  description: string
  options: string[]
}

type OperatorViewState =
  | { phase: 'idle' }
  | { phase: 'clarifying'; requestId: string; questions: Array<{ question: string; answer?: string }> }
  | { phase: 'briefing'; requestId: string; brief: ExecutionBriefData; questions: Array<{ question: string; answer: string }> }
  | { phase: 'running'; requestId: string; currentStage: string; startedAt: string }
  | { phase: 'complete'; requestId: string; report: VerificationReportData }
  | { phase: 'error'; requestId: string; errorType: string; message: string; report?: VerificationReportData }
  | { phase: 'escalated'; requestId: string }

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Operator home page — chat-thread orchestrator.
 * Manages the full intake-to-completion flow via SSE-driven state machine.
 * Single page, no navigation. All interaction happens within the thread.
 */
export function OperatorHome() {
  const [viewState, setViewState] = useState<OperatorViewState>({ phase: 'idle' })
  const [gates, setGates] = useState<GateEvent[]>([])
  const [gateSending, setGateSending] = useState<string | null>(null)
  const [clarifySubmitting, setClarifySubmitting] = useState(false)
  const [briefSubmitting, setBriefSubmitting] = useState(false)

  // ── SSE Connection ──────────────────────────────────────────────────────

  useEffect(() => {
    if (viewState.phase === 'idle' || viewState.phase === 'complete' || viewState.phase === 'escalated') {
      return
    }

    const requestId = viewState.requestId
    const eventSource = new EventSource('/api/sse')

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // T-18-11: Filter SSE events by runId matching active requestId
        if (data.runId !== requestId) return

        handleSSEEvent(data)
      } catch {
        // Ignore non-JSON events (heartbeat, etc.)
      }
    }

    // Also listen for typed events
    const typedEvents = [
      'operator:clarification:question',
      'operator:clarification:complete',
      'operator:brief:generated',
      'operator:brief:approved',
      'operator:progress',
      'operator:gate',
      'operator:gate:resolved',
      'operator:complete',
      'operator:error',
      'operator:verification:report',
    ]

    const handleTyped = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (data.runId !== requestId) return
        handleSSEEvent({ ...data, type: event.type })
      } catch {
        // Ignore parse errors
      }
    }

    typedEvents.forEach((type) => {
      eventSource.addEventListener(type, handleTyped)
    })

    return () => {
      eventSource.close()
    }
  }, [viewState.phase, viewState.phase !== 'idle' ? (viewState as { requestId: string }).requestId : null])

  // ── SSE Event Handler ───────────────────────────────────────────────────

  const handleSSEEvent = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string

    if (type === 'operator:clarification:question') {
      setViewState((prev) => {
        if (prev.phase !== 'clarifying') {
          return {
            phase: 'clarifying',
            requestId: data.runId as string,
            questions: [{ question: data.question as string }],
          }
        }
        return {
          ...prev,
          questions: [...prev.questions, { question: data.question as string }],
        }
      })
    }

    if (type === 'operator:brief:generated') {
      setViewState((prev) => {
        const questions = prev.phase === 'clarifying'
          ? prev.questions.map((q) => ({ question: q.question, answer: q.answer ?? '' }))
          : []
        return {
          phase: 'briefing',
          requestId: data.runId as string,
          brief: data.brief as ExecutionBriefData,
          questions,
        }
      })
    }

    if (type === 'operator:brief:approved') {
      setViewState((prev) => ({
        phase: 'running',
        requestId: (prev as { requestId: string }).requestId,
        currentStage: 'thinking',
        startedAt: new Date().toISOString(),
      }))
    }

    if (type === 'operator:progress') {
      const mappedStage = STAGE_MAP[data.stage as string] ?? (data.stage as string)
      setViewState((prev) => {
        if (prev.phase !== 'running') return prev
        return {
          ...prev,
          currentStage: (data.status as string) === 'complete' ? mappedStage : mappedStage,
        }
      })
    }

    if (type === 'operator:gate') {
      setGates((prev) => {
        if (prev.some((g) => g.gateId === (data.gateId as string))) return prev
        return [
          ...prev,
          {
            gateId: data.gateId as string,
            title: data.title as string,
            description: data.description as string,
            options: data.options as string[],
          },
        ]
      })
    }

    if (type === 'operator:gate:resolved') {
      setGates((prev) => prev.filter((g) => g.gateId !== (data.gateId as string)))
    }

    if (type === 'operator:verification:report') {
      const report = data.report as VerificationReportData
      // Store report, will be used when complete event arrives
      setViewState((prev) => {
        if (prev.phase === 'running') {
          return prev // Wait for complete event
        }
        return prev
      })
      // If complete already happened, show report
      setViewState((prev) => {
        if (prev.phase === 'complete' && !prev.report) {
          return { ...prev, report }
        }
        return prev
      })
      // Store the report for when complete arrives
      reportRef.current = report
    }

    if (type === 'operator:complete') {
      setViewState((prev) => ({
        phase: 'complete',
        requestId: (prev as { requestId: string }).requestId,
        report: reportRef.current ?? {
          passed: true,
          summary: 'Request completed successfully.',
          whatBuilt: [],
          qualityChecks: { passed: 0, total: 0 },
          filesChanged: 0,
        },
      }))
    }

    if (type === 'operator:error') {
      setViewState((prev) => ({
        phase: 'error',
        requestId: (prev as { requestId: string }).requestId,
        errorType: data.errorType as string,
        message: data.message as string,
        report: data.report as VerificationReportData | undefined,
      }))
    }
  }, [])

  // Use a ref to pass verification report between events
  const reportRef = useRef<VerificationReportData | null>(null)

  // ── Action Handlers ─────────────────────────────────────────────────────

  const handleRequestSubmitted = useCallback((requestId: string) => {
    setViewState({
      phase: 'clarifying',
      requestId,
      questions: [],
    })
  }, [])

  const handleClarifyAnswer = useCallback(async (answer: string) => {
    if (viewState.phase !== 'clarifying') return
    const { requestId } = viewState

    setClarifySubmitting(true)
    try {
      // Update local state with the answer
      setViewState((prev) => {
        if (prev.phase !== 'clarifying') return prev
        const questions = [...prev.questions]
        const lastIdx = questions.length - 1
        if (lastIdx >= 0 && !questions[lastIdx].answer) {
          questions[lastIdx] = { ...questions[lastIdx], answer }
        }
        return { ...prev, questions }
      })

      const res = await fetch(`/api/operator/${requestId}/clarify-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to submit answer' }))
        setViewState({ phase: 'error', requestId, errorType: 'request-failed', message: err.error ?? 'Failed to submit answer' })
      }
    } catch {
      // Network error — SSE will drive state if server is reachable
    } finally {
      setClarifySubmitting(false)
    }
  }, [viewState])

  const handleApproveBrief = useCallback(async () => {
    if (viewState.phase !== 'briefing') return
    const { requestId } = viewState

    setBriefSubmitting(true)
    try {
      const res = await fetch(`/api/operator/${requestId}/approve-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to approve brief' }))
        setViewState({ phase: 'error', requestId, errorType: 'request-failed', message: err.error ?? 'Failed to approve brief' })
      }
    } catch {
      // Network error
    } finally {
      setBriefSubmitting(false)
    }
  }, [viewState])

  const handleRejectBrief = useCallback(async () => {
    if (viewState.phase !== 'briefing') return
    const { requestId } = viewState

    setBriefSubmitting(true)
    try {
      const res = await fetch(`/api/operator/${requestId}/reject-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to reject brief' }))
        setViewState({ phase: 'error', requestId, errorType: 'request-failed', message: err.error ?? 'Failed to reject brief' })
      } else {
        // Return to clarifying state
        setViewState({
          phase: 'clarifying',
          requestId,
          questions: viewState.questions,
        })
      }
    } catch {
      // Network error
    } finally {
      setBriefSubmitting(false)
    }
  }, [viewState])

  const handleErrorAction = useCallback(async (action: string) => {
    if (viewState.phase !== 'error') return
    const { requestId } = viewState

    if (action === 'wait') {
      try {
        const res = await fetch(`/api/operator/${requestId}/retry-timeout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (res.ok) {
          setViewState({
            phase: 'running',
            requestId,
            currentStage: 'building',
            startedAt: new Date().toISOString(),
          })
        } else {
          const err = await res.json().catch(() => ({ error: 'Retry failed' }))
          setViewState({ phase: 'error', requestId, errorType: 'request-failed', message: err.error ?? 'Retry failed' })
        }
      } catch {
        // Network error
      }
    } else if (action === 'escalate') {
      try {
        const res = await fetch(`/api/operator/${requestId}/escalate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (res.ok) {
          setViewState({ phase: 'escalated', requestId })
        } else {
          const err = await res.json().catch(() => ({ error: 'Escalation failed' }))
          setViewState({ phase: 'error', requestId, errorType: 'request-failed', message: err.error ?? 'Escalation failed' })
        }
      } catch {
        // Network error
      }
    } else if (action === 'request-changes') {
      setViewState({
        phase: 'clarifying',
        requestId,
        questions: [{ question: 'What changes would you like to make?' }],
      })
    } else if (action === 'retry') {
      try {
        const res = await fetch(`/api/operator/${requestId}/retry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (res.ok) {
          setViewState({
            phase: 'running',
            requestId,
            currentStage: 'thinking',
            startedAt: new Date().toISOString(),
          })
        } else {
          const err = await res.json().catch(() => ({ error: 'Retry failed' }))
          setViewState({ phase: 'error', requestId, errorType: 'request-failed', message: err.error ?? 'Retry failed' })
        }
      } catch {
        // Network error
      }
    }
  }, [viewState])

  const handleGateResponse = useCallback(async (gateId: string, response: string) => {
    if (viewState.phase !== 'running') return
    const { requestId } = viewState

    setGateSending(gateId)
    try {
      const res = await fetch(`/api/operator/${requestId}/gate-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateId, response }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Gate response failed' }))
        setViewState({ phase: 'error', requestId, errorType: 'request-failed', message: err.error ?? 'Gate response failed' })
      }
    } catch {
      // Network error
    } finally {
      setGateSending(null)
    }
  }, [viewState])

  const handleGateEscalate = useCallback(async () => {
    if (viewState.phase !== 'running') return
    const { requestId } = viewState

    try {
      const res = await fetch(`/api/operator/${requestId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        setViewState({ phase: 'escalated', requestId })
      } else {
        const err = await res.json().catch(() => ({ error: 'Escalation failed' }))
        setViewState({ phase: 'error', requestId, errorType: 'request-failed', message: err.error ?? 'Escalation failed' })
      }
    } catch {
      // Network error
    }
  }, [viewState])

  // ── Render ──────────────────────────────────────────────────────────────

  const activeRequestId = viewState.phase !== 'idle' ? viewState.requestId : null

  return (
    <div className="flex-1 overflow-y-auto px-xl py-xl max-w-[720px]">
      {/* Heading */}
      <h1 className="font-display text-[24px] leading-[1.2] font-semibold text-text-primary tracking-[-0.02em] mb-lg">
        What can I help with?
      </h1>

      {/* Intake form */}
      <IntakeForm
        onSubmitted={handleRequestSubmitted}
        disabled={viewState.phase !== 'idle'}
      />

      {/* Chat thread: clarification Q&A */}
      {viewState.phase !== 'idle' && 'questions' in viewState && viewState.questions.length > 0 && (
        <div className="mt-lg space-y-md">
          <ClarificationThread
            requestId={viewState.requestId}
            questions={viewState.questions}
            isWaitingForAnswer={viewState.phase === 'clarifying' && !clarifySubmitting}
            onAnswer={handleClarifyAnswer}
          />
        </div>
      )}

      {/* Execution brief */}
      {viewState.phase === 'briefing' && (
        <div className="mt-lg">
          <ExecutionBrief
            requestId={viewState.requestId}
            brief={viewState.brief}
            onApprove={handleApproveBrief}
            onReject={handleRejectBrief}
            isSubmitting={briefSubmitting}
          />
        </div>
      )}

      {/* Progress bar */}
      {viewState.phase === 'running' && (
        <div className="mt-lg">
          <OperatorProgressBar
            currentStage={viewState.currentStage as 'thinking' | 'planning' | 'building' | 'checking' | 'done'}
            startedAt={viewState.startedAt}
          />
        </div>
      )}

      {/* Decision gates (inline during running, with Ask Ryan per D-06) */}
      {viewState.phase === 'running' && gates.length > 0 && (
        <div className="mt-md space-y-sm">
          {gates.map((gate) => (
            <div
              key={gate.gateId}
              className="bg-surface border border-border rounded-md p-3 border-l-2 border-l-flag animate-[fadeIn_250ms_ease-out_both]"
            >
              <h4 className="text-[13px] font-medium text-text-primary leading-snug mb-1">
                {gate.title}
              </h4>
              <p className="text-[13px] text-text-muted leading-relaxed mb-3">
                {gate.description}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {gate.options.map((option, idx) => (
                  <button
                    key={option}
                    onClick={() => handleGateResponse(gate.gateId, option)}
                    disabled={gateSending === gate.gateId}
                    className={cn(
                      'text-[12px] font-medium px-3 py-1.5 rounded border transition-colors',
                      idx === 0
                        ? 'border-accent/30 text-accent hover:bg-accent/10 hover:text-accent-hover'
                        : 'border-border text-text-muted hover:text-text-primary hover:border-border-focus',
                      gateSending === gate.gateId && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {option}
                  </button>
                ))}
                {/* D-06: Ask Ryan button on all operator gate cards */}
                <span className="text-text-muted/30 text-[12px]">|</span>
                <button
                  onClick={handleGateEscalate}
                  disabled={gateSending === gate.gateId}
                  className={cn(
                    'text-[12px] font-medium px-3 py-1.5 rounded border border-border text-text-muted hover:text-text-primary hover:border-border-focus transition-colors',
                    gateSending === gate.gateId && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  Ask Ryan
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Verification report */}
      {viewState.phase === 'complete' && viewState.report && (
        <div className="mt-lg">
          <VerificationReport report={viewState.report} />
        </div>
      )}

      {/* Error card */}
      {viewState.phase === 'error' && (
        <div className="mt-lg">
          <ErrorCard
            type={viewState.errorType as 'timeout' | 'verification-failure' | 'ambiguous-scope' | 'provider-exhaustion'}
            message={viewState.message}
            onAction={handleErrorAction}
          />
        </div>
      )}

      {/* Escalated confirmation */}
      {viewState.phase === 'escalated' && (
        <div className="mt-lg bg-surface border border-border rounded-md p-md animate-[fadeIn_250ms_ease-out_both]">
          <p className="text-[13px] text-text-muted">
            Escalated to Ryan. He&apos;ll take a look and get back to you.
          </p>
        </div>
      )}

      {/* Audit trail */}
      {activeRequestId && (
        <div className="mt-lg">
          <AuditTrail requestId={activeRequestId} />
        </div>
      )}

      {/* Divider + Request history */}
      <div className="border-t border-border my-xl" />
      <h2 className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] mb-sm">
        Recent Requests
      </h2>
      <RequestHistory />
    </div>
  )
}
