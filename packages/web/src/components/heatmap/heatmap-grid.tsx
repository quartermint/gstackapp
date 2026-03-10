import { HeatmapCell } from "./heatmap-cell.js";

interface HeatmapGridProps {
  projectSlug: string;
  projectName: string;
  entries: { date: string; count: number }[];
  startDate: string;
  endDate: string;
}

/**
 * Render one row of the heatmap grid for a single project.
 * Builds a complete day-by-day array from startDate to endDate,
 * fills in counts from entries, defaults to 0 for days with no commits.
 */
export function HeatmapGrid({
  projectName,
  entries,
  startDate,
  endDate,
}: HeatmapGridProps) {
  // Build lookup map from entries: date string -> count
  const countMap = new Map<string, number>();
  for (const entry of entries) {
    countMap.set(entry.date, entry.count);
  }

  // Generate day-by-day array from startDate to endDate
  const days: { date: string; count: number }[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  for (
    let d = new Date(start);
    d <= end;
    d.setDate(d.getDate() + 1)
  ) {
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ date: dateStr, count: countMap.get(dateStr) ?? 0 });
  }

  return (
    <div className="flex items-center gap-2">
      {/* Project name label */}
      <div
        className="w-24 shrink-0 text-xs text-text-secondary dark:text-text-secondary-dark truncate text-right"
        title={projectName}
      >
        {projectName}
      </div>

      {/* Cells */}
      <div className="flex gap-0.5 flex-wrap">
        {days.map((day) => (
          <HeatmapCell key={day.date} count={day.count} date={day.date} />
        ))}
      </div>
    </div>
  );
}
