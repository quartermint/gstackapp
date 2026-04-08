import { z } from 'zod'

// ── Ideation Stage & Status ─────────────────────────────────────────────────

export const ideationStageSchema = z.enum([
  'office-hours',
  'plan-ceo-review',
  'plan-eng-review',
  'design-consultation',
])
export type IdeationStage = z.infer<typeof ideationStageSchema>

export const ideationStatusSchema = z.enum([
  'pending',
  'running',
  'stage_complete',
  'complete',
  'failed',
])
export type IdeationStatus = z.infer<typeof ideationStatusSchema>

// ── Ideation Start Request ──────────────────────────────────────────────────

export const ideationStartSchema = z.object({
  idea: z.string().min(1).max(5000),
})
export type IdeationStartRequest = z.infer<typeof ideationStartSchema>

// ── Ideation Artifact ───────────────────────────────────────────────────────

export const ideationArtifactSchema = z.object({
  id: z.string(),
  stage: ideationStageSchema,
  artifactPath: z.string(),
  title: z.string().nullable(),
  excerpt: z.string().nullable(),
  createdAt: z.string(),
})
export type IdeationArtifact = z.infer<typeof ideationArtifactSchema>

// ── Ideation Session Response ───────────────────────────────────────────────

export const ideationSessionResponseSchema = z.object({
  id: z.string(),
  userIdea: z.string(),
  status: ideationStatusSchema,
  currentStage: ideationStageSchema.nullable(),
  artifacts: z.array(ideationArtifactSchema),
})
export type IdeationSessionResponse = z.infer<typeof ideationSessionResponseSchema>

// ── Autonomous Run Status ───────────────────────────────────────────────────

export const autonomousRunStatusSchema = z.enum([
  'pending',
  'running',
  'complete',
  'failed',
  'blocked',
])
export type AutonomousRunStatus = z.infer<typeof autonomousRunStatusSchema>

// ── Decision Gate ───────────────────────────────────────────────────────────

export const decisionGateOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
})

export const decisionGateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  options: z.array(decisionGateOptionSchema),
  blocking: z.boolean(),
  response: z.string().nullable(),
})
export type DecisionGate = z.infer<typeof decisionGateSchema>
