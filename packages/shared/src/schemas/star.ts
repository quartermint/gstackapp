import { z } from "zod";

// -- Enums --
export const starIntentEnum = z.enum(["reference", "tool", "try", "inspiration"]);

// -- Response Schema --
export const starSchema = z.object({
  githubId: z.number().int(),
  fullName: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  htmlUrl: z.string().url(),
  intent: starIntentEnum.nullable(),
  aiConfidence: z.number().nullable(),
  userOverride: z.boolean(),
  starredAt: z.string().datetime(),
  lastSyncedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// -- Input Schemas --
export const createStarSchema = z.object({
  githubId: z.number().int(),
  fullName: z.string().min(1),
  description: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  topics: z.array(z.string()).default([]),
  htmlUrl: z.string().url(),
  starredAt: z.string().datetime(),
});

export const updateStarIntentSchema = z.object({
  intent: starIntentEnum,
});

export const listStarsQuerySchema = z.object({
  intent: starIntentEnum.optional(),
  language: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const starIdSchema = z.object({
  githubId: z.coerce.number().int(),
});
