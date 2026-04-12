interface FlowStepNodeProps {
  label: string
  color: string
  state: 'active' | 'complete' | 'pending'
}

/**
 * Individual step node in the ideation flow diagram (DASH-03).
 *
 * 40px circle with label below. Three visual states:
 * - active: stage color border + pulse-glow animation
 * - complete: pass green background + checkmark
 * - pending: border-border, dimmed label
 *
 * Per DESIGN.md D-06: 2s ease-in-out infinite glow via pulse-glow keyframe.
 */
export function FlowStepNode({ label, color, state }: FlowStepNodeProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      {/* Circle node */}
      <div
        className={
          state === 'active'
            ? 'w-10 h-10 rounded-full bg-surface border-2 flex items-center justify-center animate-[pulse-glow_2s_ease-in-out_infinite]'
            : state === 'complete'
              ? 'w-10 h-10 rounded-full flex items-center justify-center'
              : 'w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center'
        }
        style={
          state === 'active'
            ? { borderColor: color, '--glow-color': color } as React.CSSProperties
            : state === 'complete'
              ? { backgroundColor: 'rgba(46, 219, 135, 0.2)' }
              : undefined
        }
      >
        {state === 'complete' && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-[#2EDB87]"
          >
            <path
              d="M3 8.5L6.5 12L13 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {/* Label */}
      <span
        className={
          state === 'pending'
            ? 'font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted/50'
            : 'font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted'
        }
      >
        {label}
      </span>
    </div>
  )
}
