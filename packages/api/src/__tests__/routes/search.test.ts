import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";
import {
  searchUnified,
  indexCapture,
  indexProject,
  indexCommit,
  deindexCapture,
} from "../../db/queries/search.js";

describe("Search API", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(async () => {
    instance = createTestDb();
    app = createTestApp(instance);

    // Seed captures via API (triggers indexCapture)
    await app.request("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawContent: "Working on the flight bag application for VFR navigation",
      }),
    });
    await app.request("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawContent: "Tax organization tool needs a better document scanner",
      }),
    });
    await app.request("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawContent: "Mission control dashboard should show project health",
      }),
    });

    // Seed commits directly into search_index
    indexCommit(instance.sqlite, {
      id: "commit-1",
      message: "feat: add flight tracking to the dashboard",
      projectSlug: "efb-212",
      authorDate: "2026-03-01T10:00:00Z",
    });
    indexCommit(instance.sqlite, {
      id: "commit-2",
      message: "fix: resolve tax calculation rounding error",
      projectSlug: "taxnav",
      authorDate: "2026-03-02T10:00:00Z",
    });

    // Seed project into search_index
    indexProject(instance.sqlite, {
      slug: "efb-212",
      name: "OpenEFB",
      tagline: "Open-source iPad VFR Electronic Flight Bag",
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("GET /api/search", () => {
    it("returns results matching query terms", async () => {
      const res = await app.request("/api/search?q=flight");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results).toBeDefined();
      expect(body.results.length).toBeGreaterThan(0);
      expect(body.query).toBe("flight");
    });

    it("returns BM25-ranked results", async () => {
      const res = await app.request("/api/search?q=project");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results.length).toBeGreaterThan(0);
      // BM25 rank should be a number (negative by default in SQLite FTS5)
      for (const result of body.results) {
        expect(typeof result.rank).toBe("number");
      }
    });

    it("returns 400 without q parameter", async () => {
      const res = await app.request("/api/search");
      expect(res.status).toBe(400);
    });

    it("returns empty array for unmatched query", async () => {
      const res = await app.request("/api/search?q=xyznonexistent");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results).toEqual([]);
    });

    it("respects limit parameter", async () => {
      const res = await app.request("/api/search?q=the&limit=1");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results.length).toBeLessThanOrEqual(1);
    });

    it("finds captures by content keywords with sourceType and snippet", async () => {
      const res = await app.request("/api/search?q=dashboard");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results.length).toBeGreaterThanOrEqual(1);
      expect(body.results[0].content).toContain("dashboard");
      expect(body.results[0].sourceType).toBe("capture");
      // New fields from enhanced response
      expect(body.results[0].snippet).toBeDefined();
      expect(typeof body.results[0].snippet).toBe("string");
      expect(body.results[0].sourceId).toBeDefined();
      expect(body.results[0].id).toBeDefined();
    });

    it("returns rewrittenQuery as null for keyword searches (no AI)", async () => {
      const res = await app.request("/api/search?q=flight");
      expect(res.status).toBe(200);

      const body = await res.json();
      // AI not available in tests, so keyword queries should not be rewritten
      expect(body.rewrittenQuery).toBeNull();
    });

    it("returns filters as null for keyword searches", async () => {
      const res = await app.request("/api/search?q=dashboard");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.filters).toBeNull();
    });

    it("response shape includes all expected top-level fields", async () => {
      const res = await app.request("/api/search?q=flight");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("results");
      expect(body).toHaveProperty("query");
      expect(body).toHaveProperty("rewrittenQuery");
      expect(body).toHaveProperty("filters");
    });
  });

  describe("searchUnified", () => {
    it("returns captures matching query with source_type capture", () => {
      const results = searchUnified(instance.sqlite, "scanner");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.sourceType).toBe("capture");
    });

    it("returns commits matching query with source_type commit", () => {
      const results = searchUnified(instance.sqlite, "rounding");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.sourceType).toBe("commit");
    });

    it("returns projects matching query with source_type project", () => {
      const results = searchUnified(instance.sqlite, "OpenEFB");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.sourceType).toBe("project");
    });

    it("returns mixed results ranked by BM25 in a single query", () => {
      // "flight" appears in captures, commits, and projects
      const results = searchUnified(instance.sqlite, "flight");
      expect(results.length).toBeGreaterThanOrEqual(3);

      const types = new Set(results.map((r) => r.sourceType));
      expect(types.size).toBeGreaterThanOrEqual(2);

      // All should have numeric rank
      for (const r of results) {
        expect(typeof r.rank).toBe("number");
      }
    });

    it("respects source_type filter parameter", () => {
      const results = searchUnified(instance.sqlite, "flight", {
        sourceType: "commit",
      });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.sourceType).toBe("commit");
      }
    });

    it("respects project_slug filter parameter", () => {
      const results = searchUnified(instance.sqlite, "flight", {
        projectSlug: "efb-212",
      });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.projectSlug).toBe("efb-212");
      }
    });

    it("returns snippet with match highlighting", () => {
      const results = searchUnified(instance.sqlite, "dashboard");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.snippet).toBeDefined();
      expect(typeof results[0]!.snippet).toBe("string");
      // snippet should contain the match context
      expect(results[0]!.snippet.length).toBeGreaterThan(0);
    });
  });

  describe("indexCapture / deindexCapture", () => {
    it("indexCapture adds a capture to search_index and it becomes findable", () => {
      indexCapture(instance.sqlite, {
        id: "test-capture-idx",
        rawContent: "Unique unicorn rainbow test content",
        projectId: null,
        createdAt: "2026-03-05T10:00:00Z",
      });

      const results = searchUnified(instance.sqlite, "unicorn");
      expect(results.length).toBe(1);
      expect(results[0]!.sourceId).toBe("test-capture-idx");
      expect(results[0]!.sourceType).toBe("capture");
    });

    it("deindexCapture removes a capture from search_index", () => {
      deindexCapture(instance.sqlite, "test-capture-idx");

      const results = searchUnified(instance.sqlite, "unicorn");
      expect(results.length).toBe(0);
    });
  });
});
