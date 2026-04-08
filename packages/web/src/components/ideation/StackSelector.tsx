import { cn } from '../../lib/cn'

// ── Types ────────────────────────────────────────────────────────────────────

interface StackSelectorProps {
  value: string
  onChange: (stack: string) => void
}

// ── Stack options with inline SVG icons ──────────────────────────────────────

const stacks = [
  {
    id: 'react',
    label: 'React',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="2" fill="currentColor" />
        <ellipse cx="10" cy="10" rx="8" ry="3" stroke="currentColor" strokeWidth="1.2" />
        <ellipse cx="10" cy="10" rx="8" ry="3" stroke="currentColor" strokeWidth="1.2" transform="rotate(60 10 10)" />
        <ellipse cx="10" cy="10" rx="8" ry="3" stroke="currentColor" strokeWidth="1.2" transform="rotate(120 10 10)" />
      </svg>
    ),
  },
  {
    id: 'python',
    label: 'Python',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2C6 2 6 4 6 4v2h4v1H5S2 6.5 2 10s2.5 4 2.5 4H6v-2s0-2 4-2 4-2 4-2V6s0-4-4-4z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M10 18c4 0 4-2 4-2v-2h-4v-1h5s3 .5 3-3.5S15.5 6 15.5 6H14v2s0 2-4 2-4 2-4 2v2s0 4 4 4z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    id: 'swift',
    label: 'Swift',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M16 4C12 8 6 12 4 14c2-1 5-2 8-2 0 2-2 4-4 5 3-1 6-3 8-6 0 0-1-5-6-7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'go',
    label: 'Go',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <text x="3" y="15" fontSize="13" fontWeight="bold" fill="currentColor" fontFamily="monospace">Go</text>
      </svg>
    ),
  },
]

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Radio-button group for stack selection per D-18.
 * Card-style options in 2x2 grid (small) or 4-column (wider).
 */
export function StackSelector({ value, onChange }: StackSelectorProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {stacks.map((stack) => (
        <button
          key={stack.id}
          type="button"
          onClick={() => onChange(stack.id)}
          className={cn(
            'flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors duration-150',
            'font-body text-sm',
            value === stack.id
              ? 'border-accent text-accent bg-accent-muted'
              : 'border-border text-text-muted hover:border-border-focus hover:text-text-primary'
          )}
        >
          {stack.icon}
          {stack.label}
        </button>
      ))}
    </div>
  )
}
