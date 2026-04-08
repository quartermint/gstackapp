import { z } from 'zod'

// ── GSD Progress (from STATE.md frontmatter) ──────────────────────────────────

export const gsdProgressSchema = z.object({
  total_phases: z.number(),
  completed_phases: z.number(),
  total_plans: z.number().optional(),
  completed_plans: z.number().optional(),
  percent: z.number(),
})
export type GsdProgress = z.infer<typeof gsdProgressSchema>

// ── GSD State (parsed from .planning/STATE.md YAML frontmatter) ───────────────

export const gsdStateSchema = z.object({
  milestone: z.string().optional(),
  milestone_name: z.string().optional(),
  status: z.string().optional(),
  stopped_at: z.string().optional(),
  last_activity: z.string().optional(),
  progress: gsdProgressSchema.optional(),
})
export type GsdState = z.infer<typeof gsdStateSchema>

// ── Git Status (from simple-git) ──────────────────────────────────────────────

export const gitStatusSchema = z.object({
  branch: z.string().nullable(),
  uncommitted: z.number(),
  ahead: z.number(),
  behind: z.number(),
  lastCommitDate: z.string().nullable(),
  lastCommitMessage: z.string().nullable(),
})
export type GitStatus = z.infer<typeof gitStatusSchema>

// ── Project State (complete project representation) ───────────────────────────

export const projectSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string().optional(),
  gsdState: gsdStateSchema.nullable(),
  gitStatus: gitStatusSchema.nullable(),
  status: z.enum(['active', 'stale', 'ideating']),
  hasDesignDocs: z.boolean(),
})
export type ProjectState = z.infer<typeof projectSchema>

// ── Response schema ───────────────────────────────────────────────────────────

export const projectsResponseSchema = z.array(projectSchema)
export type ProjectsResponse = z.infer<typeof projectsResponseSchema>
