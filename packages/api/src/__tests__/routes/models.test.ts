import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import { createApp } from "../../app.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { MCConfig } from "../../lib/config.js";

const testConfig: MCConfig = {
  projects: [
    {
      name: "Test Project",
      slug: "test-project",
      path: "/test/project",
      host: "local",
      dependsOn: [],
      conventionOverrides: [],
    },
  ],
  dataDir: "./data",
  services: [],
  macMiniSshHost: "test-host",
  modelTiers: [
    { pattern: "^claude-opus", tier: "opus" },
    { pattern: "^claude-sonnet", tier: "sonnet" },
  ],
  budgetThresholds: {
    weeklyOpusHot: 20,
    weeklyOpusModerate: 10,
    weekResetDay: 5,
  },
  lmStudio: {
    url: "http://100.123.8.125:1234",
    targetModel: "qwen3-coder",
    probeIntervalMs: 30000,
  },
  discovery: { paths: ["~"], scanIntervalMinutes: 60, githubOrgs: ["quartermint", "vanboompow"], starSyncIntervalHours: 6 },
  conventions: [],
  ambientCapture: {},
  users: [],
};

describe("Models API", () => {
  let instance: DatabaseInstance;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    instance = createTestDb();
    app = createApp(instance, testConfig);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  // ── GET /api/models (API-06, GATE-03) ─────────────────────────

  describe("GET /api/models", () => {
    it("returns 200 with lmStudio status object", async () => {
      const res = await app.request("/api/models");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.lmStudio).toBeDefined();
    });

    it("response includes health, modelId, and lastChecked fields", async () => {
      const res = await app.request("/api/models");
      const body = await res.json();

      expect(body.lmStudio).toHaveProperty("health");
      expect(body.lmStudio).toHaveProperty("modelId");
      expect(body.lmStudio).toHaveProperty("lastChecked");

      // health should be one of the three valid states
      expect(["unavailable", "loading", "ready"]).toContain(
        body.lmStudio.health
      );

      // lastChecked should be a valid ISO date string
      expect(() => new Date(body.lmStudio.lastChecked)).not.toThrow();
      expect(
        new Date(body.lmStudio.lastChecked).toISOString()
      ).toBe(body.lmStudio.lastChecked);
    });

    it("defaults to unavailable when no LM Studio probe has run", async () => {
      const res = await app.request("/api/models");
      const body = await res.json();

      // In test environment, no LM Studio is running, so default is "unavailable"
      expect(body.lmStudio.health).toBe("unavailable");
      expect(body.lmStudio.modelId).toBeNull();
    });
  });
});
