import type { CompoundScore as CompoundScoreData } from "../../hooks/use-compound-score.js";

interface CompoundScoreProps {
  score: CompoundScoreData | null;
  pendingCount: number;
  loading: boolean;
}

/**
 * Mini sparkline SVG for weekly trend.
 * Each bar represents a week's reference count, height proportional to max.
 */
function TrendSparkline({ data }: { data: Array<{ week: string; references: number }> }) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.references), 1);
  const barWidth = 6;
  const gap = 2;
  const height = 20;
  const width = data.length * (barWidth + gap) - gap;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle"
    >
      {data.map((d, i) => {
        const barHeight = Math.max((d.references / max) * height, 1);
        return (
          <rect
            key={d.week}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1}
            className="fill-terracotta/60"
          />
        );
      })}
    </svg>
  );
}

/**
 * Compact compound score widget for the dashboard.
 * Shows reuse rate, solution/reference counts, and a weekly trend sparkline.
 * Styled like the budget widget (bg-warm-gray/5 rounded-xl p-3).
 */
export function CompoundScore({ score, pendingCount, loading }: CompoundScoreProps) {
  if (loading) {
    return (
      <div className="bg-warm-gray/5 dark:bg-warm-gray/8 rounded-xl p-3 animate-pulse">
        <div className="h-4 bg-warm-gray/10 rounded w-24 mb-2" />
        <div className="h-3 bg-warm-gray/10 rounded w-32" />
      </div>
    );
  }

  if (!score || score.totalSolutions === 0) {
    return (
      <div className="bg-warm-gray/5 dark:bg-warm-gray/8 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark">
            Knowledge Compound
          </span>
        </div>
        <p className="text-xs text-text-muted dark:text-text-muted-dark">
          No solutions yet -- sessions will auto-capture learnings
        </p>
      </div>
    );
  }

  const reusePercent = Math.round(score.reuseRate * 100);

  return (
    <div className="bg-warm-gray/5 dark:bg-warm-gray/8 rounded-xl p-3">
      {/* Top line: label + reuse rate */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase font-semibold tracking-widest text-text-muted dark:text-text-muted-dark">
            Knowledge Compound
          </span>
          {pendingCount > 0 && (
            <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-amber-warm/15 text-amber-warm">
              {pendingCount} pending
            </span>
          )}
        </div>
        <span className="text-sm font-semibold text-terracotta tabular-nums">
          {reusePercent}% reuse
        </span>
      </div>

      {/* Second line: counts + sparkline */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-secondary dark:text-text-secondary-dark">
          {score.acceptedSolutions} solutions, {score.totalReferences} references
        </span>
        <TrendSparkline data={score.weeklyTrend} />
      </div>
    </div>
  );
}
