import { useMemo } from "react";
import type { HeatmapEntry } from "../../hooks/use-heatmap.js";
import { HeatmapGrid } from "./heatmap-grid.js";

interface SprintHeatmapProps {
  data: HeatmapEntry[];
  loading: boolean;
}

export function SprintHeatmap({ data, loading }: SprintHeatmapProps) {
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 83);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, []);

  const projectGroups = useMemo(() => {
    const grouped = new Map<string, { date: string; count: number }[]>();

    for (const entry of data) {
      const existing = grouped.get(entry.projectSlug) ?? [];
      existing.push({ date: entry.date, count: entry.count });
      grouped.set(entry.projectSlug, existing);
    }

    const result: { slug: string; entries: { date: string; count: number }[] }[] = [];
    for (const [slug, entries] of grouped) {
      const totalCommits = entries.reduce((sum, e) => sum + e.count, 0);
      if (totalCommits > 0) {
        result.push({ slug, entries });
      }
    }

    result.sort((a, b) => {
      const aTotal = a.entries.reduce((s, e) => s + e.count, 0);
      const bTotal = b.entries.reduce((s, e) => s + e.count, 0);
      return bTotal - aTotal;
    });

    return result;
  }, [data]);

  const monthLabels = useMemo(() => {
    const labels: { label: string; offset: number }[] = [];
    const start = new Date(startDate + "T00:00:00");
    const MONTH_NAMES = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
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

    return labels;
  }, [startDate]);

  if (loading) {
    return (
      <div>
        <div className="section-divider mb-3">
          <span className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark whitespace-nowrap">
            Sprint Activity
          </span>
        </div>
        <div className="space-y-1.5 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-24 h-3.5 bg-surface-warm/50 dark:bg-surface-warm-dark/50 rounded" />
              <div className="flex gap-[3px]">
                {Array.from({ length: 28 }, (_, j) => (
                  <div
                    key={j}
                    className="w-[13px] h-[13px] rounded-[3px] bg-surface-warm/30 dark:bg-surface-warm-dark/30"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (projectGroups.length === 0) {
    return null;
  }

  function displayName(slug: string): string {
    return slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  return (
    <div>
      <div className="section-divider mb-3">
        <span className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark whitespace-nowrap">
          Sprint Activity
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Month labels */}
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-24 shrink-0" />
            <div className="relative h-4 flex-1">
              {monthLabels.map(({ label, offset }) => (
                <span
                  key={`${label}-${offset}`}
                  className="absolute text-[10px] font-mono text-text-muted dark:text-text-muted-dark tabular-nums"
                  style={{ left: `${offset * 16}px` }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Project rows */}
          <div className="space-y-1">
            {projectGroups.map(({ slug, entries }) => (
              <HeatmapGrid
                key={slug}
                projectSlug={slug}
                projectName={displayName(slug)}
                entries={entries}
                startDate={startDate}
                endDate={endDate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
