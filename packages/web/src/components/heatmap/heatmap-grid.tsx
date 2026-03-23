import { HeatmapCell } from "./heatmap-cell.js";

interface HeatmapGridProps {
  projectSlug: string;
  projectName: string;
  entries: { date: string; count: number }[];
  startDate: string;
  endDate: string;
}

export function HeatmapGrid({
  projectName,
  entries,
  startDate,
  endDate,
}: HeatmapGridProps) {
  const countMap = new Map<string, number>();
  for (const entry of entries) {
    countMap.set(entry.date, entry.count);
  }

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
    <div className="flex items-center gap-2.5">
      <div
        className="w-24 shrink-0 text-[11px] text-text-secondary dark:text-text-secondary-dark truncate text-right"
        title={projectName}
      >
        {projectName}
      </div>
      <div className="flex gap-[3px] flex-wrap">
        {days.map((day) => (
          <HeatmapCell key={day.date} count={day.count} date={day.date} />
        ))}
      </div>
    </div>
  );
}
