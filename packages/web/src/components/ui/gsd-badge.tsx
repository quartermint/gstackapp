interface GsdBadgeProps {
  gsdState: {
    status: string;
    stoppedAt: string | null;
    percent: number | null;
  };
}

export function GsdBadge({ gsdState }: GsdBadgeProps) {
  const label = gsdState.stoppedAt ?? gsdState.status;

  return (
    <span className="inline-flex items-center gap-1.5 bg-amber-warm/8 text-amber-warm border border-amber-warm/10 text-[10px] font-medium rounded-full px-2 py-0.5">
      {label}
      {gsdState.percent !== null && (
        <span className="text-amber-warm/60 tabular-nums">{gsdState.percent}%</span>
      )}
    </span>
  );
}
