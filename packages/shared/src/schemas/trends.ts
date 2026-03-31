import { z } from 'zod'

// ── Quality Score Trend ─────────────────────────────────────────────────────

export const QualityScorePointSchema = z.object({
  date: z.string(),
  score: z.number().min(0).max(100),
})
export type QualityScorePoint = z.infer<typeof QualityScorePointSchema>

// ── Verdict Rate Trend ──────────────────────────────────────────────────────

export const VerdictRatePointSchema = z.object({
  date: z.string(),
  pass: z.number(),
  flag: z.number(),
  block: z.number(),
  skip: z.number(),
})
export type VerdictRatePoint = z.infer<typeof VerdictRatePointSchema>

// ── Finding Frequency Trend ─────────────────────────────────────────────────

export const FindingTrendPointSchema = z.object({
  date: z.string(),
  critical: z.number(),
  notable: z.number(),
  minor: z.number(),
})
export type FindingTrendPoint = z.infer<typeof FindingTrendPointSchema>

// ── Onboarding Status ───────────────────────────────────────────────────────

export const OnboardingStepSchema = z.enum([
  'install',
  'select-repos',
  'first-review',
  'complete',
])
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>

export const OnboardingStatusSchema = z.object({
  step: OnboardingStepSchema,
  installationCount: z.number(),
  repoCount: z.number(),
  pipelineCount: z.number(),
  githubAppUrl: z.string(),
})
export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>
