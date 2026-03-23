import { z } from "zod";

export const captureTypeEnum = z.enum(["text", "voice", "link", "image"]);

export const captureStatusEnum = z.enum([
  "raw",
  "pending_enrichment",
  "enriched",
  "archived",
]);

export const captureSourceTypeEnum = z.enum([
  "manual",
  "capacities",
  "imessage",
  "cli",
]);

export const extractionTypeEnum = z.enum([
  "project_ref",
  "action_item",
  "idea",
  "link",
  "question",
]);

export const groundingSpanSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  text: z.string(),
  tier: z.enum(["exact", "lesser", "fuzzy"]),
});

export const captureExtractionSchema = z.object({
  id: z.string(),
  captureId: z.string(),
  extractionType: extractionTypeEnum,
  content: z.string(),
  confidence: z.number().min(0).max(1),
  grounding: z.array(groundingSpanSchema).nullable().optional(),
  createdAt: z.string().datetime(),
});

export const fewShotExampleSchema = z.object({
  id: z.string(),
  captureContent: z.string(),
  projectSlug: z.string(),
  extractionType: extractionTypeEnum,
  isCorrection: z.boolean().default(false),
  sourceCaptureId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export const correctionStatsSchema = z.object({
  predictedSlug: z.string(),
  actualSlug: z.string(),
  correctionCount: z.number().int(),
  lastCorrectedAt: z.string().datetime(),
});

export const reassignCaptureSchema = z.object({
  projectSlug: z.string().min(1),
});

export const captureSchema = z.object({
  id: z.string(),
  rawContent: z.string().min(1).max(10000),
  type: captureTypeEnum.default("text"),
  status: captureStatusEnum.default("raw"),
  projectId: z.string().nullable(),
  userId: z.string().nullable(),
  aiConfidence: z.number().nullable().optional(),
  aiProjectSlug: z.string().nullable().optional(),
  aiReasoning: z.string().nullable().optional(),
  linkUrl: z.string().nullable().optional(),
  linkTitle: z.string().nullable().optional(),
  linkDescription: z.string().nullable().optional(),
  linkDomain: z.string().nullable().optional(),
  linkImage: z.string().nullable().optional(),
  sourceType: captureSourceTypeEnum.default("manual"),
  enrichedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createCaptureSchema = z.object({
  rawContent: z.string().min(1).max(10000),
  type: captureTypeEnum.optional().default("text"),
  projectId: z.string().optional(),
  userId: z.string().optional(),
  clientId: z.string().optional(),
  sourceType: captureSourceTypeEnum.optional(),
});

export const updateCaptureSchema = z.object({
  rawContent: z.string().min(1).max(10000).optional(),
  type: captureTypeEnum.optional(),
  status: captureStatusEnum.optional(),
  projectId: z.string().nullable().optional(),
  aiConfidence: z.number().nullable().optional(),
  aiProjectSlug: z.string().nullable().optional(),
  aiReasoning: z.string().nullable().optional(),
  linkUrl: z.string().nullable().optional(),
  linkTitle: z.string().nullable().optional(),
  linkDescription: z.string().nullable().optional(),
  linkDomain: z.string().nullable().optional(),
  linkImage: z.string().nullable().optional(),
  enrichedAt: z.string().datetime().nullable().optional(),
});

export const captureIdSchema = z.object({
  id: z.string().min(1),
});

export const listCapturesQuerySchema = z.object({
  projectId: z.string().optional(),
  status: captureStatusEnum.optional(),
  userId: z.string().optional(),
  stale: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
