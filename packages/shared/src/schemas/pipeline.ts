import { z } from 'zod'
import { StageSchema, VerdictSchema, PipelineStatusSchema } from './verdicts'

export const StageResultSchema = z.object({
  stage: StageSchema,
  verdict: VerdictSchema,
  summary: z.string().optional(),
  tokenUsage: z.number().optional(),
  durationMs: z.number().optional(),
  error: z.string().optional(),
})
export type StageResult = z.infer<typeof StageResultSchema>

export const PipelineRunSchema = z.object({
  id: z.string(),
  deliveryId: z.string(),
  prId: z.number(),
  installationId: z.number(),
  headSha: z.string(),
  status: PipelineStatusSchema,
})
export type PipelineRun = z.infer<typeof PipelineRunSchema>

export const ReviewUnitTypeSchema = z.enum(['pr', 'push'])
export type ReviewUnitType = z.infer<typeof ReviewUnitTypeSchema>
