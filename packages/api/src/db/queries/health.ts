import { eq, and, isNull } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { DrizzleDb } from "../index.js";
import { projectHealth } from "../schema.js";
import type { HealthFindingInput, RiskLevel } from "@mission-control/shared";

/**
 * Upsert a health finding using explicit SELECT-then-UPDATE/INSERT.
 *
 * Uses a transaction to atomically check for an existing active finding
 * (same projectSlug + checkType with resolvedAt IS NULL) and either:
 * - UPDATE severity/detail/metadata (preserving original detectedAt), or
 * - INSERT a new finding with a fresh detectedAt.
 *
 * Cannot use onConflictDoUpdate because SQLite does not support partial
 * unique indexes in ON CONFLICT targets (no WHERE resolvedAt IS NULL).
 */
export function upsertHealthFinding(
  _db: DrizzleDb,
  sqlite: Database.Database,
  finding: HealthFindingInput
): void {
  const now = new Date().toISOString();
  const metadataJson = finding.metadata
    ? JSON.stringify(finding.metadata)
    : null;

  const transaction = sqlite.transaction(() => {
    // Check for existing active finding (same slug + checkType, not resolved)
    const existing = sqlite
      .prepare(
        `SELECT id, detected_at FROM project_health
         WHERE project_slug = ? AND check_type = ? AND resolved_at IS NULL`
      )
      .get(finding.projectSlug, finding.checkType) as
      | { id: number; detected_at: string }
      | undefined;

    if (existing) {
      // UPDATE: preserve detected_at, update severity/detail/metadata
      sqlite
        .prepare(
          `UPDATE project_health
           SET severity = ?, detail = ?, metadata = ?
           WHERE id = ?`
        )
        .run(finding.severity, finding.detail, metadataJson, existing.id);
    } else {
      // INSERT: new finding with fresh detectedAt
      sqlite
        .prepare(
          `INSERT INTO project_health (project_slug, check_type, severity, detail, metadata, detected_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          finding.projectSlug,
          finding.checkType,
          finding.severity,
          finding.detail,
          metadataJson,
          now
        );
    }
  });

  transaction();
}

/**
 * Resolve active findings for a project.
 *
 * Sets resolvedAt on any active finding whose checkType is NOT in the
 * provided activeCheckTypes array. If activeCheckTypes is empty, resolves
 * ALL active findings for the project.
 */
export function resolveFindings(
  sqlite: Database.Database,
  projectSlug: string,
  activeCheckTypes: string[]
): void {
  const now = new Date().toISOString();

  if (activeCheckTypes.length > 0) {
    const placeholders = activeCheckTypes.map(() => "?").join(",");
    sqlite
      .prepare(
        `UPDATE project_health
         SET resolved_at = ?
         WHERE project_slug = ? AND resolved_at IS NULL
         AND check_type NOT IN (${placeholders})`
      )
      .run(now, projectSlug, ...activeCheckTypes);
  } else {
    sqlite
      .prepare(
        `UPDATE project_health
         SET resolved_at = ?
         WHERE project_slug = ? AND resolved_at IS NULL`
      )
      .run(now, projectSlug);
  }
}

/**
 * Get all active (unresolved) health findings, optionally filtered by project.
 */
export function getActiveFindings(
  db: DrizzleDb,
  projectSlug?: string
): Array<{
  id: number;
  projectSlug: string;
  checkType: string;
  severity: string;
  detail: string;
  metadata: Record<string, unknown> | null;
  detectedAt: string;
  resolvedAt: string | null;
}> {
  const conditions = [isNull(projectHealth.resolvedAt)];
  if (projectSlug) {
    conditions.push(eq(projectHealth.projectSlug, projectSlug));
  }

  const rows = db
    .select()
    .from(projectHealth)
    .where(and(...conditions))
    .all();

  return rows.map((row) => ({
    id: row.id,
    projectSlug: row.projectSlug,
    checkType: row.checkType,
    severity: row.severity,
    detail: row.detail,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    detectedAt: row.detectedAt,
    resolvedAt: row.resolvedAt,
  }));
}

/**
 * Compute risk level for a project based on its active health findings.
 *
 * Returns the worst severity mapped to a risk level:
 * - No findings -> "healthy"
 * - Worst is "info" -> "healthy"
 * - Worst is "warning" -> "warning"
 * - Worst is "critical" -> "critical"
 *
 * Note: "unmonitored" is NOT computed here -- it's set at the API/scanner
 * layer for GitHub-only projects with no local clone.
 */
export function getProjectRiskLevel(
  db: DrizzleDb,
  projectSlug: string
): RiskLevel {
  const findings = getActiveFindings(db, projectSlug);

  if (findings.length === 0) {
    return "healthy";
  }

  const severities = findings.map((f) => f.severity);

  if (severities.includes("critical")) {
    return "critical";
  }
  if (severities.includes("warning")) {
    return "warning";
  }

  // All findings are "info" severity
  return "healthy";
}
