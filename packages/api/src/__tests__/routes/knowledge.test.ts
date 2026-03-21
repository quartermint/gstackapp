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

  describe("GET /api/knowledge/search", () => {
    beforeAll(() => {
      // Seed additional knowledge for search tests
      upsertKnowledge(instance.sqlite, {
        projectSlug: "search-project-alpha",
        content:
          "# Alpha Project\n\nThis is the Alpha project for Mission Control integration testing.",
        contentHash: "search-hash-alpha",
        fileSize: 75,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 2,
      });

      upsertKnowledge(instance.sqlite, {
        projectSlug: "search-project-beta",
        content:
          "# Beta Project\n\nBeta handles flight planning and navigation features.",
        contentHash: "search-hash-beta",
        fileSize: 68,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 10,
      });
    });

    it("returns results matching query with snippet", async () => {
      const res = await app.request("/api/knowledge/search?q=Mission");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results.length).toBeGreaterThan(0);
      expect(body.total).toBeGreaterThan(0);

      // mission-control was seeded earlier, should match
      const mcResult = body.results.find(
        (r: { projectSlug: string }) =>
          r.projectSlug === "mission-control" ||
          r.projectSlug === "search-project-alpha"
      );
      expect(mcResult).toBeTruthy();
      expect(mcResult.snippet).toBeTruthy();
    });

    it("returns empty results when q param is missing", async () => {
      const res = await app.request("/api/knowledge/search");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns empty results when q is too short (1 char)", async () => {
      const res = await app.request("/api/knowledge/search?q=x");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns empty results for nonexistent query", async () => {
      const res = await app.request(
        "/api/knowledge/search?q=zzzznonexistentzzzz"
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("search is case-insensitive", async () => {
      const resLower = await app.request("/api/knowledge/search?q=mission");
      const resUpper = await app.request("/api/knowledge/search?q=MISSION");

      const bodyLower = await resLower.json();
      const bodyUpper = await resUpper.json();

      expect(bodyLower.results.length).toBe(bodyUpper.results.length);
      expect(bodyLower.results.length).toBeGreaterThan(0);
    });

    it("each result contains projectSlug, snippet, fileSize, stalenessScore", async () => {
      const res = await app.request("/api/knowledge/search?q=Alpha");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results.length).toBeGreaterThan(0);

      const result = body.results[0];
      expect(result.projectSlug).toBeTruthy();
      expect(typeof result.snippet).toBe("string");
      expect(typeof result.fileSize).toBe("number");
      expect(typeof result.stalenessScore).toBe("number");
    });
  });
});
