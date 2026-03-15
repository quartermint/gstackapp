import { useState, useMemo, useCallback, useRef } from "react";
import {
  useSprintTimeline,
  type TimelineSegment,
} from "../../hooks/use-sprint-timeline.js";
import { TimelineSwimlane } from "./timeline-swimlane.js";
import { TimelineTooltip } from "./timeline-tooltip.js";

interface SprintTimelineProps {
  onSelect: (slug: string) => void;
}

interface TooltipState {
  segment: TimelineSegment;
  position: { left: number; top: number };
  visible: boolean;
}

const MONTH_NAMES = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const MAX_PROJECTS = 10;

/**
 * Sprint Timeline: horizontal swimlane bars showing commit density over 12 weeks.
 * Replaces the heatmap grid with a more intuitive serial-sprint visualization.
 */
export function SprintTimeline({ onSelect }: SprintTimelineProps) {
  const { data, loading } = useSprintTimeline();
  const containerRef = useRef<HTMLDivElement>(null);

  const [tooltip, setTooltip] = useState<TooltipState>({
    segment: { commits: 0, startDate: "", endDate: "", density: 0 },
    position: { left: 0, top: 0 },
    visible: false,
  });

  // Compute the window start date (84 days ago)
  const { windowStart, monthLabels } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 83);
    start.setHours(0, 0, 0, 0);

    // Compute month labels
    const labels: { label: string; offset: number }[] = [];
    let lastMonth = -1;
    for (let i = 0; i < 84; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const month = d.getMonth();
      if (month !== lastMonth) {
        labels.push({ label: MONTH_NAMES[month]!, offset: i });
        lastMonth = month;
      }
    }

    return { windowStart: start, monthLabels: labels };
  }, []);

  const handleHover = useCallback(
    (segment: TimelineSegment | null, rect: DOMRect | null) => {
      if (!segment || !rect || !containerRef.current) {
        setTooltip((prev) => ({ ...prev, visible: false }));
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      setTooltip({
        segment,
        position: {
          left: rect.left - containerRect.left + rect.width / 2,
          top: rect.top - containerRect.top - 44,
        },
        visible: true,
      });
    },
    []
  );

  // Loading skeleton matching SprintHeatmap pattern
  if (loading) {
    return (
      <div>
        <div className="section-divider mb-3">
          <span className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark whitespace-nowrap">
            Sprint Activity
          </span>
        </div>
        <div className="space-y-1 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-24 h-2.5 bg-surface-warm/50 dark:bg-surface-warm-dark/50 rounded" />
              <div className="flex-1 h-[10px] bg-surface-warm/30 dark:bg-surface-warm-dark/30 rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (!data || data.projects.length === 0) {
    return null;
  }

  // Cap at MAX_PROJECTS
  const projects = data.projects.slice(0, MAX_PROJECTS);
  const windowDays = data.windowDays || 84;

  return (
    <div>
      <div className="section-divider mb-3">
        <span className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark whitespace-nowrap">
          Sprint Activity
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]" ref={containerRef}>
          {/* Month labels */}
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-24 shrink-0" />
            <div className="relative h-4 flex-1">
              {monthLabels.map(({ label, offset }) => (
                <span
                  key={`${label}-${offset}`}
                  className="absolute text-[10px] font-mono text-text-muted dark:text-text-muted-dark tabular-nums"
                  style={{ left: `${(offset / 84) * 100}%` }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Swimlane rows */}
          <div className="space-y-1">
            {projects.map((project) => (
              <TimelineSwimlane
                key={project.slug}
                slug={project.slug}
                segments={project.segments}
                totalCommits={project.totalCommits}
                isFocused={project.slug === data.focusedProject}
                windowDays={windowDays}
                windowStart={windowStart}
                onSelect={onSelect}
                onHover={handleHover}
              />
            ))}
          </div>

          {/* Tooltip */}
          <TimelineTooltip
            segment={tooltip.segment}
            position={tooltip.position}
            visible={tooltip.visible}
          />
        </div>
      </div>
    </div>
  );
}
