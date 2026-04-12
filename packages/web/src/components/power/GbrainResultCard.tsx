import { cn } from '../../lib/cn'

interface GbrainResultCardProps {
  result: {
    slug: string
    title: string
    type: string
    excerpt: string
    score?: number
  }
  selected: boolean
  onClick: () => void
}

export function GbrainResultCard({ result, selected, onClick }: GbrainResultCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left bg-surface border rounded-md p-4 cursor-pointer transition-colors duration-150',
        selected
          ? 'border-[rgba(198,255,59,0.3)] bg-[rgba(198,255,59,0.06)]'
          : 'border-border hover:bg-surface-hover'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-body text-[15px] font-semibold text-text-primary truncate">
          {result.title}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] rounded-full bg-[rgba(198,255,59,0.12)] text-accent px-2 py-0.5 shrink-0">
          {result.type}
        </span>
      </div>
      <p className="font-body text-[15px] text-text-muted line-clamp-3">
        {result.excerpt}
      </p>
    </button>
  )
}
