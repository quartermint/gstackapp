import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  path: z.string().min(1),
  host: z.enum(["local", "mac-mini"]),
  tagline: z.string().optional(),
});

const mcConfigSchema = z.object({
  projects: z.array(projectEntrySchema),
  dataDir: z.string().default("./data"),
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
