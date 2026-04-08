import { useRef, useState, useEffect } from 'react'
import { SessionTab } from './SessionTab'
import type { SessionTab as SessionTabType } from '../../hooks/useSessionTabs'
import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionTabBarProps {
  tabs: SessionTabType[]
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  maxReached?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Horizontal tab strip for concurrent session management.
 * Per D-15: 40px height, surface bg, bottom border, horizontal scroll with fade.
 * New tab "+" button at right end.
 */
export function SessionTabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNew,
  maxReached,
}: SessionTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showFade, setShowFade] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      setShowFade(el.scrollWidth > el.clientWidth)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tabs.length])

  return (
    <div className="relative flex items-stretch h-[40px] bg-surface border-b border-border">
      {/* Scrollable tab area */}
      <div
        ref={scrollRef}
        className="flex items-stretch overflow-x-auto scrollbar-none"
      >
        {tabs.map((tab) => (
          <SessionTab
            key={tab.id}
            name={tab.title}
            status={tab.status}
            active={tab.id === activeTabId}
            onClick={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
          />
        ))}
      </div>

      {/* Fade gradient when overflowing */}
      {showFade && (
        <div className="absolute right-[41px] top-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-surface pointer-events-none" />
      )}

      {/* New tab button */}
      <button
        onClick={onNew}
        disabled={maxReached}
        title={maxReached ? 'Close a tab first (max 10)' : 'New tab'}
        className={cn(
          'flex items-center justify-center w-[40px] h-[40px] border-l border-border',
          'text-text-muted transition-colors duration-150',
          maxReached
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:text-text-primary hover:bg-surface-hover'
        )}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 2v10M2 7h10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
