import { useState } from "react";
import { SEVERITY_COLORS, severityIcon } from "../../lib/health-colors.js";
import { getActionCommand } from "../../lib/action-hints.js";
import { formatRelativeTime } from "../../lib/time.js";
import type { Severity } from "../../lib/health-colors.js";
import type { RiskFinding } from "../../hooks/use-risks.js";

interface RiskCardProps {
  finding: RiskFinding;
}

/**
 * Single-line risk card displaying:
 * [severity-icon] [new badge?] [project-name] [detail] [duration] [action-hint]
 *
 * No dismiss button -- cards only disappear when findings resolve via API.
 */
export function RiskCard({ finding }: RiskCardProps) {
  const [copied, setCopied] = useState(false);

  const severity = finding.severity as Severity;
  const colors = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.warning;
  const command = getActionCommand(finding.checkType, finding.metadata);
  const duration = formatRelativeTime(finding.detectedAt);
  const isSessionConflict = finding.metadata?.type === "session";

  async function handleCopy() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API not available (e.g., non-HTTPS)
    }
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-l-2 ${colors.bg} ${colors.border}`}
    >
      {/* Severity icon */}
      {severityIcon(severity)}

      {/* New badge */}
      {finding.isNew && (
        <span className="text-[9px] uppercase font-semibold bg-terracotta/15 text-terracotta rounded px-1 leading-tight">
          new
        </span>
      )}

      {/* Session conflict badge */}
      {isSessionConflict && (
        <span className="text-[9px] uppercase font-semibold bg-blue-500/15 text-blue-400 rounded px-1 leading-tight">
          sessions
        </span>
      )}

      {/* Project name */}
      <span
        data-testid="risk-project-name"
        className="font-medium text-sm text-text-primary dark:text-text-primary-dark whitespace-nowrap"
      >
        {finding.projectSlug}
      </span>

      {/* Detail */}
      <span className="text-xs text-text-secondary dark:text-text-secondary-dark truncate">
        {finding.detail}
      </span>

      {/* Duration */}
      <span
        data-testid="risk-duration"
        className="text-xs text-text-muted dark:text-text-muted-dark whitespace-nowrap ml-auto"
      >
        {duration}
      </span>

      {/* Action hint / Copy button */}
      {command && (
        <button
          type="button"
          onClick={handleCopy}
          className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-surface-elevated dark:bg-surface-elevated-dark text-text-secondary dark:text-text-secondary-dark hover:text-text-primary dark:hover:text-text-primary-dark transition-colors whitespace-nowrap cursor-pointer"
          title={`Copy: ${command}`}
        >
          {copied ? "Copied!" : command}
        </button>
      )}
    </div>
  );
}
