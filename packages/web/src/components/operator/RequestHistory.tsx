import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '../../lib/cn'

interface OperatorRequest {
  id: string
  whatNeeded: string
  whatGood: string
  status: string
  createdAt: string | number
  deadline?: string | null
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-flag/10 text-flag border-flag/20' },
  running: { label: 'Running', className: 'bg-running/10 text-running border-running/20' },
  paused: { label: 'Paused', className: 'bg-text-muted/10 text-text-muted border-text-muted/20' },
  complete: { label: 'Complete', className: 'bg-pass/10 text-pass border-pass/20' },
  failed: { label: 'Failed', className: 'bg-block/10 text-block border-block/20' },
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? statusConfig.pending
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-sm border font-mono text-[11px] uppercase tracking-[0.06em]',
        config.className
      )}
    >
      {config.label}
    </span>
  )
}

/**
 * Request history list per D-06.
 * Shows past requests with status badges, truncated descriptions, relative timestamps.
 */
export function RequestHistory() {
  const { data: requests, isLoading } = useQuery<OperatorRequest[]>({
    queryKey: ['operator', 'history'],
    queryFn: async () => {
      const res = await fetch('/api/operator/history')
      if (!res.ok) throw new Error('Failed to load history')
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="py-lg">
        <p className="font-body text-sm text-text-muted">Loading requests...</p>
      </div>
    )
  }

  if (!requests || requests.length === 0) {
    return (
      <div className="py-lg">
        <p className="font-body text-sm text-text-muted">No requests yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-xs">
      {requests.map((req) => {
        const createdDate = typeof req.createdAt === 'number'
          ? new Date(req.createdAt)
          : new Date(req.createdAt)
        const timeAgo = formatDistanceToNow(createdDate, { addSuffix: true })

        return (
          <div
            key={req.id}
            className="bg-surface border border-border rounded-md px-md py-sm hover:border-border-focus transition-colors duration-150"
          >
            <div className="flex items-start justify-between gap-sm">
              <div className="flex-1 min-w-0">
                <p className="font-body text-[15px] text-text-primary truncate">
                  {req.whatNeeded.length > 100
                    ? req.whatNeeded.slice(0, 100) + '...'
                    : req.whatNeeded}
                </p>
                <p className="font-body text-sm text-text-muted mt-0.5">
                  {timeAgo}
                  {req.deadline && (
                    <span className="ml-2">
                      Deadline: {req.deadline}
                    </span>
                  )}
                </p>
              </div>
              <StatusBadge status={req.status} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
