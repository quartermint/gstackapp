import { z } from 'zod'
import { SeveritySchema } from './verdicts'

export const FindingSchema = z.object({
  severity: SeveritySchema,
  category: z.string(),
  title: z.string(),
  description: z.string(),
  filePath: z.string().optional(),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional(),
  suggestion: z.string().optional(),
  codeSnippet: z.string().optional(),
})
export type Finding = z.infer<typeof FindingSchema>
