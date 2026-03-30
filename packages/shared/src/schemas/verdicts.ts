import { z } from 'zod'

export const VerdictSchema = z.enum(['PASS', 'FLAG', 'BLOCK', 'SKIP'])
export type Verdict = z.infer<typeof VerdictSchema>

export const StageSchema = z.enum(['ceo', 'eng', 'design', 'qa', 'security'])
export type Stage = z.infer<typeof StageSchema>

export const PipelineStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'STALE',
])
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>

export const SeveritySchema = z.enum(['critical', 'notable', 'minor'])
export type Severity = z.infer<typeof SeveritySchema>
