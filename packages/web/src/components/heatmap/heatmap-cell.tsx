/**
 * Individual intensity cell for the sprint heatmap.
 * Color intensity reflects commit count on a 5-level terracotta scale.
 */

interface HeatmapCellProps {
  count: number;
  date: string;
}

/**
 * Map commit count to intensity level (0-4).
 * 0: no commits, 1: 1 commit, 2: 2-3, 3: 4-6, 4: 7+
 */
function getIntensityLevel(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/** Tailwind classes for each intensity level */
const INTENSITY_CLASSES: Record<number, string> = {
  0: "bg-surface-warm/30 dark:bg-surface-warm-dark/30",
  1: "bg-terracotta/20",
  2: "bg-terracotta/40",
  3: "bg-terracotta/70",
  4: "bg-terracotta",
};

export function HeatmapCell({ count, date }: HeatmapCellProps) {
  const level = getIntensityLevel(count);
  const tooltip =
    count > 0
      ? `${date}: ${count} commit${count === 1 ? "" : "s"}`
      : `${date}: no commits`;

  return (
    <div
      className={`w-3 h-3 rounded-sm ${INTENSITY_CLASSES[level]}`}
      title={tooltip}
    />
  );
}
