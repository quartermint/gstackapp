import type { TimelineSegment } from "../../hooks/use-sprint-timeline.js";

interface TimelineSwimlaneProps {
  slug: string;
  segments: TimelineSegment[];
  totalCommits: number;
  isFocused: boolean;
  windowDays: number;
  windowStart: Date;
  onSelect: (slug: string) => void;
  onHover: (
    segment: TimelineSegment | null,
    rect: DOMRect | null
  ) => void;
}

/** Convert a kebab-case slug to Title Case display name. */
function displayName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Calculate day offset from windowStart for a date string. */
function dayOffset(dateStr: string, windowStart: Date): number {
  const d = new Date(dateStr + "T00:00:00");
  const diff = d.getTime() - windowStart.getTime();
  return Math.max(0, Math.round(diff / (24 * 60 * 60 * 1000)));
}

/** Calculate day span between two date strings (inclusive). */
function daySpan(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00").getTime();
  const end = new Date(endDate + "T00:00:00").getTime();
  return Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);
}

/**
 * Single project swimlane row with positioned segment bars.
 * Density coloring uses terracotta with varying opacity:
 * - Focused: opacity 0.3-1.0 (full saturation range)
 * - Non-focused: opacity 0.1-0.4 (muted range)
 */
export function TimelineSwimlane({
  slug,
  segments,
  totalCommits,
  isFocused,
  windowDays,
  windowStart,
  onSelect,
  onHover,
}: TimelineSwimlaneProps) {
  return (
    <div
      className="flex items-center gap-2.5"
      data-testid={`swimlane-${slug}`}
      data-focused={isFocused ? "true" : "false"}
    >
      {/* Project label */}
      <span className="w-24 shrink-0 truncate text-[11px] font-medium text-text-secondary dark:text-text-secondary-dark">
        {displayName(slug)}
      </span>

      {/* Segment container */}
      <div className="relative flex-1 h-[10px]">
        {segments.map((segment, i) => {
          const left = (dayOffset(segment.startDate, windowStart) / windowDays) * 100;
          const width = (daySpan(segment.startDate, segment.endDate) / windowDays) * 100;

          // Compute opacity based on density and focus state
          const opacity = isFocused
            ? 0.3 + segment.density * 0.7
            : 0.1 + segment.density * 0.3;

          return (
            <div
              key={`${slug}-${i}`}
              data-testid={`segment-${slug}-${i}`}
              className="absolute top-0 h-[10px] rounded-sm cursor-pointer transition-opacity duration-150"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.5)}%`,
                backgroundColor: `rgba(212, 113, 58, ${opacity})`,
              }}
              onClick={() => onSelect(slug)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onHover(segment, rect);
              }}
              onMouseLeave={() => onHover(null, null)}
            />
          );
        })}
      </div>
    </div>
  );
}
