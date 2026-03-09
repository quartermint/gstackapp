import { z } from "zod";

export const captureTypeEnum = z.enum(["text", "voice", "link", "image"]);

export const captureStatusEnum = z.enum([
  "raw",
  "pending_enrichment",
  "enriched",
  "archived",
]);

export const captureSchema = z.object({
  id: z.string(),
  rawContent: z.string().min(1).max(10000),
  type: captureTypeEnum.default("text"),
  status: captureStatusEnum.default("raw"),
  projectId: z.string().nullable(),
  userId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createCaptureSchema = z.object({
  rawContent: z.string().min(1).max(10000),
  type: captureTypeEnum.optional().default("text"),
  projectId: z.string().optional(),
  userId: z.string().optional(),
  clientId: z.string().optional(),
});

export const updateCaptureSchema = z.object({
  rawContent: z.string().min(1).max(10000).optional(),
  type: captureTypeEnum.optional(),
  status: captureStatusEnum.optional(),
  projectId: z.string().nullable().optional(),
});

export const captureIdSchema = z.object({
  id: z.string().min(1),
});

export const listCapturesQuerySchema = z.object({
  projectId: z.string().optional(),
  status: captureStatusEnum.optional(),
  userId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
