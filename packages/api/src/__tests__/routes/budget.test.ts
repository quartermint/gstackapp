import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import { createApp } from "../../app.js";
import { createSession } from "../../db/queries/sessions.js";
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
    url: "http://100.x.x.x:1234",
    targetModel: "qwen3-coder",
    probeIntervalMs: 30000,
  },
  discovery: { paths: ["~"], scanIntervalMinutes: 60, githubOrgs: ["quartermint", "vanboompow"], starSyncIntervalHours: 6 },
  conventions: [],
  ambientCapture: {},
  users: [],
};

describe("Budget API", () => {
  let instance: DatabaseInstance;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    instance = createTestDb();
    app = createApp(instance, testConfig);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  // ── GET /api/budget (API-05) ──────────────────────────────────

  describe("GET /api/budget", () => {
    it("returns 200 with budget and suggestion when no sessions exist", async () => {
      const res = await app.request("/api/budget");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.budget).toBeDefined();
      expect(body).toHaveProperty("suggestion");
    });

    it("returns all zero counts and burnRate low when no sessions", async () => {
      const res = await app.request("/api/budget");
      const body = await res.json();

      expect(body.budget.opus).toBe(0);
      expect(body.budget.sonnet).toBe(0);
      expect(body.budget.local).toBe(0);
      expect(body.budget.unknown).toBe(0);
      expect(body.budget.burnRate).toBe("low");
    });

    it("always includes isEstimated: true", async () => {
      const res = await app.request("/api/budget");
      const body = await res.json();

      expect(body.budget.isEstimated).toBe(true);
    });

    it("includes weekStart as ISO string", async () => {
      const res = await app.request("/api/budget");
      const body = await res.json();

      expect(body.budget.weekStart).toBeDefined();
      expect(typeof body.budget.weekStart).toBe("string");
      // Should be a valid ISO date
      expect(() => new Date(body.budget.weekStart)).not.toThrow();
    });

    it("returns null suggestion when burn rate is low", async () => {
      const res = await app.request("/api/budget");
      const body = await res.json();

      // With no sessions, burnRate is "low", suggestion should be null
      expect(body.suggestion).toBeNull();
    });

    it("reflects session counts in budget response", async () => {
      // Insert some sessions within the current week
      const now = new Date();
      const epochSec = Math.floor(now.getTime() / 1000);

      for (let i = 0; i < 3; i++) {
        createSession(instance.db, {
          sessionId: `budget-route-opus-${i}`,
          source: "claude-code",
          model: "claude-opus-4-20250514",
          cwd: "/test/project",
        });
        instance.sqlite
          .prepare("UPDATE sessions SET started_at = ? WHERE id = ?")
          .run(epochSec, `budget-route-opus-${i}`);
      }

      for (let i = 0; i < 2; i++) {
        createSession(instance.db, {
          sessionId: `budget-route-sonnet-${i}`,
          source: "claude-code",
          model: "claude-sonnet-4-20250514",
          cwd: "/test/project",
        });
        instance.sqlite
          .prepare("UPDATE sessions SET started_at = ? WHERE id = ?")
          .run(epochSec, `budget-route-sonnet-${i}`);
      }

      const res = await app.request("/api/budget");
      const body = await res.json();

      expect(body.budget.opus).toBe(3);
      expect(body.budget.sonnet).toBe(2);
      expect(body.budget.isEstimated).toBe(true);
    });
  });
});
