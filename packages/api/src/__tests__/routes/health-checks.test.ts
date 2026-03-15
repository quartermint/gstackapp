import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";

describe("Health Checks API", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("GET /api/health-checks (empty state)", () => {
    it("returns 200 with empty findings and total 0", async () => {
      const res = await app.request("/api/health-checks");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.findings).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe("GET /api/health-checks (with data)", () => {
    beforeAll(() => {
      const now = new Date().toISOString();
      const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

      // Seed health findings directly via SQLite
      instance.sqlite
        .prepare(
          `INSERT INTO project_health (project_slug, check_type, severity, detail, detected_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run("project-a", "unpushed_commits", "critical", "3 unpushed commits", now);

      instance.sqlite
        .prepare(
          `INSERT INTO project_health (project_slug, check_type, severity, detail, detected_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run("project-a", "dirty_working_tree", "warning", "5 dirty files", oneHourAgo);

      instance.sqlite
        .prepare(
          `INSERT INTO project_health (project_slug, check_type, severity, detail, detected_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run("project-b", "no_remote", "info", "No remote configured", oneHourAgo);
    });

    it("returns all active findings with isNew boolean", async () => {
      const res = await app.request("/api/health-checks");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.findings).toHaveLength(3);
      expect(body.total).toBe(3);

      // Each finding should have isNew as a boolean
      for (const finding of body.findings) {
        expect(typeof finding.isNew).toBe("boolean");
      }
    });

    it("filters findings by severity query param", async () => {
      const res = await app.request("/api/health-checks?severity=critical");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.findings).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.findings[0].severity).toBe("critical");
      expect(body.findings[0].projectSlug).toBe("project-a");
    });

    it("returns empty array for severity with no matches", async () => {
      // No findings with severity that doesn't exist in seeded data
      const res = await app.request("/api/health-checks?severity=nonexistent");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.findings).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe("GET /api/health-checks/:slug", () => {
    it("returns findings for specific project with riskLevel", async () => {
      const res = await app.request("/api/health-checks/project-a");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.findings).toHaveLength(2);
      expect(body.riskLevel).toBe("critical"); // has a critical finding
      for (const finding of body.findings) {
        expect(finding.projectSlug).toBe("project-a");
        expect(typeof finding.isNew).toBe("boolean");
      }
    });

    it("returns empty findings and healthy riskLevel for project with no findings", async () => {
      const res = await app.request("/api/health-checks/nonexistent-project");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.findings).toEqual([]);
      expect(body.riskLevel).toBe("healthy");
    });
  });
});
