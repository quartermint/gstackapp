import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionTabProps {
  name: string
  status: 'thinking' | 'waiting' | 'idle'
  active: boolean
  onClick: () => void
  onClose: () => void
}

// ── Status dot colors per D-16 ───────────────────────────────────────────────

const statusStyles: Record<SessionTabProps['status'], string> = {
  thinking: 'bg-[#36C9FF] animate-pulse',
  waiting: 'bg-[#FFB020]',
  idle: 'bg-[#6F7C90]',
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Single session tab with status indicator, truncated name, and hover-close.
 * Per UI spec: min-width 120px, max-width 200px, 40px height.
 * Active: 2px bottom border accent, text accent.
 * Status dot: 8px circle with color per status.
 */
export function SessionTab({
  name,
  status,
  active,
  onClick,
  onClose,
}: SessionTabProps) {
  const truncated = name.length > 20 ? name.slice(0, 20) + '...' : name

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 px-3 min-w-[120px] max-w-[200px] h-[40px]',
        'border-r border-border font-body text-sm transition-colors duration-150',
        'animate-in slide-in-from-left duration-200 ease-out',
        active
          ? 'border-b-2 border-b-accent text-accent'
          : 'text-text-muted hover:bg-surface-hover'
      )}
    >
      {/* Status dot */}
      <span
        className={cn('w-2 h-2 rounded-full shrink-0', statusStyles[status])}
      />

      {/* Tab name */}
      <span className="truncate">{truncated}</span>

      {/* Close button — visible on hover only */}
      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className={cn(
          'ml-auto w-4 h-4 flex items-center justify-center rounded-sm',
          'text-text-muted hover:text-text-primary',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150'
        )}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 2L8 8M8 2L2 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </button>
  )
}
