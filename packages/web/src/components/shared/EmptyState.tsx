import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  icon?: ReactNode
}

/**
 * Empty state placeholder for pages/sections with no data.
 * Used when no pipelines exist yet, no repos connected, etc.
 */
export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="mb-4 text-text-muted">{icon}</div>}
      <h3 className="font-display text-text-primary text-lg font-semibold mb-2">
        {title}
      </h3>
      <p className="font-body text-text-muted text-sm max-w-md">
        {description}
      </p>
    </div>
  )
}
