import { describe, it, expect } from "vitest";
import { deriveModelTier } from "../../lib/model-tier.js";
import type { MCConfig } from "../../lib/config.js";

describe("deriveModelTier", () => {
  it("maps claude-opus model to opus tier", () => {
    expect(deriveModelTier("claude-opus-4-20250514")).toBe("opus");
  });

  it("maps claude-sonnet model to sonnet tier", () => {
    expect(deriveModelTier("claude-sonnet-4-20250514")).toBe("sonnet");
  });

  it("maps non-Anthropic model to local tier", () => {
    expect(deriveModelTier("qwen3-coder-30b")).toBe("local");
  });

  it("maps null model to unknown tier", () => {
    expect(deriveModelTier(null)).toBe("unknown");
  });

  it("maps undefined model to unknown tier", () => {
    expect(deriveModelTier(undefined)).toBe("unknown");
  });

  it("maps empty string to unknown tier", () => {
    expect(deriveModelTier("")).toBe("unknown");
  });

  it("uses config-driven regex patterns when provided", () => {
    const config: MCConfig = {
      projects: [],
      dataDir: "./data",
      services: [],
      macMiniSshHost: "mac-mini-host",
      modelTiers: [
        { pattern: "^gpt-4", tier: "opus" },
        { pattern: "^claude-opus", tier: "opus" },
        { pattern: "^claude-sonnet", tier: "sonnet" },
      ],
      budgetThresholds: { weeklyOpusHot: 20, weeklyOpusModerate: 10, weekResetDay: 5 },
      lmStudio: { url: "http://100.x.x.x:1234", targetModel: "qwen3-coder", probeIntervalMs: 30000 },
      discovery: { paths: ["~"], scanIntervalMinutes: 60, githubOrgs: ["quartermint", "vanboompow"], starSyncIntervalHours: 6, sshEnabled: true },
    conventions: [],
    ambientCapture: {},
    users: [],
    };

    expect(deriveModelTier("gpt-4o", config)).toBe("opus");
  });

  it("config patterns take priority over built-in matching", () => {
    const config: MCConfig = {
      projects: [],
      dataDir: "./data",
      services: [],
      macMiniSshHost: "mac-mini-host",
      modelTiers: [
        { pattern: "^claude-opus", tier: "sonnet" },
      ],
      budgetThresholds: { weeklyOpusHot: 20, weeklyOpusModerate: 10, weekResetDay: 5 },
      lmStudio: { url: "http://100.x.x.x:1234", targetModel: "qwen3-coder", probeIntervalMs: 30000 },
      discovery: { paths: ["~"], scanIntervalMinutes: 60, githubOrgs: ["quartermint", "vanboompow"], starSyncIntervalHours: 6, sshEnabled: true },
    conventions: [],
    ambientCapture: {},
    users: [],
    };

    // Config says claude-opus -> sonnet (override)
    expect(deriveModelTier("claude-opus-4-20250514", config)).toBe("sonnet");
  });

  it("falls back to built-in matching when no config patterns match", () => {
    const config: MCConfig = {
      projects: [],
      dataDir: "./data",
      services: [],
      macMiniSshHost: "mac-mini-host",
      modelTiers: [
        { pattern: "^gpt-4", tier: "opus" },
      ],
      budgetThresholds: { weeklyOpusHot: 20, weeklyOpusModerate: 10, weekResetDay: 5 },
      lmStudio: { url: "http://100.x.x.x:1234", targetModel: "qwen3-coder", probeIntervalMs: 30000 },
      discovery: { paths: ["~"], scanIntervalMinutes: 60, githubOrgs: ["quartermint", "vanboompow"], starSyncIntervalHours: 6, sshEnabled: true },
    conventions: [],
    ambientCapture: {},
    users: [],
    };

    // No config match for claude-sonnet, falls back to built-in
    expect(deriveModelTier("claude-sonnet-4-20250514", config)).toBe("sonnet");
  });

  it("handles various opus model string variants", () => {
    expect(deriveModelTier("claude-opus-4-20250514")).toBe("opus");
    expect(deriveModelTier("claude-opus-3-5-20241022")).toBe("opus");
  });

  it("handles various sonnet model string variants", () => {
    expect(deriveModelTier("claude-sonnet-4-20250514")).toBe("sonnet");
    expect(deriveModelTier("claude-sonnet-3-5-20241022")).toBe("sonnet");
  });
});
