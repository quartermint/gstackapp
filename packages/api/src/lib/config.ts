import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const projectEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  path: z.string(),
  host: z.enum(["local", "mac-mini", "github"]),
  tagline: z.string().optional(),
  repo: z.string().optional(),
});

const serviceEntrySchema = z.object({
  name: z.string().min(1),
  port: z.number().int().positive(),
  host: z.string().default("localhost"),
});

export type ServiceEntry = z.infer<typeof serviceEntrySchema>;

export const multiCopyEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  tagline: z.string().optional(),
  repo: z.string().optional(),
  copies: z.array(z.object({
    host: z.enum(["local", "mac-mini"]),
    path: z.string(),
  })).min(1),
});

export type MultiCopyEntry = z.infer<typeof multiCopyEntrySchema>;

/** Single-host first (most entries match it; z.union tries in order) */
export const projectConfigEntrySchema = z.union([
  projectEntrySchema,
  multiCopyEntrySchema,
]);

export type ProjectConfigEntry = z.infer<typeof projectConfigEntrySchema>;

const modelTierMappingSchema = z.object({
  pattern: z.string().min(1),
  tier: z.enum(["opus", "sonnet", "local"]),
});

export type ModelTierMapping = z.infer<typeof modelTierMappingSchema>;

const budgetThresholdsSchema = z.object({
  weeklyOpusHot: z.number().int().min(1).default(20),
  weeklyOpusModerate: z.number().int().min(1).default(10),
  weekResetDay: z.number().int().min(0).max(6).default(5), // 5 = Friday
});

export type BudgetThresholds = z.infer<typeof budgetThresholdsSchema>;

const lmStudioConfigSchema = z.object({
  url: z.string().url().default("http://100.x.x.x:1234"),
  targetModel: z.string().default("qwen3-coder"),
  probeIntervalMs: z.number().int().min(5000).default(30000),
});

export type LmStudioConfig = z.infer<typeof lmStudioConfigSchema>;

const discoveryConfigSchema = z.object({
  paths: z.array(z.string()).default(["~"]),
  scanIntervalMinutes: z.number().int().min(5).default(60),
  githubOrgs: z.array(z.string()).default(["quartermint", "vanboompow"]),
  starSyncIntervalHours: z.number().int().min(1).default(6),
});

export type DiscoveryConfig = z.infer<typeof discoveryConfigSchema>;

export const mcConfigSchema = z.object({
  projects: z.array(projectConfigEntrySchema),
  dataDir: z.string().default("./data"),
  services: z.array(serviceEntrySchema).default([]),
  macMiniSshHost: z.string().default("mac-mini-host"),
  modelTiers: z.array(modelTierMappingSchema).default([
    { pattern: "^claude-opus", tier: "opus" },
    { pattern: "^claude-sonnet", tier: "sonnet" },
  ]),
  budgetThresholds: budgetThresholdsSchema.default({}),
  lmStudio: lmStudioConfigSchema.default({}),
  discovery: discoveryConfigSchema.default({}),
});

export type MCConfig = z.infer<typeof mcConfigSchema>;

export function loadConfig(): MCConfig {
  const configPath = process.env["MC_CONFIG_PATH"] ?? resolve(process.cwd(), "mc.config.json");

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    throw new Error(
      `Config file not found at ${configPath}. Copy mc.config.example.json to mc.config.json and customize it.`
    );
  }

  const parsed: unknown = JSON.parse(raw);
  const result = mcConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(
      `Invalid config at ${configPath}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`
    );
  }

  return result.data;
}
