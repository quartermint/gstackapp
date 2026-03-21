import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";
import { upsertKnowledge } from "../../db/queries/knowledge.js";

describe("Knowledge Routes", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("GET /api/knowledge", () => {
    it("returns empty list when no knowledge records exist", async () => {
      const res = await app.request("/api/knowledge");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.knowledge).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns list of knowledge records without content field", async () => {
      // Seed knowledge records
      upsertKnowledge(instance.sqlite, {
        projectSlug: "mission-control",
        content: "# Mission Control\n\nFull content here.",
        contentHash: "hash1",
        fileSize: 40,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 0,
      });

      upsertKnowledge(instance.sqlite, {
        projectSlug: "openefb",
        content: "# OpenEFB\n\nFlight bag docs.",
        contentHash: "hash2",
        fileSize: 28,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 5,
      });

      const res = await app.request("/api/knowledge");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.total).toBe(2);
      expect(body.knowledge.length).toBe(2);

      // Verify no content field in list items
      for (const item of body.knowledge) {
        expect(item.projectSlug).toBeTruthy();
        expect(item.contentHash).toBeTruthy();
        expect(typeof item.fileSize).toBe("number");
        expect(typeof item.stalenessScore).toBe("number");
        expect(item.content).toBeUndefined();
      }
    });
  });

  describe("GET /api/knowledge/:slug", () => {
    it("returns 404 for unknown slug", async () => {
      const res = await app.request("/api/knowledge/nonexistent");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns full knowledge record with content and stalenessScore", async () => {
      const res = await app.request("/api/knowledge/mission-control");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.projectSlug).toBe("mission-control");
      expect(body.content).toBeTruthy();
      expect(body.contentHash).toBe("hash1");
      expect(typeof body.fileSize).toBe("number");
      expect(typeof body.stalenessScore).toBe("number");
      expect(typeof body.commitsSinceUpdate).toBe("number");
      expect(body.lastModified).toBeTruthy();
      expect(body.lastScannedAt).toBeTruthy();
    });

    it("returns stalenessScore of 100 for freshly updated knowledge", async () => {
      // Seed with today's date and 0 commits
      upsertKnowledge(instance.sqlite, {
        projectSlug: "fresh-project",
        content: "# Fresh\n\nJust updated.",
        contentHash: "fresh-hash",
        fileSize: 25,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 0,
      });

      const res = await app.request("/api/knowledge/fresh-project");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stalenessScore).toBe(100);
    });

    it("returns decreased stalenessScore for old knowledge with many commits", async () => {
      // Seed with date 60 days ago and 30 commits since update
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      upsertKnowledge(instance.sqlite, {
        projectSlug: "stale-project",
        content: "# Stale\n\nOld content.",
        contentHash: "stale-hash",
        fileSize: 22,
        lastModified: sixtyDaysAgo.toISOString(),
        commitsSinceUpdate: 30,
      });

      const res = await app.request("/api/knowledge/stale-project");
      expect(res.status).toBe(200);

      const body = await res.json();
      // 60 days = 33.3% age score (100 - (60/90)*100 = 33.3), weight 0.6 = 20
      // 30 commits = 40% commit score (100 - (30/50)*100 = 40), weight 0.4 = 16
      // Total = ~36
      expect(body.stalenessScore).toBeLessThan(50);
      expect(body.stalenessScore).toBeGreaterThan(0);
    });
  });
});
