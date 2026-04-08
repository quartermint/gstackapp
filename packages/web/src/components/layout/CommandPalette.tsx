import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { AppView } from './Sidebar'
import { useProjects } from '../../hooks/useProjects'
import { useSessions } from '../../hooks/useSession'
import { useDesignDocs } from '../../hooks/useDashboard'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onNavigate: (view: AppView) => void
  onSelectSession: (id: string) => void
  onSelectProject: (name: string) => void
}

interface ResultItem {
  id: string
  label: string
  group: 'Projects' | 'Sessions' | 'Design Docs'
  action: () => void
}

/**
 * Cmd+K command palette overlay for quick navigation between projects, sessions, and design docs.
 * Per UI spec: 480px max-width, grouped results, keyboard navigation, fade animation.
 */
export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onSelectSession,
  onSelectProject,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const { data: projects } = useProjects()
  const { data: sessions } = useSessions()
  const { data: designDocs } = useDesignDocs()

  // Build flattened result items
  const allItems = useMemo((): ResultItem[] => {
    const items: ResultItem[] = []

    // Projects
    if (projects) {
      for (const p of projects) {
        items.push({
          id: `project-${p.name}`,
          label: p.name,
          group: 'Projects',
          action: () => {
            onSelectProject(p.name)
            onClose()
          },
        })
      }
    }

    // Sessions
    if (sessions) {
      for (const s of sessions) {
        items.push({
          id: `session-${s.id}`,
          label: s.title || `Session ${s.id.slice(0, 8)}`,
          group: 'Sessions',
          action: () => {
            onSelectSession(s.id)
            onClose()
          },
        })
      }
    }

    // Design Docs
    if (designDocs) {
      for (const d of designDocs) {
        items.push({
          id: `doc-${d.project}-${d.title}`,
          label: `${d.project}: ${d.title}`,
          group: 'Design Docs',
          action: () => {
            onNavigate('design-docs')
            onClose()
          },
        })
      }
    }

    return items
  }, [projects, sessions, designDocs, onSelectProject, onSelectSession, onNavigate, onClose])

  // Filter items by query
  const filteredItems = useMemo(() => {
    if (!query.trim()) {
      // Show recent projects (up to 5) when query is empty
      return allItems.filter((i) => i.group === 'Projects').slice(0, 5)
    }
    const lowerQuery = query.toLowerCase()
    return allItems.filter((i) => i.label.toLowerCase().includes(lowerQuery))
  }, [allItems, query])

  // Group filtered items for display
  const groupedItems = useMemo(() => {
    const groups: { label: string; items: ResultItem[] }[] = []
    const groupOrder: ResultItem['group'][] = ['Projects', 'Sessions', 'Design Docs']

    for (const groupName of groupOrder) {
      const groupItems = filteredItems.filter((i) => i.group === groupName)
      if (groupItems.length > 0) {
        groups.push({ label: groupName, items: groupItems })
      }
    }
    return groups
  }, [filteredItems])

  // Reset state on open/close
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      // Auto-focus search input
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredItems.length])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredItems[selectedIndex]) {
            filteredItems[selectedIndex].action()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [filteredItems, selectedIndex, onClose]
  )

  // Scroll selected item into view
  useEffect(() => {
    if (!resultsRef.current) return
    const selected = resultsRef.current.querySelector('[data-selected="true"]')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!open) return null

  // Calculate flat index for each item across groups
  let flatIndex = 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      style={{ backgroundColor: 'rgba(11, 13, 17, 0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] max-h-[400px] bg-surface border border-border rounded-lg overflow-hidden flex flex-col animate-in fade-in duration-150 ease-out"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects, sessions, docs..."
          className="w-full p-4 text-[15px] font-body bg-transparent border-none border-b border-border text-text-primary placeholder:text-text-muted focus:outline-none"
          style={{ borderBottom: '1px solid var(--color-border, #2A2F3A)' }}
        />

        {/* Results area */}
        <div ref={resultsRef} className="overflow-y-auto flex-1">
          {filteredItems.length === 0 && query.trim() ? (
            <div className="px-3 py-6 text-center text-[15px] font-body text-text-muted">
              No results for &apos;{query}&apos;
            </div>
          ) : (
            groupedItems.map((group) => (
              <div key={group.label} className="py-2">
                {/* Group header */}
                <div className="px-3 py-2 text-[12px] font-medium font-body text-text-muted uppercase tracking-[0.06em]">
                  {group.label}
                </div>
                {/* Group items */}
                {group.items.map((item) => {
                  const currentIndex = flatIndex++
                  const isSelected = currentIndex === selectedIndex
                  return (
                    <button
                      key={item.id}
                      data-selected={isSelected}
                      className={`w-full h-[40px] px-3 flex items-center text-[15px] font-body cursor-pointer transition-colors duration-150 ${
                        isSelected
                          ? 'text-accent'
                          : 'text-text-primary hover:bg-surface-hover'
                      }`}
                      style={
                        isSelected
                          ? { backgroundColor: 'rgba(198, 255, 59, 0.06)' }
                          : undefined
                      }
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
