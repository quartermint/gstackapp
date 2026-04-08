import { cn } from '../../lib/cn'
import { SessionListItem } from '../session/SessionListItem'
import type { Session } from '../../hooks/useSession'

export type AppView = 'dashboard' | 'trends' | 'repos' | 'session'

interface SidebarProps {
  activeView: AppView
  onNavigate: (view: AppView) => void
  sessions?: Session[]
  activeSessionId?: string | null
  onSelectSession?: (id: string) => void
  onNewSession?: () => void
}

/**
 * Left sidebar: 220px width, gstackapp branding, navigation, session list.
 * Per DESIGN.md: persistent left sidebar (200-240px).
 */
export function Sidebar({
  activeView,
  onNavigate,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
}: SidebarProps) {
  return (
    <aside className="w-[220px] bg-surface border-r border-border flex flex-col h-screen">
      {/* Logo / Wordmark */}
      <div className="px-4 py-5">
        <span className="font-display text-accent font-semibold text-lg tracking-[-0.02em]">
          gstackapp
        </span>
      </div>

      {/* Navigation */}
      <nav className="px-2 space-y-0.5">
        <button
          onClick={() => onNavigate('dashboard')}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md font-body text-sm w-full text-left transition-colors duration-150',
            activeView === 'dashboard'
              ? 'text-accent bg-accent-muted'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
          )}
        >
          Dashboard
        </button>
        <button
          onClick={() => onNavigate('trends')}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md font-body text-sm w-full text-left transition-colors duration-150',
            activeView === 'trends'
              ? 'text-accent bg-accent-muted'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
          )}
        >
          Trends
        </button>
        <a
          href="#"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover font-body text-sm transition-colors duration-150"
        >
          Repositories
        </a>
      </nav>

      {/* Sessions section */}
      <div className="border-t border-border my-2" />
      <div className="flex-1 flex flex-col min-h-0 px-2">
        <span className="px-3 py-1 font-body text-[11px] text-text-muted uppercase tracking-[0.06em]">
          Sessions
        </span>
        <div className="flex-1 overflow-y-auto space-y-0.5 mt-1">
          {sessions?.map(session => (
            <SessionListItem
              key={session.id}
              session={session}
              isActive={activeSessionId === session.id}
              onClick={() => onSelectSession?.(session.id)}
            />
          ))}
        </div>
        <button
          onClick={onNewSession}
          className="flex items-center gap-1 px-3 py-2 rounded-md font-body text-sm w-full text-left text-accent hover:bg-surface-hover transition-colors duration-150 mt-1 mb-1"
        >
          + New Session
        </button>
      </div>

      {/* Version */}
      <div className="px-4 py-3 border-t border-border">
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
          v0.1.0
        </span>
      </div>
    </aside>
  )
}
