import { useState } from "react";
import { useProjectHealth } from "../../hooks/use-project-health.js";
import { SEVERITY_COLORS, severityIcon } from "../../lib/health-colors.js";
import { getActionCommand } from "../../lib/action-hints.js";
import { formatRelativeTime } from "../../lib/time.js";
import type { Severity } from "../../lib/health-colors.js";
import type { HealthFinding } from "../../hooks/use-project-health.js";

interface FindingsPanelProps {
  slug: string;
  expanded: boolean;
}

/**
 * Inline expandable findings list for a project.
 * Lazy-loads findings only when expanded (via useProjectHealth).
 * Uses the same expand/collapse CSS transition pattern as PreviouslyOn.
 */
export function FindingsPanel({ slug, expanded }: FindingsPanelProps) {
  const { findings, loading } = useProjectHealth(expanded ? slug : null);

  return (
    <div
      className={`overflow-hidden transition-all duration-200 ease-in-out ${
        expanded ? "max-h-60 opacity-100 mt-2" : "max-h-0 opacity-0"
      }`}
    >
      <div className="border-l-2 border-terracotta/20 dark:border-terracotta/15 ml-2 pl-3 py-1.5 space-y-0.5">
        {loading && (
          <div className="text-[11px] text-text-muted dark:text-text-muted-dark italic py-1">
            Loading findings...
          </div>
        )}

        {!loading && findings.length === 0 && (
          <div className="text-[11px] text-text-muted dark:text-text-muted-dark italic py-1">
            No active findings
          </div>
        )}

        {!loading &&
          findings.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
      </div>
    </div>
  );
}

// ── FindingRow ─────────────────────────────────────────────────────

function FindingRow({ finding }: { finding: HealthFinding }) {
  const [copied, setCopied] = useState(false);
  const severity = (finding.severity === "critical" || finding.severity === "warning")
    ? finding.severity as Severity
    : "healthy" as Severity;
  const command = getActionCommand(finding.checkType, finding.metadata);
  const duration = formatRelativeTime(finding.detectedAt);

  async function handleCopy() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <div className="flex items-center gap-2 text-[11px] min-w-0">
      {/* Severity icon */}
      {severityIcon(severity)}

      {/* Detail */}
      <span className="truncate min-w-0 text-text-secondary dark:text-text-secondary-dark">
        {finding.detail}
      </span>

      {/* Duration */}
      <span className="text-text-muted dark:text-text-muted-dark whitespace-nowrap ml-auto tabular-nums shrink-0">
        {duration}
      </span>

      {/* Action hint / Copy button */}
      {command && (
        <button
          type="button"
          onClick={handleCopy}
          className="font-mono px-1 py-0.5 rounded bg-surface-elevated dark:bg-surface-elevated-dark text-text-secondary dark:text-text-secondary-dark hover:text-text-primary dark:hover:text-text-primary-dark transition-colors whitespace-nowrap cursor-pointer shrink-0"
          title={`Copy: ${command}`}
        >
          {copied ? "Copied!" : command}
        </button>
      )}
    </div>
  );
}
