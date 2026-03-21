import { z } from "zod";

// -- Input Schemas --
export const recordVisitSchema = z.object({
  clientId: z.string().min(1).max(50),
});

export const getVisitQuerySchema = z.object({
  clientId: z.string().min(1).max(50),
});

// -- Response Schema --
export const visitResponseSchema = z.object({
  clientId: z.string(),
  lastVisitAt: z.string(),
  previousVisitAt: z.string().nullable(),
});
