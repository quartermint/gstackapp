import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";
import { getHeatmapData } from "../../db/queries/commits.js";

describe("Heatmap", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);

    // Insert test commits with known dates using raw sqlite
    const now = new Date();
    const stmt = instance.sqlite.prepare(`
      INSERT INTO commits (id, hash, message, project_slug, author_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Commits within the 12-week window
    const recentDate1 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const recentDate2 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
    const recentDate3 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // same day as recentDate1

    stmt.run("hm-1", "aaa111", "feat: first", "project-a", recentDate1, Math.floor(now.getTime() / 1000));
    stmt.run("hm-2", "aaa222", "fix: second", "project-a", recentDate1, Math.floor(now.getTime() / 1000));
    stmt.run("hm-3", "bbb111", "feat: third", "project-b", recentDate2, Math.floor(now.getTime() / 1000));
    stmt.run("hm-4", "aaa333", "chore: fourth", "project-a", recentDate3, Math.floor(now.getTime() / 1000));

    // Commit older than 12 weeks (should be excluded)
    const oldDate = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago
    stmt.run("hm-5", "ccc111", "old: commit", "project-c", oldDate, Math.floor(now.getTime() / 1000));
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("getHeatmapData", () => {
    it("returns empty array when no commits match the window", () => {
      // Use a 0-week window so nothing matches
      const result = getHeatmapData(instance.db, 0);
      expect(result).toEqual([]);
    });

    it("returns aggregated counts per project per day within 12-week window", () => {
      const result = getHeatmapData(instance.db);

      // project-a should have entries (3 commits across potentially 2 days, but recentDate1 and recentDate3 are same day)
      const projectAEntries = result.filter((r) => r.projectSlug === "project-a");
      expect(projectAEntries.length).toBeGreaterThan(0);

      // project-a day with 3 commits should have count 3
      const day3Commits = projectAEntries.find((e) => e.count === 3);
      expect(day3Commits).toBeDefined();
    });

    it("excludes commits older than the cutoff date", () => {
      const result = getHeatmapData(instance.db, 12);

      // project-c only has a 100-day-old commit, should not appear
      const projectCEntries = result.filter((r) => r.projectSlug === "project-c");
      expect(projectCEntries).toHaveLength(0);
    });
  });

  describe("GET /api/heatmap", () => {
    it("returns structured JSON with heatmap array", async () => {
      const res = await app.request("/api/heatmap");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.heatmap).toBeDefined();
      expect(Array.isArray(body.heatmap)).toBe(true);
    });

    it("accepts optional weeks query parameter", async () => {
      const res = await app.request("/api/heatmap?weeks=4");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.heatmap).toBeDefined();
    });
  });
});
