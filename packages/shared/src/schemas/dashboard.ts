import { z } from 'zod'

// ── Design Document (from ~/.gstack/projects/) ──────────────────────────────

export const designDocSchema = z.object({
  projectName: z.string(),
  docTitle: z.string(),
  filePath: z.string(),
  content: z.string(),
  createdAt: z.string().nullable(),
  modifiedAt: z.string(),
})
export type DesignDoc = z.infer<typeof designDocSchema>

// ── Worklog Carryover Item ───────────────────────────────────────────────────

export const stalenessSchema = z.enum(['recent', 'aging', 'stale'])
export type Staleness = z.infer<typeof stalenessSchema>

export const carryoverItemSchema = z.object({
  projectName: z.string(),
  text: z.string(),
  loggedDate: z.string(),
  staleness: stalenessSchema,
})
export type CarryoverItem = z.infer<typeof carryoverItemSchema>

// ── Infrastructure Status (Mac Mini health) ──────────────────────────────────

export const serviceHealthSchema = z.object({
  name: z.string(),
  status: z.enum(['healthy', 'degraded', 'down']),
  endpoint: z.string().optional(),
  details: z.string().optional(),
})
export type ServiceHealth = z.infer<typeof serviceHealthSchema>

export const infraStatusSchema = z.object({
  reachable: z.boolean(),
  services: z.array(serviceHealthSchema),
  lastChecked: z.string(),
})
export type InfraStatus = z.infer<typeof infraStatusSchema>
