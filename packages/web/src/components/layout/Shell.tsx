import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Sidebar, type AppView } from './Sidebar'
import { BottomStrip } from './BottomStrip'
import { CommandPalette } from './CommandPalette'
import type { Session } from '../../hooks/useSession'

interface ShellProps {
  children: ReactNode
  activeView: AppView
  onNavigate: (view: AppView) => void
  sessions?: Session[]
  activeSessionId?: string | null
  onSelectSession?: (id: string) => void
  onNewSession?: () => void
  onSelectProject?: (name: string) => void
}

/**
 * App shell layout: left sidebar (220px) + main content area with bottom intelligence strip.
 * Per DESIGN.md: grid-disciplined, left-anchored, persistent sidebar.
 * Includes Cmd+K command palette for power-user navigation.
 */
export function Shell({
  children,
  activeView,
  onNavigate,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onSelectProject,
}: ShellProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // Global Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleCloseCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false)
  }, [])

  const handleSelectSession = useCallback(
    (id: string) => {
      onSelectSession?.(id)
    },
    [onSelectSession]
  )

  const handleSelectProject = useCallback(
    (name: string) => {
      onSelectProject?.(name)
    },
    [onSelectProject]
  )

  return (
    <div className="grid grid-cols-[220px_1fr] min-h-screen bg-background">
      <Sidebar
        activeView={activeView}
        onNavigate={onNavigate}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={onSelectSession}
        onNewSession={onNewSession}
      />
      <div className="grid grid-rows-[1fr_40px] min-h-screen">
        <main className="overflow-auto">{children}</main>
        <BottomStrip />
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={handleCloseCommandPalette}
        onNavigate={onNavigate}
        onSelectSession={handleSelectSession}
        onSelectProject={handleSelectProject}
      />
    </div>
  )
}
