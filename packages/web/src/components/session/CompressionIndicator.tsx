/**
 * Thin bar indicating context compression has occurred.
 * Per UI spec: 2px height, full width, warning color (#FFB020).
 */
export function CompressionIndicator() {
  return (
    <div
      className="h-[2px] w-full bg-[#FFB020] mb-4"
      title="Context compressed to maintain coherence"
    />
  )
}
