import { z } from "zod";

export const insightTypeEnum = z.enum([
  "stale_capture",
  "activity_gap",
  "session_pattern",
  "cross_project",
]);

export const insightSchema = z.object({
  id: z.string(),
  type: insightTypeEnum,
  title: z.string(),
  body: z.string(),
  metadata: z.string().nullable(),
  projectSlug: z.string().nullable(),
  contentHash: z.string(),
  dismissedAt: z.coerce.date().nullable(),
  snoozedUntil: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
