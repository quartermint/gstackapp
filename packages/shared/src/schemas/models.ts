import { z } from "zod";

export const lmStudioHealthEnum = z.enum(["unavailable", "loading", "ready"]);

export const lmStudioStatusSchema = z.object({
  health: lmStudioHealthEnum,
  modelId: z.string().nullable(),
  lastChecked: z.string().datetime(),
});

export const modelsResponseSchema = z.object({
  lmStudio: lmStudioStatusSchema,
});
