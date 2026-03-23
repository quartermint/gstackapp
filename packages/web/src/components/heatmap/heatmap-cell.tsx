interface HeatmapCellProps {
  count: number;
  date: string;
}

function getIntensityLevel(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

const INTENSITY_CLASSES: Record<number, string> = {
  0: "bg-surface-warm/40 dark:bg-surface-warm-dark/40",
  1: "bg-terracotta/20",
  2: "bg-terracotta/40",
  3: "bg-terracotta/65",
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
      className={`w-[13px] h-[13px] rounded-[3px] transition-colors ${INTENSITY_CLASSES[level]}`}
      title={tooltip}
    />
  );
}
