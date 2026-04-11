import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

// ── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string
  action: string
  detail: string | null
  createdAt: string
}

interface AuditTrailProps {
  requestId: string
}

// ── Action Label Mapping ─────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  request_submitted: 'Request submitted',
  clarification_question: 'Question asked',
  clarification_answer: 'Answer provided',
  brief_generated: 'Execution brief created',
  brief_approved: 'Brief approved',
  pipeline_spawned: 'Pipeline started',
  stage_transition: 'Stage changed',
  gate_response: 'Decision made',
  verification_pass: 'Quality check passed',
  verification_fail: 'Quality check failed',
  timeout_detected: 'Timeout detected',
  escalated_to_ryan: 'Escalated to Ryan',
  pipeline_complete: 'Completed',
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Collapsible audit trail panel (D-07).
 * Shows timestamped events in a vertical timeline format.
 * Fetches audit trail from the request detail endpoint.
 */
export function AuditTrail({ requestId }: AuditTrailProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { data: auditEntries } = useQuery<AuditEntry[]>({
    queryKey: ['operator', 'request', requestId, 'audit'],
    queryFn: async () => {
      const res = await fetch(`/api/operator/request/${requestId}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.auditTrail ?? []
    },
    refetchInterval: 10000,
  })

  const entries = auditEntries ?? []

  return (
    <div>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-[11px] font-mono text-text-muted uppercase tracking-[0.06em] cursor-pointer hover:text-text-primary transition-colors duration-150"
      >
        {isOpen ? 'Hide Activity Log' : 'View Activity Log'}
      </button>

      {/* Timeline */}
      {isOpen && entries.length > 0 && (
        <div className="border-l border-border ml-2 pl-md mt-sm space-y-sm">
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-col">
              <span className="text-[11px] font-mono text-text-muted">
                {formatTimestamp(entry.createdAt)}
              </span>
              <span className="text-[13px] font-body text-text-primary">
                {ACTION_LABELS[entry.action] ?? entry.action}
                {entry.detail && (
                  <span className="text-text-muted ml-1">
                    — {entry.detail}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {isOpen && entries.length === 0 && (
        <p className="text-[13px] text-text-muted mt-sm">No activity yet.</p>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}
