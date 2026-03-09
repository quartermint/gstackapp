import { z } from "zod";

export const projectHostEnum = z.enum(["local", "mac-mini"]);

export const projectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  tagline: z.string().nullable(),
  path: z.string(),
  host: projectHostEnum,
  branch: z.string().nullable(),
  dirty: z.boolean().nullable(),
  dirtyFiles: z.array(z.string()),
  lastCommitHash: z.string().nullable(),
  lastCommitMessage: z.string().nullable(),
  lastCommitTime: z.string().nullable(),
  lastScannedAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const projectSlugSchema = z.object({
  slug: z.string().min(1),
});

export const projectListQuerySchema = z.object({
  host: projectHostEnum.optional(),
  userId: z.string().optional(),
});
