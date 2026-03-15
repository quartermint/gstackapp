import { Hono } from "hono";
import { getActiveFindings, getProjectRiskLevel } from "../db/queries/health.js";
import { getLastScanCycleStartedAt } from "../services/project-scanner.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Enrich findings with the isNew flag (RISK-05).
 * A finding is "new" if it was detected during or after the current scan cycle.
 */
function addIsNew(
  findings: Array<{ detectedAt: string; [key: string]: unknown }>
) {
  const scanStart = getLastScanCycleStartedAt();
  return findings.map((f) => ({
    ...f,
    isNew: scanStart ? f.detectedAt >= scanStart : false,
  }));
}

/**
 * Health check routes: listing and per-project detail endpoints.
 *
 * GET /health-checks          — All active findings (optional ?severity filter)
 * GET /health-checks/:slug    — Findings for one project with riskLevel
 */
export function createHealthCheckRoutes(
  getInstance: () => DatabaseInstance
) {
  return new Hono()
    .get("/health-checks", (c) => {
      const severity = c.req.query("severity");
      let findings = getActiveFindings(getInstance().db);
      if (severity) {
        findings = findings.filter((f) => f.severity === severity);
      }
      const enriched = addIsNew(findings);
      return c.json({ findings: enriched, total: enriched.length });
    })
    .get("/health-checks/:slug", (c) => {
      const slug = c.req.param("slug");
      const findings = getActiveFindings(getInstance().db, slug);
      const riskLevel = getProjectRiskLevel(getInstance().db, slug);
      const enriched = addIsNew(findings);
      return c.json({ findings: enriched, riskLevel });
    });
}
