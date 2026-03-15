import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";
import { computeSegments } from "../../routes/sprint-timeline.js";
import type { HeatmapEntry } from "../../db/queries/commits.js";

describe("Sprint Timeline", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  /**
   * Helper to seed commits at specific day offsets from now.
   * daysAgo=1 means yesterday, etc.
   */
  function seedCommit(
    id: string,
    hash: string,
    slug: string,
    daysAgo: number
  ) {
    const date = new Date(
      Date.now() - daysAgo * 24 * 60 * 60 * 1000
    ).toISOString();
    instance.sqlite
      .prepare(
        `INSERT INTO commits (id, hash, message, project_slug, author_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, hash, `msg-${id}`, slug, date, Math.floor(Date.now() / 1000));
  }

  describe("computeSegments (unit tests)", () => {
    it("returns empty array for empty input", () => {
      const result = computeSegments([]);
      expect(result).toEqual([]);
    });

    it("returns a single segment for consecutive days", () => {
      const entries: HeatmapEntry[] = [
        { projectSlug: "p", date: "2026-03-10", count: 2 },
        { projectSlug: "p", date: "2026-03-11", count: 3 },
        { projectSlug: "p", date: "2026-03-12", count: 1 },
      ];
      const result = computeSegments(entries);
      expect(result).toHaveLength(1);
      expect(result[0]!.startDate).toBe("2026-03-10");
      expect(result[0]!.endDate).toBe("2026-03-12");
      expect(result[0]!.commits).toBe(6);
    });

    it("splits segments at gaps of >3 days", () => {
      const entries: HeatmapEntry[] = [
        { projectSlug: "p", date: "2026-03-01", count: 3 },
        { projectSlug: "p", date: "2026-03-02", count: 2 },
        // gap of 5 days (03-03 through 03-07)
        { projectSlug: "p", date: "2026-03-08", count: 1 },
      ];
      const result = computeSegments(entries);
      expect(result).toHaveLength(2);
      expect(result[0]!.startDate).toBe("2026-03-01");
      expect(result[0]!.endDate).toBe("2026-03-02");
      expect(result[0]!.commits).toBe(5);
      expect(result[1]!.startDate).toBe("2026-03-08");
      expect(result[1]!.endDate).toBe("2026-03-08");
      expect(result[1]!.commits).toBe(1);
    });

    it("does NOT split at gaps of exactly 3 days", () => {
      const entries: HeatmapEntry[] = [
        { projectSlug: "p", date: "2026-03-01", count: 1 },
        // gap of 3 days (03-02, 03-03, 03-04)
        { projectSlug: "p", date: "2026-03-04", count: 1 },
      ];
      const result = computeSegments(entries);
      expect(result).toHaveLength(1);
    });

    it("computes density between 0.0 and 1.0", () => {
      const entries: HeatmapEntry[] = [
        { projectSlug: "p", date: "2026-03-01", count: 5 },
        { projectSlug: "p", date: "2026-03-02", count: 3 },
      ];
      const result = computeSegments(entries);
      expect(result).toHaveLength(1);
      expect(result[0]!.density).toBeGreaterThan(0);
      expect(result[0]!.density).toBeLessThanOrEqual(1);
      // density = 8 / (5 * 2) = 0.8
      expect(result[0]!.density).toBeCloseTo(0.8);
    });

    it("handles single day entry", () => {
      const entries: HeatmapEntry[] = [
        { projectSlug: "p", date: "2026-03-05", count: 4 },
      ];
      const result = computeSegments(entries);
      expect(result).toHaveLength(1);
      expect(result[0]!.startDate).toBe("2026-03-05");
      expect(result[0]!.endDate).toBe("2026-03-05");
      expect(result[0]!.commits).toBe(4);
      // density = 4 / (4 * 1) = 1.0
      expect(result[0]!.density).toBeCloseTo(1.0);
    });

    it("handles all commits on the same day", () => {
      const entries: HeatmapEntry[] = [
        { projectSlug: "p", date: "2026-03-05", count: 10 },
      ];
      const result = computeSegments(entries);
      expect(result).toHaveLength(1);
      expect(result[0]!.density).toBeCloseTo(1.0);
    });

    it("accepts custom gapDays parameter", () => {
      const entries: HeatmapEntry[] = [
        { projectSlug: "p", date: "2026-03-01", count: 1 },
        // 2-day gap
        { projectSlug: "p", date: "2026-03-03", count: 1 },
      ];
      // With gapDays=1, a 2-day gap should split
      const result = computeSegments(entries, 1);
      expect(result).toHaveLength(2);
    });
  });

  describe("GET /api/sprint-timeline", () => {
    it("returns empty state with no commits", async () => {
      const res = await app.request("/api/sprint-timeline");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.projects).toEqual([]);
      expect(body.focusedProject).toBeNull();
      expect(body.windowDays).toBe(84); // 12 * 7
    });

    describe("with seeded commits", () => {
      beforeAll(() => {
        // project-a: 3 commits on day-1, 2 commits on day-2, gap of 5 days, 1 commit on day-8
        // Should produce 2 segments (gap > 3 days)
        seedCommit("st-1", "aaa111", "project-a", 1);
        seedCommit("st-2", "aaa112", "project-a", 1);
        seedCommit("st-3", "aaa113", "project-a", 1);
        seedCommit("st-4", "aaa221", "project-a", 2);
        seedCommit("st-5", "aaa222", "project-a", 2);
        seedCommit("st-6", "aaa881", "project-a", 8);

        // project-b: 1 commit on day-3 (1 segment)
        seedCommit("st-7", "bbb331", "project-b", 3);
      });

      it("returns project entries with segments", async () => {
        const res = await app.request("/api/sprint-timeline");
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.projects.length).toBeGreaterThanOrEqual(2);

        const projectA = body.projects.find(
          (p: { slug: string }) => p.slug === "project-a"
        );
        expect(projectA).toBeDefined();
        expect(projectA.totalCommits).toBe(6);

        const projectB = body.projects.find(
          (p: { slug: string }) => p.slug === "project-b"
        );
        expect(projectB).toBeDefined();
        expect(projectB.totalCommits).toBe(1);
        expect(projectB.segments).toHaveLength(1);
      });

      it("detects gaps and splits into segments", async () => {
        const res = await app.request("/api/sprint-timeline");
        const body = await res.json();

        const projectA = body.projects.find(
          (p: { slug: string }) => p.slug === "project-a"
        );
        // day-1 + day-2 = segment 1, day-8 = segment 2 (gap of 5 days)
        expect(projectA.segments).toHaveLength(2);
      });

      it("computes density between 0.0 and 1.0 for each segment", async () => {
        const res = await app.request("/api/sprint-timeline");
        const body = await res.json();

        for (const project of body.projects) {
          for (const segment of project.segments) {
            expect(segment.density).toBeGreaterThanOrEqual(0);
            expect(segment.density).toBeLessThanOrEqual(1);
          }
        }
      });

      it("identifies focusedProject as most active in last 7 days", async () => {
        const res = await app.request("/api/sprint-timeline");
        const body = await res.json();

        // project-a has 5 commits within last 7 days (day-1 and day-2)
        // project-b has 1 commit at day-3 (within 7 days)
        expect(body.focusedProject).toBe("project-a");
      });

      it("respects weeks query parameter", async () => {
        const res = await app.request("/api/sprint-timeline?weeks=4");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.windowDays).toBe(28); // 4 * 7
      });
    });
  });
});
