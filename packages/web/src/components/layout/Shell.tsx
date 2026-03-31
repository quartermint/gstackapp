import type { ReactNode } from 'react'
import { Sidebar, type AppView } from './Sidebar'
import { BottomStrip } from './BottomStrip'

interface ShellProps {
  children: ReactNode
  activeView: AppView
  onNavigate: (view: AppView) => void
}

/**
 * App shell layout: left sidebar (220px) + main content area with bottom intelligence strip.
 * Per DESIGN.md: grid-disciplined, left-anchored, persistent sidebar.
 */
export function Shell({ children, activeView, onNavigate }: ShellProps) {
  return (
    <div className="grid grid-cols-[220px_1fr] min-h-screen bg-background">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <div className="grid grid-rows-[1fr_40px] min-h-screen">
        <main className="overflow-auto">{children}</main>
        <BottomStrip />
      </div>
    </div>
  )
}
