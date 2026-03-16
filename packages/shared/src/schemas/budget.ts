import { z } from "zod";

export const burnRateEnum = z.enum(["low", "moderate", "hot"]);

export const weeklyBudgetSchema = z.object({
  weekStart: z.string(),
  opus: z.number().int().min(0),
  sonnet: z.number().int().min(0),
  local: z.number().int().min(0),
  unknown: z.number().int().min(0),
  burnRate: burnRateEnum,
  isEstimated: z.literal(true),
});

export const routingSuggestionSchema = z
  .object({
    suggestedTier: z.enum(["opus", "sonnet", "local"]).nullable(),
    reason: z.string(),
    localAvailable: z.boolean(),
  })
  .nullable();

export const budgetResponseSchema = z.object({
  budget: weeklyBudgetSchema,
  suggestion: routingSuggestionSchema,
});
