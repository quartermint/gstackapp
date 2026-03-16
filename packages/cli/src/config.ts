import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface McConfig {
  apiUrl: string;
}

const MC_DIR = join(homedir(), ".mc");
const CONFIG_PATH = join(MC_DIR, "config.json");

/** Default MC API URL — Mac Mini Tailscale IP */
const DEFAULT_API_URL = "http://100.123.8.125:3000";

export function getConfigDir(): string {
  return MC_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function ensureConfigDir(): void {
  if (!existsSync(MC_DIR)) {
    mkdirSync(MC_DIR, { recursive: true });
  }
}

export function loadConfig(): McConfig | null {
  if (!existsSync(CONFIG_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.apiUrl !== "string" || !parsed.apiUrl) {
      return null;
    }
    return { apiUrl: parsed.apiUrl };
  } catch {
    return null;
  }
}

export function saveConfig(config: McConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getApiUrl(): string {
  const config = loadConfig();
  return config?.apiUrl ?? DEFAULT_API_URL;
}

export function getDefaultApiUrl(): string {
  return DEFAULT_API_URL;
}
