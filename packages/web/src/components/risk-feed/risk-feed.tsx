import { severityIcon } from "../../lib/health-colors.js";
import { RiskCard } from "./risk-card.js";
import type { RisksResponse } from "../../hooks/use-risks.js";

interface RiskFeedProps {
  data: RisksResponse | null;
  loading: boolean;
}

/**
 * Risk feed component rendered above the departure board.
 * Shows severity-grouped findings (critical first) or a clean "all healthy" bar.
 *
 * - When loading: returns null (no skeleton for a status bar)
 * - When no risks: subtle green bar confirming health
 * - When risks exist: section header + cards grouped by severity
 */
export function RiskFeed({ data, loading }: RiskFeedProps) {
  if (loading) return null;

  // Clean bar when no risks
  if (!data || data.riskCount === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sage/10 dark:bg-sage/15">
        {severityIcon("healthy")}
        <span className="text-sm text-sage font-medium">
          All projects healthy
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Section header */}
      <h2 className="section-divider text-[11px] uppercase tracking-widest text-text-muted dark:text-text-muted-dark font-medium">
        Risk Feed
      </h2>

      {/* Critical findings first */}
      {data.critical.map((finding) => (
        <RiskCard key={finding.id} finding={finding} />
      ))}

      {/* Warning findings second */}
      {data.warning.map((finding) => (
        <RiskCard key={finding.id} finding={finding} />
      ))}
    </div>
  );
}
