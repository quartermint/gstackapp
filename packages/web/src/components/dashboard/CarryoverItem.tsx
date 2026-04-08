import { cn } from '../../lib/cn'
import type { CarryoverItem as CarryoverItemType } from '@gstackapp/shared'

interface CarryoverItemProps {
  item: CarryoverItemType
}

const stalenessColors: Record<string, string> = {
  recent: 'text-text-muted',
  aging: 'text-[#FFB020]',
  stale: 'text-[#FF5A67]',
}

const stalenessLabels: Record<string, string> = {
  recent: 'Recent',
  aging: 'Aging',
  stale: 'Stale',
}

/**
 * Single carryover item with project name, text, and staleness badge.
 */
export function CarryoverItem({ item }: CarryoverItemProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="font-body text-[12px] font-medium text-text-muted">
          {item.projectName}
        </span>
        <span
          className={cn(
            'font-mono text-[11px] uppercase tracking-[0.06em]',
            stalenessColors[item.staleness],
          )}
        >
          {stalenessLabels[item.staleness]}
        </span>
      </div>
      <p className="font-body text-[15px] text-text-primary">{item.text}</p>
    </div>
  )
}
