import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";

// We test config by overriding the home directory
// Since config.ts uses homedir(), we mock os.homedir
vi.mock("node:os", async () => {
  const actual = await vi.importActual("node:os");
  return {
    ...actual,
    homedir: vi.fn(),
  };
});

import { homedir } from "node:os";
const mockHomedir = vi.mocked(homedir);

describe("config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `mc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    mockHomedir.mockReturnValue(tempDir);
    // Re-import to pick up mocked homedir
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loadConfig returns null when no config file exists", async () => {
    const { loadConfig } = await import("../config.js");
    expect(loadConfig()).toBeNull();
  });

  it("saveConfig creates ~/.mc directory and writes config", async () => {
    const { saveConfig, loadConfig } = await import("../config.js");
    saveConfig({ apiUrl: "http://localhost:3000" });
    const config = loadConfig();
    expect(config).toEqual({ apiUrl: "http://localhost:3000" });
  });

  it("getApiUrl returns default when no config", async () => {
    const { getApiUrl } = await import("../config.js");
    expect(getApiUrl()).toBe("http://100.x.x.x:3000");
  });

  it("getApiUrl returns configured URL when config exists", async () => {
    const { saveConfig } = await import("../config.js");
    saveConfig({ apiUrl: "http://custom:4000" });
    const configPath = join(tempDir, ".mc", "config.json");
    expect(existsSync(configPath)).toBe(true);
    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(content.apiUrl).toBe("http://custom:4000");
  });

  it("loadConfig returns null for corrupt JSON", async () => {
    const mcDir = join(tempDir, ".mc");
    mkdirSync(mcDir, { recursive: true });
    writeFileSync(join(mcDir, "config.json"), "not json", "utf-8");
    const { loadConfig } = await import("../config.js");
    expect(loadConfig()).toBeNull();
  });

  it("loadConfig returns null for config missing apiUrl", async () => {
    const mcDir = join(tempDir, ".mc");
    mkdirSync(mcDir, { recursive: true });
    writeFileSync(join(mcDir, "config.json"), '{"other":"field"}', "utf-8");
    const { loadConfig } = await import("../config.js");
    expect(loadConfig()).toBeNull();
  });
});
