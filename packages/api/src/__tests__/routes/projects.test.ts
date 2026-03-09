import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";
import { projects } from "../../db/schema.js";

describe("Project Routes", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  beforeEach(() => {
    // Clear projects table before each test
    instance.db.delete(projects).run();
  });

  function seedProjects() {
    const now = new Date();
    instance.db
      .insert(projects)
      .values([
        {
          slug: "mission-control",
          name: "Mission Control",
          tagline: "Personal OS",
          path: "/Users/test/mission-control",
          host: "local",
          createdAt: now,
          updatedAt: now,
        },
        {
          slug: "efb-212",
          name: "OpenEFB",
          tagline: "Flight bag",
          path: "/Users/test/efb-212",
          host: "local",
          createdAt: now,
          updatedAt: now,
        },
        {
          slug: "rss-rawdata",
          name: "RSS Rawdata",
          tagline: null,
          path: "/home/user/rss_rawdata",
          host: "mac-mini",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
  }

  describe("GET /api/projects", () => {
    it("returns empty list when no projects exist", async () => {
      const res = await app.request("/api/projects");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.projects).toEqual([]);
    });

    it("returns all seeded projects", async () => {
      seedProjects();
      const res = await app.request("/api/projects");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.projects).toHaveLength(3);
    });

    it("includes lastCommitDate field on each project (null when no scan data)", async () => {
      seedProjects();
      const res = await app.request("/api/projects");
      const body = await res.json();
      for (const project of body.projects) {
        expect(project).toHaveProperty("lastCommitDate");
        // Without scan cache populated, should be null
        expect(project.lastCommitDate).toBeNull();
      }
    });

    it("filters by host query param", async () => {
      seedProjects();
      const res = await app.request("/api/projects?host=mac-mini");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0].slug).toBe("rss-rawdata");
    });
  });

  describe("GET /api/projects/:slug", () => {
    it("returns a single project by slug", async () => {
      seedProjects();
      const res = await app.request("/api/projects/mission-control");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.project.slug).toBe("mission-control");
      expect(body.project.name).toBe("Mission Control");
    });

    it("includes lastCommitDate field on detail response", async () => {
      seedProjects();
      const res = await app.request("/api/projects/mission-control");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.project).toHaveProperty("lastCommitDate");
    });

    it("returns 404 for unknown slug", async () => {
      const res = await app.request("/api/projects/does-not-exist");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/projects/refresh", () => {
    it("returns 202 accepted", async () => {
      const res = await app.request("/api/projects/refresh", {
        method: "POST",
      });
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.message).toContain("Scan initiated");
    });
  });
});
