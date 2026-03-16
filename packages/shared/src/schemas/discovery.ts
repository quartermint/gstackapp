import { z } from "zod";

// -- Enums --
export const discoveryHostEnum = z.enum(["local", "mac-mini", "github"]);
export const discoveryStatusEnum = z.enum(["found", "tracked", "dismissed"]);

// -- Response Schema --
export const discoverySchema = z.object({
  id: z.string(),
  path: z.string(),
  host: discoveryHostEnum,
  status: discoveryStatusEnum,
  remoteUrl: z.string().nullable(),
  name: z.string().nullable(),
  lastCommitAt: z.string().datetime().nullable(),
  discoveredAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// -- Input Schemas --
export const createDiscoverySchema = z.object({
  path: z.string().min(1),
  host: discoveryHostEnum,
  remoteUrl: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  lastCommitAt: z.string().datetime().nullable().optional(),
});

export const updateDiscoveryStatusSchema = z.object({
  status: z.enum(["tracked", "dismissed"]),
});

export const listDiscoveriesQuerySchema = z.object({
  host: discoveryHostEnum.optional(),
  status: discoveryStatusEnum.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const discoveryIdSchema = z.object({
  id: z.string().min(1),
});
