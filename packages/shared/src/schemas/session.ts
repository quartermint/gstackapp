import { z } from "zod";

// -- Enums --
export const sessionSourceEnum = z.enum(["claude-code", "aider"]);
export const sessionStatusEnum = z.enum(["active", "completed", "abandoned"]);
export const modelTierEnum = z.enum(["opus", "sonnet", "local", "unknown"]);

// -- Input Schemas --
export const createSessionSchema = z.object({
  sessionId: z.string().min(1),
  source: sessionSourceEnum,
  model: z.string().nullable().optional(),
  cwd: z.string().min(1),
  taskDescription: z.string().nullable().optional(),
});

export const heartbeatSchema = z.object({
  filesTouched: z.array(z.string()).optional(),
  toolName: z.string().optional(),
});

export const stopSessionSchema = z.object({
  stopReason: z.string().nullable().optional(),
});

// -- Response Schemas --
export const sessionSchema = z.object({
  id: z.string(),
  source: sessionSourceEnum,
  model: z.string().nullable(),
  tier: modelTierEnum,
  projectSlug: z.string().nullable(),
  cwd: z.string(),
  status: sessionStatusEnum,
  filesJson: z.string().nullable(),
  taskDescription: z.string().nullable(),
  stopReason: z.string().nullable(),
  startedAt: z.string().datetime(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const sessionResponseSchema = sessionSchema.extend({
  elapsedMinutes: z.number().optional(),
});

export const listSessionsQuerySchema = z.object({
  status: sessionStatusEnum.optional(),
  projectSlug: z.string().optional(),
  source: sessionSourceEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
