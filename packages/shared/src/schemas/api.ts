import { z } from "zod";

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.number(),
  version: z.string(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().optional(),
});

export const searchResultSchema = z.object({
  id: z.string(),
  content: z.string(),
  snippet: z.string(),
  sourceType: z.enum(["capture", "commit", "project"]),
  sourceId: z.string(),
  projectSlug: z.string().nullable(),
  rank: z.number(),
  createdAt: z.string(),
});

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  query: z.string(),
  rewrittenQuery: z.string().nullable(),
  filters: z
    .object({
      project: z.string().nullable(),
      type: z.enum(["capture", "commit", "project"]).nullable(),
      dateAfter: z.string().nullable(),
      dateBefore: z.string().nullable(),
    })
    .nullable(),
});
