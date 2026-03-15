import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";

describe("Risks API", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  describe("GET /api/risks (empty state)", () => {
    beforeAll(() => {
      instance = createTestDb();
      app = createTestApp(instance);
    });

    afterAll(() => {
      instance.sqlite.close();
    });

    it("returns 200 with empty groups and riskCount 0", async () => {
      const res = await app.request("/api/risks");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.critical).toEqual([]);
      expect(body.warning).toEqual([]);
      expect(body.riskCount).toBe(0);
      expect(typeof body.summary).toBe("string");
    });
  });

  describe("GET /api/risks (with findings)", () => {
    beforeAll(() => {
      instance = createTestDb();
      app = createTestApp(instance);

      const now = new Date().toISOString();

      // Seed 2 critical and 1 warning and 1 info finding
      instance.sqlite
        .prepare(
          `INSERT INTO project_health (project_slug, check_type, severity, detail, detected_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run("proj-a", "unpushed_commits", "critical", "5 unpushed", now);

      instance.sqlite
        .prepare(
          `INSERT INTO project_health (project_slug, check_type, severity, detail, detected_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run("proj-b", "no_remote", "critical", "No remote", now);

      instance.sqlite
        .prepare(
          `INSERT INTO project_health (project_slug, check_type, severity, detail, detected_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run("proj-c", "dirty_working_tree", "warning", "3 dirty files", now);

      instance.sqlite
        .prepare(
          `INSERT INTO project_health (project_slug, check_type, severity, detail, detected_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run("proj-d", "broken_tracking", "info", "Tracking broken", now);
    });

    afterAll(() => {
      instance.sqlite.close();
    });

    it("groups findings by severity and returns correct riskCount (RISK-04)", async () => {
      const res = await app.request("/api/risks");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.critical).toHaveLength(2);
      expect(body.warning).toHaveLength(1);
      // riskCount = critical + warning (info excluded)
      expect(body.riskCount).toBe(3);
    });

    it("includes correct summary string", async () => {
      const res = await app.request("/api/risks");
      const body = await res.json();
      expect(body.summary).toBe("2 critical, 1 warning");
    });

    it("includes isNew boolean on each finding", async () => {
      const res = await app.request("/api/risks");
      const body = await res.json();

      for (const finding of [...body.critical, ...body.warning]) {
        expect(typeof finding.isNew).toBe("boolean");
      }
    });
  });
});
