import { useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionTab {
  id: string
  title: string
  projectPath?: string
  status: 'thinking' | 'waiting' | 'idle'
  type: 'ideation' | 'autonomous' | 'conversation'
}

const MAX_TABS = 10

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages multi-tab session state with per-tab type tracking.
 * Per D-15, D-16, D-17: tab strip with status indicators, switching preserves state.
 * Per T-15-18: max 10 open tabs to prevent DoS.
 */
export function useSessionTabs() {
  const [tabs, setTabs] = useState<SessionTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const addTab = useCallback(
    (tab: Omit<SessionTab, 'status'>): string | null => {
      if (tabs.length >= MAX_TABS) return null
      const newTab: SessionTab = { ...tab, status: 'idle' }
      setTabs((prev) => [...prev, newTab])
      setActiveTabId(newTab.id)
      return newTab.id
    },
    [tabs.length]
  )

  const removeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id)
        if (idx === -1) return prev
        const next = prev.filter((t) => t.id !== id)
        // If removing active tab, switch to adjacent
        if (activeTabId === id && next.length > 0) {
          const newIdx = Math.min(idx, next.length - 1)
          setActiveTabId(next[newIdx].id)
        } else if (next.length === 0) {
          setActiveTabId(null)
        }
        return next
      })
    },
    [activeTabId]
  )

  const selectTab = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const updateTabStatus = useCallback(
    (id: string, status: SessionTab['status']) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status } : t))
      )
    },
    []
  )

  const updateTabTitle = useCallback((id: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    )
  }, [])

  return {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    setActiveTab: selectTab,
    updateTabStatus,
    updateTabTitle,
    maxReached: tabs.length >= MAX_TABS,
  }
}
