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
