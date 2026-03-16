import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";

describe("GET /api/sessions/conflicts", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("empty state", () => {
    it("returns 200 with empty conflicts array and total 0", async () => {
      const res = await app.request("/api/sessions/conflicts");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.conflicts).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe("with conflict findings", () => {
    beforeAll(() => {
      const now = new Date().toISOString();

      // Seed a session_file_conflict finding
      instance.sqlite
        .prepare(
          `INSERT INTO project_health (project_slug, check_type, severity, detail, metadata, detected_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          "mission-control",
          "session_file_conflict",
          "warning",
          "2 files edited in parallel",
          JSON.stringify({
            sessionA: "session-abc-123",
            sessionB: "session-def-456",
            files: ["src/app.ts", "src/index.ts"],
          }),
          now
        );

      // Seed a non-conflict finding (should NOT appear in results)
      instance.sqlite
        .prepare(
          `INSERT INTO project_health (project_slug, check_type, severity, detail, detected_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run("mission-control", "unpushed_commits", "critical", "3 unpushed commits", now);
    });

    it("returns formatted conflicts from session_file_conflict findings", async () => {
      const res = await app.request("/api/sessions/conflicts");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.conflicts).toHaveLength(1);
      expect(body.total).toBe(1);

      const conflict = body.conflicts[0];
      expect(conflict.projectSlug).toBe("mission-control");
      expect(conflict.sessionA).toBe("session-abc-123");
      expect(conflict.sessionB).toBe("session-def-456");
      expect(conflict.files).toEqual(["src/app.ts", "src/index.ts"]);
      expect(conflict.severity).toBe("warning");
      expect(conflict.detectedAt).toBeDefined();
    });

    it("does not include non-conflict findings", async () => {
      const res = await app.request("/api/sessions/conflicts");
      const body = await res.json();

      // Only session_file_conflict findings should be included
      for (const conflict of body.conflicts) {
        expect(conflict.projectSlug).toBeDefined();
        expect(conflict.sessionA).toBeDefined();
        expect(conflict.sessionB).toBeDefined();
        expect(conflict.files).toBeDefined();
      }
      // unpushed_commits should not appear
      expect(body.total).toBe(1);
    });
  });
});
