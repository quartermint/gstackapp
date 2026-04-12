import { cn } from '../../lib/cn'
import { DecisionQueue } from '../decision/DecisionQueue'
import type { DecisionGate } from '../../hooks/useDecisionGates'

export type AppView =
  | 'dashboard'
  | 'trends'
  | 'repos'
  | 'ideation'
  | 'autonomous'
  | 'operator'
  | 'topology'
  | 'knowledge'
  | 'intelligence'

interface SidebarProps {
  activeView: AppView
  onNavigate: (view: AppView) => void
  role?: 'admin' | 'operator'
  decisionGates?: DecisionGate[]
  onDecideGate?: (gateId: string, optionId: string) => void
}

/**
 * Left sidebar: 220px width, gstackapp branding, navigation.
 * Per DESIGN.md: persistent left sidebar (200-240px).
 */
export function Sidebar({
  activeView,
  onNavigate,
  role,
  decisionGates,
  onDecideGate,
}: SidebarProps) {
  const pendingGates = decisionGates?.filter((g) => g.response === null) ?? []

  return (
    <aside className="w-[220px] bg-surface border-r border-border flex flex-col h-screen">
      {/* Logo / Wordmark */}
      <div className="px-4 py-5">
        <span className="font-display text-accent font-semibold text-lg tracking-[-0.02em]">
          gstackapp
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5">
        <NavButton
          label="Dashboard"
          active={activeView === 'dashboard'}
          onClick={() => onNavigate('dashboard')}
        />
        <NavButton
          label="Ideation"
          active={activeView === 'ideation'}
          onClick={() => onNavigate('ideation')}
        />
        <NavButton
          label="Autonomous"
          active={activeView === 'autonomous'}
          onClick={() => onNavigate('autonomous')}
          badge={pendingGates.length > 0 ? pendingGates.length : undefined}
        />
        <NavButton
          label="Trends"
          active={activeView === 'trends'}
          onClick={() => onNavigate('trends')}
        />
        <NavButton
          label="Repositories"
          active={activeView === 'repos'}
          onClick={() => onNavigate('repos')}
        />

        {role === 'admin' && (
          <>
            <div className="mt-4 px-3 py-1">
              <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
                Power
              </span>
            </div>
            <NavButton
              label="Topology"
              active={activeView === 'topology'}
              onClick={() => onNavigate('topology')}
            />
            <NavButton
              label="Intelligence"
              active={activeView === 'intelligence'}
              onClick={() => onNavigate('intelligence')}
            />
            <NavButton
              label="Knowledge"
              active={activeView === 'knowledge'}
              onClick={() => onNavigate('knowledge')}
            />
          </>
        )}
      </nav>

      {/* Decision Queue — only when gates present */}
      {pendingGates.length > 0 && onDecideGate && (
        <div className="px-2 py-2 border-t border-border">
          <div className="px-3 py-1 mb-1">
            <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
              Decision Queue
            </span>
          </div>
          <DecisionQueue gates={pendingGates} onDecide={onDecideGate} />
        </div>
      )}

      {/* Version */}
      <div className="px-4 py-3 border-t border-border">
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
          v0.1.0
        </span>
      </div>
    </aside>
  )
}

// ── NavButton helper ─────────────────────────────────────────────────────────

function NavButton({
  label,
  active,
  onClick,
  badge,
}: {
  label: string
  active: boolean
  onClick: () => void
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md font-body text-sm w-full text-left transition-colors duration-150',
        active
          ? 'text-accent bg-accent-muted'
          : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
      )}
    >
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#FFB020] text-background font-body text-xs font-medium">
          {badge}
        </span>
      )}
    </button>
  )
}
