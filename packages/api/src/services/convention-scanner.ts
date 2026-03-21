import type { ConventionRule } from "../lib/config.js";
import type { HealthFindingInput, HealthSeverity } from "@mission-control/shared";

const SEVERITY_ORDER: Record<HealthSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

/**
 * Check CLAUDE.md content against convention rules and return aggregated findings.
 *
 * Pure function -- no side effects. Returns at most one HealthFindingInput per project
 * with all violations aggregated into a single finding.
 *
 * @param slug - Project slug
 * @param content - CLAUDE.md content to check
 * @param rules - Convention rules from config
 * @param overrides - Rule IDs to skip for this project (conventionOverrides)
 * @returns Array with 0 or 1 HealthFindingInput
 */
export function checkConventions(
  slug: string,
  content: string,
  rules: ConventionRule[],
  overrides: string[]
): HealthFindingInput[] {
  if (rules.length === 0) return [];

  const overrideSet = new Set(overrides);
  const violations: Array<{ ruleId: string; description: string; severity: HealthSeverity }> = [];

  for (const rule of rules) {
    // Skip overridden rules
    if (overrideSet.has(rule.id)) continue;

    // Try to compile regex, skip on invalid
    let regex: RegExp;
    try {
      regex = new RegExp(rule.pattern, "im");
    } catch {
      continue;
    }

    const matches = regex.test(content);
    const matchType = rule.matchType ?? "must_not_match";

    if (matchType === "must_not_match") {
      if (!matches) continue; // No violation

      // Check negative context -- suppress if any negative pattern matches
      const negativeContext = rule.negativeContext ?? [];
      let suppressed = false;
      for (const negPattern of negativeContext) {
        try {
          const negRegex = new RegExp(negPattern, "im");
          if (negRegex.test(content)) {
            suppressed = true;
            break;
          }
        } catch {
          // Invalid negative context regex, skip
        }
      }

      if (suppressed) continue;

      violations.push({
        ruleId: rule.id,
        description: rule.description,
        severity: rule.severity ?? "info",
      });
    } else if (matchType === "must_match") {
      if (matches) continue; // Required pattern is present, no violation

      violations.push({
        ruleId: rule.id,
        description: rule.description,
        severity: rule.severity ?? "info",
      });
    }
  }

  if (violations.length === 0) return [];

  // Compute worst severity
  let worstSeverity: HealthSeverity = "info";
  for (const v of violations) {
    if (SEVERITY_ORDER[v.severity] > SEVERITY_ORDER[worstSeverity]) {
      worstSeverity = v.severity;
    }
  }

  // Aggregate into single finding
  const violationSummaries = violations.map((v) => `[${v.ruleId}] ${v.description}`);
  const detail = `Convention violations: ${violationSummaries.join("; ")}`;

  return [
    {
      projectSlug: slug,
      checkType: "convention_violation",
      severity: worstSeverity,
      detail,
      metadata: {
        violations: violations.map((v) => ({
          ruleId: v.ruleId,
          description: v.description,
        })),
      },
    },
  ];
}
