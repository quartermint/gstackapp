interface PatternCardProps {
  pattern: {
    title: string
    description: string
    severity: string
    stage: string
    repos: string[]
    count: number
  }
}

export function PatternCard({ pattern }: PatternCardProps) {
  return (
    <div
      className="bg-surface border border-border rounded-md p-4 bg-[rgba(255,209,102,0.06)]"
      style={{ borderLeft: '3px solid #FFD166' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-body text-[15px] font-semibold text-text-primary">
          {pattern.title}
        </span>
        <span className="font-body text-[13px] rounded-full bg-[rgba(255,209,102,0.08)] text-[#FFD166] px-2 py-0.5 shrink-0">
          Found in {pattern.repos.length} repos
        </span>
      </div>

      {/* Body */}
      <p className="font-body text-[13px] text-text-muted mb-2">
        {pattern.description}
      </p>

      {/* Footer: affected repos */}
      <p className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
        {pattern.repos.join(', ')}
      </p>
    </div>
  )
}
