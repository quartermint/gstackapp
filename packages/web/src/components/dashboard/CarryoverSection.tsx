import { useState } from 'react'
import { cn } from '../../lib/cn'
import { CarryoverItem } from './CarryoverItem'
import type { CarryoverItem as CarryoverItemType } from '@gstackapp/shared'

interface CarryoverSectionProps {
  items?: CarryoverItemType[]
  isLoading: boolean
}

/**
 * Collapsible carryover section with count badge and staleness indicators.
 * Default: expanded if items exist, collapsed if empty.
 */
export function CarryoverSection({ items, isLoading }: CarryoverSectionProps) {
  const hasItems = items && items.length > 0
  const [expanded, setExpanded] = useState(hasItems)

  if (isLoading) {
    return (
      <section>
        <h2 className="font-display text-2xl font-semibold text-text-primary mb-6">
          Carryover Items
        </h2>
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-lg p-4 animate-pulse">
              <div className="h-3 w-20 rounded bg-border mb-2" />
              <div className="h-4 w-48 rounded bg-border" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 mb-4 group cursor-pointer"
      >
        <h2 className="font-display text-2xl font-semibold text-text-primary">
          Carryover Items
        </h2>
        {hasItems && (
          <span className="font-mono text-[11px] bg-surface border border-border rounded px-2 py-0.5 text-text-muted">
            {items.length}
          </span>
        )}
        <span className={cn(
          'text-text-muted transition-transform duration-250 ease-in-out text-sm',
          expanded ? 'rotate-0' : '-rotate-90',
        )}>
          &#9660;
        </span>
      </button>

      <div
        className={cn(
          'transition-all duration-250 ease-in-out overflow-hidden',
          expanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        {hasItems ? (
          <div className="space-y-3">
            {items.map((item, i) => (
              <CarryoverItem key={`${item.projectName}-${i}`} item={item} />
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <h3 className="font-display text-lg font-semibold text-text-primary mb-2">
              All clear
            </h3>
            <p className="text-text-muted font-body text-[15px]">
              No carryover items across your projects.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
