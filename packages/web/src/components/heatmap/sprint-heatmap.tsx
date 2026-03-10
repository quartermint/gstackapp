import { useMemo } from "react";
import type { HeatmapEntry } from "../../hooks/use-heatmap.js";
import { HeatmapGrid } from "./heatmap-grid.js";

interface SprintHeatmapProps {
  data: HeatmapEntry[];
  loading: boolean;
}

/**
 * Full-width sprint heatmap showing GitHub-style contribution grid.
 * One row per project with commits in the 12-week window.
 * Shows abbreviated month labels at the top.
 */
export function SprintHeatmap({ data, loading }: SprintHeatmapProps) {
  // Calculate 12-week window dates
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 83); // 12 weeks = 84 days, -83 to include today
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, []);

  // Group data by project, filtering out projects with no commits
  const projectGroups = useMemo(() => {
    const grouped = new Map<
      string,
      { date: string; count: number }[]
    >();

    for (const entry of data) {
      const existing = grouped.get(entry.projectSlug) ?? [];
      existing.push({ date: entry.date, count: entry.count });
      grouped.set(entry.projectSlug, existing);
    }

    // Filter: only include projects with at least 1 commit
    const result: { slug: string; entries: { date: string; count: number }[] }[] = [];
    for (const [slug, entries] of grouped) {
      const totalCommits = entries.reduce((sum, e) => sum + e.count, 0);
      if (totalCommits > 0) {
        result.push({ slug, entries });
      }
    }

    // Sort by total commits descending (most active at top)
    result.sort((a, b) => {
      const aTotal = a.entries.reduce((s, e) => s + e.count, 0);
      const bTotal = b.entries.reduce((s, e) => s + e.count, 0);
      return bTotal - aTotal;
    });

    return result;
  }, [data]);

  // Generate month labels for the week columns
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
        // getMonth() returns 0-11, always within MONTH_NAMES bounds
        labels.push({ label: MONTH_NAMES[month]!, offset: i });
        lastMonth = month;
      }
    }

    return labels;
  }, [startDate]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="mb-4">
        <div className="text-xs text-text-muted dark:text-text-muted-dark uppercase tracking-wide mb-2">
          Sprint Activity
        </div>
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-24 h-3 bg-surface-warm/50 dark:bg-surface-warm-dark/50 rounded animate-pulse" />
              <div className="flex gap-0.5">
                {Array.from({ length: 28 }, (_, j) => (
                  <div
                    key={j}
                    className="w-3 h-3 rounded-sm bg-surface-warm/30 dark:bg-surface-warm-dark/30 animate-pulse"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Don't render if no data after filtering
  if (projectGroups.length === 0) {
    return null;
  }

  // Derive display name from slug (capitalize, replace hyphens with spaces)
  function displayName(slug: string): string {
    return slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  return (
    <div className="mb-4">
      <div className="text-xs text-text-muted dark:text-text-muted-dark uppercase tracking-wide mb-2">
        Sprint Activity
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Month labels */}
          <div className="flex items-center gap-2 mb-1">
            {/* Spacer for project name column */}
            <div className="w-24 shrink-0" />
            {/* Month label positioned by day offset */}
            <div className="relative h-4 flex-1">
              {monthLabels.map(({ label, offset }) => (
                <span
                  key={`${label}-${offset}`}
                  className="absolute text-[10px] text-text-muted dark:text-text-muted-dark"
                  style={{ left: `${offset * 14}px` }}
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
