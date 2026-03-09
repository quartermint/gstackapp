import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";

describe("Search API", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(async () => {
    instance = createTestDb();
    app = createTestApp(instance);

    // Seed test data for search
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

    it("FTS5 search finds captures by content keywords", async () => {
      const res = await app.request("/api/search?q=dashboard");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results.length).toBe(1);
      expect(body.results[0].rawContent).toContain("dashboard");
    });
  });
});
