import { cn } from '../../lib/cn'
import type { Session } from '../../hooks/useSession'

interface SessionListItemProps {
  session: Session
  isActive: boolean
  onClick: () => void
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function SessionListItem({ session, isActive, onClick }: SessionListItemProps) {
  const title = session.title || 'Untitled session'

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col gap-0.5 px-3 py-2 rounded-md w-full text-left transition-colors duration-150',
        isActive
          ? 'text-accent bg-accent-muted'
          : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
      )}
    >
      <span className="font-body text-sm truncate w-full">{title}</span>
      <span className="font-body text-[12px] text-text-muted">
        {relativeTime(session.lastMessageAt || session.createdAt)}
      </span>
    </button>
  )
}
