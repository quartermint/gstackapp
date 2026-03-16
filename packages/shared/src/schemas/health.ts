import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────

export const healthCheckTypeEnum = z.enum([
  "unpushed_commits",
  "no_remote",
  "broken_tracking",
  "remote_branch_gone",
  "unpulled_commits",
  "dirty_working_tree",
  "diverged_copies",
  "session_file_conflict",
  "convergence",
]);

export const healthSeverityEnum = z.enum(["info", "warning", "critical"]);

/** "unmonitored" = GitHub-only projects with no local clone (HLTH-10) */
export const riskLevelEnum = z.enum([
  "healthy",
  "warning",
  "critical",
  "unmonitored",
]);

/** Copies are physical clones — excludes "github" (remote-only repos) */
export const copyHostEnum = z.enum(["local", "mac-mini"]);

// ── Health Findings ────────────────────────────────────────────────

export const healthFindingSchema = z.object({
  id: z.number().int(),
  projectSlug: z.string(),
  checkType: healthCheckTypeEnum,
  severity: healthSeverityEnum,
  detail: z.string(),
  metadata: z.record(z.unknown()).nullable(),
  detectedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});

/** Input schema for creating/upserting findings (no id, no timestamps) */
export const healthFindingInputSchema = z.object({
  projectSlug: z.string().min(1),
  checkType: healthCheckTypeEnum,
  severity: healthSeverityEnum,
  detail: z.string().min(1),
  metadata: z.record(z.unknown()).nullable().optional(),
});

// ── Project Copies ─────────────────────────────────────────────────

export const projectCopySchema = z.object({
  id: z.number().int(),
  projectSlug: z.string(),
  host: copyHostEnum,
  path: z.string(),
  remoteUrl: z.string().nullable(),
  headCommit: z.string().nullable(),
  branch: z.string().nullable(),
  isPublic: z.boolean().nullable(),
  lastCheckedAt: z.string().datetime(),
});

// ── Response Schemas (API layer) ──────────────────────────────────

/** Finding with isNew flag indicating current-scan-cycle detection (RISK-05). */
export const healthFindingResponseSchema = healthFindingSchema.extend({
  isNew: z.boolean(),
});

/** Response for GET /api/health-checks (list all findings). */
export const healthCheckResponseSchema = z.object({
  findings: z.array(healthFindingResponseSchema),
  total: z.number(),
});

/** Response for GET /api/health-checks/:slug (per-project findings). */
export const healthCheckDetailResponseSchema = z.object({
  findings: z.array(healthFindingResponseSchema),
  riskLevel: riskLevelEnum,
});

/** Response for GET /api/risks — riskCount is the single integer for browser title (RISK-04). */
export const risksResponseSchema = z.object({
  critical: z.array(healthFindingResponseSchema),
  warning: z.array(healthFindingResponseSchema),
  riskCount: z.number(),
  summary: z.string(),
});

/** Copy with isStale flag (true when lastCheckedAt > 10 minutes old). */
export const copyResponseSchema = projectCopySchema.extend({
  isStale: z.boolean(),
});

/** Response for GET /api/copies (list all copies). */
export const copiesListResponseSchema = z.object({
  copies: z.array(copyResponseSchema),
  total: z.number(),
});

/** Response for GET /api/copies/:slug (per-project copies). */
export const copiesDetailResponseSchema = z.object({
  copies: z.array(copyResponseSchema),
  projectSlug: z.string(),
});
