import { cn } from '../../lib/cn'
import { SessionListItem } from '../session/SessionListItem'
import type { Session } from '../../hooks/useSession'

export type AppView = 'projects' | 'pr-reviews' | 'trends' | 'repos' | 'design-docs' | 'session'

interface SidebarProps {
  activeView: AppView
  onNavigate: (view: AppView) => void
  sessions?: Session[]
  activeSessionId?: string | null
  onSelectSession?: (id: string) => void
  onNewSession?: () => void
}

interface NavButtonProps {
  label: string
  view: AppView
  activeView: AppView
  onNavigate: (view: AppView) => void
}

function NavButton({ label, view, activeView, onNavigate }: NavButtonProps) {
  return (
    <button
      onClick={() => onNavigate(view)}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md font-body text-sm w-full text-left transition-colors duration-150',
        activeView === view
          ? 'text-accent bg-accent-muted'
          : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
      )}
    >
      {label}
    </button>
  )
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

      {/* Primary Navigation */}
      <nav className="px-2 space-y-0.5">
        <NavButton label="Dashboard" view="projects" activeView={activeView} onNavigate={onNavigate} />
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

      {/* Secondary Navigation */}
      <div className="border-t border-border my-2" />
      <nav className="px-2 space-y-0.5">
        <NavButton label="Trends" view="trends" activeView={activeView} onNavigate={onNavigate} />
        <NavButton label="Repositories" view="repos" activeView={activeView} onNavigate={onNavigate} />
        <NavButton label="Design Docs" view="design-docs" activeView={activeView} onNavigate={onNavigate} />
      </nav>

      {/* PR Reviews section */}
      <div className="border-t border-border my-2" />
      <nav className="px-2 space-y-0.5 mb-2">
        <NavButton label="PR Reviews" view="pr-reviews" activeView={activeView} onNavigate={onNavigate} />
      </nav>

      {/* Version */}
      <div className="px-4 py-3 border-t border-border">
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
          v2.0.0
        </span>
      </div>
    </aside>
  )
}
