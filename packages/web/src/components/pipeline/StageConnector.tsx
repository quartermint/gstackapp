interface StageConnectorProps {
  /** Whether the connector is active (preceding stage started or completed) */
  active: boolean
  /** Override stroke color when active (defaults to accent/electric lime) */
  color?: string
}

/**
 * SVG connector line between pipeline stage nodes.
 *
 * Per DESIGN.md D-04: Pipeline trace animation
 * - Active: dashed line with trace-flow animation (2.5s linear infinite loop)
 * - Inactive: static dashed line in border color
 *
 * Per Pitfall 6: Simple SVG path with CSS keyframes for animation.
 */
export function StageConnector({ active, color }: StageConnectorProps) {
  return (
    <svg
      width="48"
      height="2"
      className="mx-1 shrink-0"
      viewBox="0 0 48 2"
    >
      <line
        x1="0"
        y1="1"
        x2="48"
        y2="1"
        stroke={active ? (color ?? 'var(--color-accent)') : '#2A2F3A'}
        strokeWidth="2"
        strokeDasharray="8 8"
        style={
          active
            ? {
                animation: 'trace-flow 2.5s linear infinite',
                strokeDashoffset: 100,
              }
            : undefined
        }
      />
    </svg>
  )
}
