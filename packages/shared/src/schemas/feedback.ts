import { z } from 'zod'

export const FeedbackVoteSchema = z.enum(['up', 'down'])
export type FeedbackVote = z.infer<typeof FeedbackVoteSchema>

export const FeedbackSubmissionSchema = z.object({
  findingId: z.string(),
  vote: FeedbackVoteSchema,
  note: z.string().optional(),
})
export type FeedbackSubmission = z.infer<typeof FeedbackSubmissionSchema>
