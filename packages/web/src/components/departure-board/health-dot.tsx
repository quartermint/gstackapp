import { SEVERITY_COLORS } from "../../lib/health-colors.js";
import type { Severity } from "../../lib/health-colors.js";

type RiskLevel = Severity | "unmonitored";

interface HealthDotProps {
  riskLevel: RiskLevel;
  hasDivergedCopies: boolean;
  onClick: (e: React.MouseEvent) => void;
}

/**
 * 8px health indicator dot for project cards.
 * Shows green/amber/red based on worst active finding, gray for unmonitored.
 * Split dot variant shows divergence across copies (left = risk color, right = rust).
 */
export function HealthDot({ riskLevel, hasDivergedCopies, onClick }: HealthDotProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(e);
  };

  // Title text for accessibility
  const titleMap: Record<RiskLevel, string> = {
    healthy: "Healthy",
    warning: "Warning",
    critical: "Critical risk",
    unmonitored: "Not monitored",
  };

  // Dot color class
  const dotColor =
    riskLevel === "unmonitored"
      ? "bg-text-muted dark:bg-text-muted-dark"
      : SEVERITY_COLORS[riskLevel].dot;

  if (hasDivergedCopies) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="w-2 h-2 rounded-full overflow-hidden flex shrink-0 cursor-pointer"
        title={`${titleMap[riskLevel]} (copies diverged)`}
        aria-label={`${titleMap[riskLevel]}, copies diverged`}
      >
        <div
          data-testid="split-dot-half"
          className={`w-1 h-2 ${dotColor}`}
        />
        <div
          data-testid="split-dot-half"
          className="w-1 h-2 bg-rust"
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-2 h-2 rounded-full shrink-0 cursor-pointer ${dotColor}`}
      title={titleMap[riskLevel]}
      aria-label={titleMap[riskLevel]}
    />
  );
}
