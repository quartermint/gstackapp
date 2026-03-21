import { z } from "zod";

export const knowledgeResponseSchema = z.object({
  projectSlug: z.string(),
  content: z.string(),
  contentHash: z.string(),
  lastModified: z.string(),
  fileSize: z.number(),
  stalenessScore: z.number(),
  commitsSinceUpdate: z.number(),
  lastScannedAt: z.string(),
});

export const knowledgeListResponseSchema = z.object({
  knowledge: z.array(knowledgeResponseSchema.omit({ content: true })),
  total: z.number(),
});
