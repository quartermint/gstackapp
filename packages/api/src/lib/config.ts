import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const conventionRuleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  pattern: z.string().min(1),
  description: z.string().min(1),
  negativeContext: z.array(z.string()).optional().default([]),
  severity: z.enum(["info", "warning", "critical"]).optional().default("info"),
  matchType: z.enum(["must_not_match", "must_match"]).optional().default("must_not_match"),
});

export type ConventionRule = z.infer<typeof conventionRuleSchema>;

export const projectEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  path: z.string(),
  host: z.enum(["local", "mac-mini", "github"]),
  tagline: z.string().optional(),
  repo: z.string().optional(),
  dependsOn: z.array(z.string()).optional().default([]),
  conventionOverrides: z.array(z.string()).optional().default([]),
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
  dependsOn: z.array(z.string()).optional().default([]),
  conventionOverrides: z.array(z.string()).optional().default([]),
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

const ambientCaptureSchema = z.object({
  capacities: z.object({
    backupDir: z.string().default("~/Capacities_backup"),
    scheduleId: z.string().default("Schedule #1 (829272da)"),
    importIntervalHours: z.number().int().min(1).default(24),
    enabled: z.boolean().default(false),
  }).optional(),
  crawl4ai: z.object({
    url: z.string().url().default("http://100.x.x.x:11235"),
    enabled: z.boolean().default(true),
  }).optional(),
});

export type AmbientCaptureConfig = z.infer<typeof ambientCaptureSchema>;

export const mcConfigSchema = z.object({
  projects: z.array(projectConfigEntrySchema),
  dataDir: z.string().default("./data"),
  services: z.array(serviceEntrySchema).default([]),
  macMiniSshHost: z.string().default("mac-mini-host"),
  localSshHost: z.string().optional(),
  modelTiers: z.array(modelTierMappingSchema).default([
    { pattern: "^claude-opus", tier: "opus" },
    { pattern: "^claude-sonnet", tier: "sonnet" },
  ]),
  budgetThresholds: budgetThresholdsSchema.default({}),
  lmStudio: lmStudioConfigSchema.default({}),
  discovery: discoveryConfigSchema.default({}),
  conventions: z.array(conventionRuleSchema).optional().default([]),
  ambientCapture: ambientCaptureSchema.optional().default({}),
});

export type MCConfig = z.infer<typeof mcConfigSchema>;

/**
 * Detect circular dependencies in the project dependency graph using DFS.
 *
 * Returns the cycle path as a string array (e.g., ["a", "b", "a"]) if a cycle
 * is found, or null if the graph is acyclic. Handles unknown slugs in dependsOn
 * gracefully (cross-config references).
 */
export function detectCycles(projects: Array<{ slug: string; dependsOn?: string[] }>): string[] | null {
  const graph = new Map<string, string[]>();
  for (const p of projects) {
    graph.set(p.slug, p.dependsOn ?? []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): string[] | null {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      return [...path.slice(cycleStart), node];
    }
    if (visited.has(node)) return null;

    visited.add(node);
    inStack.add(node);

    for (const dep of graph.get(node) ?? []) {
      const cycle = dfs(dep, [...path, node]);
      if (cycle) return cycle;
    }

    inStack.delete(node);
    return null;
  }

  for (const slug of graph.keys()) {
    const cycle = dfs(slug, []);
    if (cycle) return cycle;
  }

  return null;
}

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

  const cycle = detectCycles(result.data.projects);
  if (cycle) {
    throw new Error(
      `Circular dependency detected: ${cycle.join(" -> ")}`
    );
  }

  return result.data;
}
