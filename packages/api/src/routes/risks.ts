import { Hono } from "hono";
import { getActiveFindings } from "../db/queries/health.js";
import { getLastScanCycleStartedAt } from "../services/project-scanner.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Risk aggregation route.
 *
 * GET /risks — Findings grouped by severity with riskCount integer.
 * riskCount = critical.length + warning.length (info excluded).
 * This is the single integer RISK-04 needs for `document.title`.
 */
export function createRiskRoutes(getInstance: () => DatabaseInstance) {
  return new Hono().get("/risks", (c) => {
    const findings = getActiveFindings(getInstance().db);
    const scanStart = getLastScanCycleStartedAt();

    const addNew = (f: (typeof findings)[number]) => ({
      ...f,
      isNew: scanStart ? f.detectedAt >= scanStart : false,
    });

    const critical = findings
      .filter((f) => f.severity === "critical")
      .map(addNew);
    const warning = findings
      .filter((f) => f.severity === "warning")
      .map(addNew);
    const riskCount = critical.length + warning.length;

    return c.json({
      critical,
      warning,
      riskCount,
      summary: `${critical.length} critical, ${warning.length} warning`,
    });
  });
}
