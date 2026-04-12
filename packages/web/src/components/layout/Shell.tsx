import type { ReactNode } from 'react'
import { Sidebar, type AppView } from './Sidebar'
import { BottomStrip } from './BottomStrip'
import { SessionTabBar } from '../session/SessionTabBar'
import type { SessionTab } from '../../hooks/useSessionTabs'
import type { DecisionGate } from '../../hooks/useDecisionGates'

interface ShellProps {
  children: ReactNode
  activeView: AppView
  onNavigate: (view: AppView) => void
  role?: 'admin' | 'operator'
  tabs?: SessionTab[]
  activeTabId?: string | null
  onSelectTab?: (id: string) => void
  onCloseTab?: (id: string) => void
  onNewTab?: () => void
  maxTabsReached?: boolean
  decisionGates?: DecisionGate[]
  onDecideGate?: (gateId: string, optionId: string) => void
}

/**
 * App shell layout: left sidebar (220px) + main content area with optional tab bar and bottom strip.
 * Per DESIGN.md: grid-disciplined, left-anchored, persistent sidebar.
 * Tab bar renders between sidebar and main content when tabs are present.
 */
export function Shell({
  children,
  activeView,
  onNavigate,
  role,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  maxTabsReached,
  decisionGates,
  onDecideGate,
}: ShellProps) {
  const hasTabs = tabs && tabs.length > 0

  return (
    <div className="grid grid-cols-[220px_1fr] min-h-screen bg-background">
      <Sidebar
        activeView={activeView}
        onNavigate={onNavigate}
        role={role}
        decisionGates={decisionGates}
        onDecideGate={onDecideGate}
      />
      <div
        className={
          hasTabs
            ? 'grid grid-rows-[40px_1fr_40px] min-h-screen'
            : 'grid grid-rows-[1fr_40px] min-h-screen'
        }
      >
        {hasTabs && onSelectTab && onCloseTab && onNewTab && (
          <SessionTabBar
            tabs={tabs}
            activeTabId={activeTabId ?? null}
            onSelect={onSelectTab}
            onClose={onCloseTab}
            onNew={onNewTab}
            maxReached={maxTabsReached}
          />
        )}
        <main className="overflow-auto">{children}</main>
        <BottomStrip />
      </div>
    </div>
  )
}
