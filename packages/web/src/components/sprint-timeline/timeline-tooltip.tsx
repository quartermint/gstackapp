interface TimelineTooltipProps {
  segment: {
    commits: number;
    startDate: string;
    endDate: string;
  };
  position: { left: number; top: number };
  visible: boolean;
}

/** Format YYYY-MM-DD to "Jan 5" style. */
function formatShortDate(iso: string): string {
  const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const d = new Date(iso + "T00:00:00");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Small absolute-positioned tooltip that appears near a timeline segment on hover.
 * Uses pointer-events-none so it doesn't interfere with mouse events.
 */
export function TimelineTooltip({
  segment,
  position,
  visible,
}: TimelineTooltipProps) {
  return (
    <div
      className="absolute z-10 pointer-events-none rounded-lg bg-surface-elevated dark:bg-surface-elevated-dark shadow-lg border border-warm-gray/10 p-2 transition-opacity duration-150"
      style={{
        left: position.left,
        top: position.top,
        opacity: visible ? 1 : 0,
      }}
    >
      <p className="text-[11px] font-medium text-text-primary dark:text-text-primary-dark whitespace-nowrap">
        {segment.commits} commits
      </p>
      <p className="text-[10px] text-text-muted dark:text-text-muted-dark whitespace-nowrap">
        {formatShortDate(segment.startDate)} &ndash;{" "}
        {formatShortDate(segment.endDate)}
      </p>
    </div>
  );
}
