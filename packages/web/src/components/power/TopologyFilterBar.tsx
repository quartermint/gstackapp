import { useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/cn'

type StatusFilter = 'all' | 'running' | 'complete' | 'flagged'

interface TopologyFilterBarProps {
  repos: string[]
  selectedRepos: string[]
  onRepoChange: (repos: string[]) => void
  statusFilter: StatusFilter
  onStatusChange: (status: StatusFilter) => void
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'complete', label: 'Complete' },
  { value: 'flagged', label: 'Flagged' },
]

/**
 * Filter bar for Pipeline Topology view.
 *
 * Left: repo multi-select dropdown
 * Center: status filter pills
 * Right: Run Pipeline CTA (placeholder)
 */
export function TopologyFilterBar({
  repos,
  selectedRepos,
  onRepoChange,
  statusFilter,
  onStatusChange,
}: TopologyFilterBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const allSelected = selectedRepos.length === repos.length || selectedRepos.length === 0
  const buttonText = allSelected ? 'All repos' : `${selectedRepos.length} repo${selectedRepos.length !== 1 ? 's' : ''} selected`

  const toggleRepo = (repo: string) => {
    if (selectedRepos.includes(repo)) {
      onRepoChange(selectedRepos.filter((r) => r !== repo))
    } else {
      onRepoChange([...selectedRepos, repo])
    }
  }

  const selectAll = () => {
    onRepoChange([...repos])
  }

  return (
    <div className="bg-surface border-b border-border px-6 py-2 flex items-center gap-4">
      {/* Repo multi-select dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="bg-surface-hover border border-border rounded-md px-3 py-1.5 font-body text-[13px] text-text-primary hover:border-border-focus transition-colors duration-150 cursor-pointer"
        >
          {buttonText}
        </button>
        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-md shadow-lg z-10 p-2 min-w-[200px]">
            <button
              type="button"
              onClick={selectAll}
              className="w-full text-left px-2 py-1 text-[13px] font-body text-accent hover:bg-surface-hover rounded cursor-pointer"
            >
              Select all
            </button>
            <div className="border-t border-border my-1" />
            {repos.map((repo) => (
              <label
                key={repo}
                className="flex items-center gap-2 px-2 py-1 hover:bg-surface-hover rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedRepos.includes(repo)}
                  onChange={() => toggleRepo(repo)}
                  className="accent-accent"
                />
                <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em] truncate">
                  {repo}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-1">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onStatusChange(opt.value)}
            className={cn(
              'px-3 py-1 rounded-full text-[13px] font-body transition-colors duration-150 cursor-pointer',
              statusFilter === opt.value
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text-primary'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Run Pipeline CTA (placeholder) */}
      <button
        type="button"
        className="bg-accent text-background rounded-md px-4 py-1.5 font-display font-semibold text-[13px] hover:bg-accent-hover transition-colors duration-150 cursor-pointer"
      >
        Run Pipeline
      </button>
    </div>
  )
}
