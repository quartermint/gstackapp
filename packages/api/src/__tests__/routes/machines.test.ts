import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";

describe("Machines API", () => {
  let instance: DatabaseInstance;
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  // ── POST /api/machines ───────────────────────────────────────────

  describe("POST /api/machines", () => {
    it("creates a machine and returns 201", async () => {
      const res = await app.request("/api/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: "test-machine",
          tailnetIp: "100.0.0.1",
          os: "darwin",
          arch: "arm64",
        }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.machine).toBeDefined();
      expect(body.machine.hostname).toBe("test-machine");
      expect(body.machine.tailnetIp).toBe("100.0.0.1");
      expect(body.machine.os).toBe("darwin");
    });

    it("upserts on duplicate hostname", async () => {
      const res = await app.request("/api/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: "test-machine",
          tailnetIp: "100.0.0.2",
          os: "linux",
        }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.machine.tailnetIp).toBe("100.0.0.2");
      expect(body.machine.os).toBe("linux");
    });

    it("returns 400 for empty hostname", async () => {
      const res = await app.request("/api/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: "" }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/machines ────────────────────────────────────────────

  describe("GET /api/machines", () => {
    it("lists all machines", async () => {
      const res = await app.request("/api/machines");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.machines).toBeDefined();
      expect(body.machines.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── GET /api/machines/:id ────────────────────────────────────────

  describe("GET /api/machines/:id", () => {
    it("returns a machine by id", async () => {
      // First get list to find an id
      const listRes = await app.request("/api/machines");
      const { machines } = await listRes.json();
      const id = machines[0].id;

      const res = await app.request(`/api/machines/${id}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.machine.id).toBe(id);
    });

    it("returns 404 for nonexistent id", async () => {
      const res = await app.request("/api/machines/nonexistent");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });
});
