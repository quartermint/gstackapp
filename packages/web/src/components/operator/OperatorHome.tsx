import { useQuery } from '@tanstack/react-query'
import { IntakeForm } from './IntakeForm'
import { RequestHistory } from './RequestHistory'
import { PipelineProgress } from './PipelineProgress'

interface OperatorRequest {
  id: string
  status: string
}

/**
 * Operator home page per D-06.
 * "Operator home IS the intake form" - form at top, history below.
 * When a pipeline is running, shows real-time progress above the history.
 * No sidebar, no extra navigation. Clean and focused.
 */
export function OperatorHome() {
  // Check for any currently running requests
  const { data: requests } = useQuery<OperatorRequest[]>({
    queryKey: ['operator', 'history'],
    queryFn: async () => {
      const res = await fetch('/api/operator/history')
      if (!res.ok) throw new Error('Failed to load history')
      return res.json()
    },
    refetchInterval: 5000, // Poll to catch status changes
  })

  const runningRequests = requests?.filter(r => r.status === 'running') ?? []

  return (
    <div className="flex-1 overflow-y-auto px-xl py-xl max-w-[720px]">
      {/* Heading */}
      <h1 className="font-display text-[24px] leading-[1.2] font-semibold text-text-primary tracking-[-0.02em] mb-lg">
        What can I help with?
      </h1>

      {/* Intake form */}
      <IntakeForm />

      {/* Active pipeline progress */}
      {runningRequests.length > 0 && (
        <div className="mt-lg">
          <h2 className="font-mono text-[11px] text-running uppercase tracking-[0.06em] mb-sm">
            In Progress
          </h2>
          <div className="space-y-md">
            {runningRequests.map((req) => (
              <div
                key={req.id}
                className="bg-surface border border-border rounded-md px-md py-sm border-l-2 border-l-running"
              >
                <PipelineProgress requestId={req.id} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border my-xl" />

      {/* Request history */}
      <div>
        <h2 className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] mb-sm">
          Recent Requests
        </h2>
        <RequestHistory />
      </div>
    </div>
  )
}
