import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// Mock the narrative generator before importing app
vi.mock("../../services/narrative-generator.js", () => ({
  getNarrative: vi.fn(() => null),
  narrativeSchema: {} as unknown,
}));

import { createTestDb } from "../helpers/setup.js";
import { createApp } from "../../app.js";
import type { DatabaseInstance } from "../../db/index.js";
import { createInsight } from "../../db/queries/insights.js";
import { insights } from "../../db/schema.js";

const testConfig = {
  projects: [
    {
      name: "Test Project",
      slug: "test-project",
      path: "/test/project",
      host: "local" as const,
      dependsOn: [],
      conventionOverrides: [],
    },
  ],
  dataDir: "./data",
  services: [],
  macMiniSshHost: "test-host",
  modelTiers: [
    { pattern: "^claude-opus", tier: "opus" as const },
    { pattern: "^claude-sonnet", tier: "sonnet" as const },
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
};

describe("Intelligence Insights API", () => {
  let instance: DatabaseInstance;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    instance = createTestDb();
    app = createApp(instance, testConfig);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    instance.db.delete(insights).run();
  });

  // ── GET /api/intelligence/insights ──────────────────────────────

  describe("GET /api/intelligence/insights", () => {
    it("returns seeded insights", async () => {
      createInsight(instance.db, {
        type: "stale_capture",
        title: "Stale captures found",
        body: "3 captures need attention",
        contentHash: "route-test-hash-1",
        projectSlug: "test-project",
      });

      const res = await app.request("/api/intelligence/insights");
      expect(res.status).toBe(200);

      const body = await res.json() as { insights: unknown[] };
      expect(body.insights).toHaveLength(1);
      expect((body.insights[0] as { title: string }).title).toBe("Stale captures found");
    });

    it("filters by type query param", async () => {
      createInsight(instance.db, {
        type: "stale_capture",
        title: "Stale one",
        body: "Body A",
        contentHash: "filter-hash-a",
      });

      createInsight(instance.db, {
        type: "activity_gap",
        title: "Gap one",
        body: "Body B",
        contentHash: "filter-hash-b",
      });

      const res = await app.request("/api/intelligence/insights?type=stale_capture");
      expect(res.status).toBe(200);

      const body = await res.json() as { insights: unknown[] };
      expect(body.insights).toHaveLength(1);
      expect((body.insights[0] as { type: string }).type).toBe("stale_capture");
    });

    it("returns empty array when no active insights", async () => {
      const res = await app.request("/api/intelligence/insights");
      expect(res.status).toBe(200);

      const body = await res.json() as { insights: unknown[] };
      expect(body.insights).toHaveLength(0);
    });
  });

  // ── POST /api/intelligence/insights/:id/dismiss ─────────────────

  describe("POST /api/intelligence/insights/:id/dismiss", () => {
    it("returns 200 and persists dismissal", async () => {
      const insight = createInsight(instance.db, {
        type: "stale_capture",
        title: "Dismiss me",
        body: "Will be dismissed",
        contentHash: "dismiss-route-hash",
      });

      const res = await app.request(
        `/api/intelligence/insights/${insight!.id}/dismiss`,
        { method: "POST" }
      );
      expect(res.status).toBe(200);

      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);

      // Verify it no longer appears in active list
      const listRes = await app.request("/api/intelligence/insights");
      const listBody = await listRes.json() as { insights: unknown[] };
      expect(listBody.insights).toHaveLength(0);
    });

    it("returns 404 for non-existent insight id", async () => {
      const res = await app.request(
        "/api/intelligence/insights/nonexistent-id/dismiss",
        { method: "POST" }
      );
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/intelligence/insights/:id/snooze ──────────────────

  describe("POST /api/intelligence/insights/:id/snooze", () => {
    it("returns 200 and insight no longer appears in active list", async () => {
      const insight = createInsight(instance.db, {
        type: "activity_gap",
        title: "Snooze me",
        body: "Will be snoozed",
        contentHash: "snooze-route-hash",
      });

      const res = await app.request(
        `/api/intelligence/insights/${insight!.id}/snooze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hours: 24 }),
        }
      );
      expect(res.status).toBe(200);

      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);

      // Verify it no longer appears in active list
      const listRes = await app.request("/api/intelligence/insights");
      const listBody = await listRes.json() as { insights: unknown[] };
      expect(listBody.insights).toHaveLength(0);
    });

    it("returns 404 for non-existent insight id", async () => {
      const res = await app.request(
        "/api/intelligence/insights/nonexistent-id/snooze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hours: 12 }),
        }
      );
      expect(res.status).toBe(404);
    });
  });
});
