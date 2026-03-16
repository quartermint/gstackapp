import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { nanoid } from "nanoid";

describe("Ports API", () => {
  let instance: DatabaseInstance;
  let app: ReturnType<typeof createTestApp>;
  let machineId: string;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);

    // Seed a machine for tests
    const now = new Date();
    machineId = "test-machine";
    instance.sqlite
      .prepare(
        `INSERT INTO machines (id, hostname, tailnet_ip, os, arch, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        machineId,
        "test-host",
        "100.0.0.1",
        "darwin",
        "arm64",
        Math.floor(now.getTime() / 1000),
        Math.floor(now.getTime() / 1000),
        Math.floor(now.getTime() / 1000)
      );
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  // ── POST /api/ports ──────────────────────────────────────────────

  describe("POST /api/ports", () => {
    it("creates an allocation and returns 201", async () => {
      const res = await app.request("/api/ports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: 3000,
          machineId,
          serviceName: "Test API",
          projectSlug: "test-project",
        }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.allocation).toBeDefined();
      expect(body.allocation.port).toBe(3000);
      expect(body.allocation.serviceName).toBe("Test API");
      expect(body.allocation.protocol).toBe("tcp");
      expect(body.allocation.status).toBe("active");
    });

    it("returns 400 for duplicate port/machine/protocol", async () => {
      const res = await app.request("/api/ports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: 3000,
          machineId,
          serviceName: "Duplicate",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("allows same port on different machine", async () => {
      // Create another machine
      const otherId = "other-machine";
      instance.sqlite
        .prepare(
          `INSERT INTO machines (id, hostname, created_at, updated_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(otherId, "other-host", Date.now() / 1000, Date.now() / 1000);

      const res = await app.request("/api/ports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: 3000,
          machineId: otherId,
          serviceName: "Other API",
        }),
      });
      expect(res.status).toBe(201);
    });

    it("returns 400 for invalid port number", async () => {
      const res = await app.request("/api/ports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: 70000,
          machineId,
          serviceName: "Invalid",
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/ports ───────────────────────────────────────────────

  describe("GET /api/ports", () => {
    it("lists all allocations", async () => {
      const res = await app.request("/api/ports");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.allocations).toBeDefined();
      expect(body.total).toBeGreaterThanOrEqual(1);
    });

    it("filters by machineId", async () => {
      const res = await app.request(`/api/ports?machineId=${machineId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const alloc of body.allocations) {
        expect(alloc.machineId).toBe(machineId);
      }
    });
  });

  // ── GET /api/ports/:id ───────────────────────────────────────────

  describe("GET /api/ports/:id", () => {
    it("returns 404 for nonexistent id", async () => {
      const res = await app.request("/api/ports/nonexistent");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  // ── PATCH /api/ports/:id ─────────────────────────────────────────

  describe("PATCH /api/ports/:id", () => {
    it("updates an allocation", async () => {
      // First create one
      const createRes = await app.request("/api/ports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: 8080,
          machineId,
          serviceName: "Before Update",
        }),
      });
      const { allocation } = await createRes.json();

      const res = await app.request(`/api/ports/${allocation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceName: "After Update" }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.allocation.serviceName).toBe("After Update");
    });
  });

  // ── DELETE /api/ports/:id ────────────────────────────────────────

  describe("DELETE /api/ports/:id", () => {
    it("deletes an allocation", async () => {
      const createRes = await app.request("/api/ports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: 9999,
          machineId,
          serviceName: "To Delete",
        }),
      });
      const { allocation } = await createRes.json();

      const res = await app.request(`/api/ports/${allocation.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(204);

      // Verify gone
      const getRes = await app.request(`/api/ports/${allocation.id}`);
      expect(getRes.status).toBe(404);
    });
  });

  // ── GET /api/ports/map ───────────────────────────────────────────

  describe("GET /api/ports/map", () => {
    it("returns merged port map", async () => {
      const res = await app.request("/api/ports/map");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.portMap).toBeDefined();
      expect(Array.isArray(body.portMap)).toBe(true);
    });

    it("shows red status for allocated-but-not-scanned ports", async () => {
      const res = await app.request("/api/ports/map");
      const body = await res.json();

      // Our test allocations have no scans, so they should be red
      const redEntries = body.portMap.filter(
        (e: { liveStatus: string }) => e.liveStatus === "red"
      );
      expect(redEntries.length).toBeGreaterThan(0);
    });
  });

  // ── GET /api/ports/conflicts ─────────────────────────────────────

  describe("GET /api/ports/conflicts", () => {
    it("returns conflicts array", async () => {
      const res = await app.request("/api/ports/conflicts");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.conflicts).toBeDefined();
      expect(Array.isArray(body.conflicts)).toBe(true);
    });
  });

  // ── POST /api/ports/scan ─────────────────────────────────────────

  describe("POST /api/ports/scan", () => {
    it("accepts scan data and returns 202", async () => {
      const res = await app.request("/api/ports/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          scans: [
            { port: 3000, processName: "node", pid: 1234 },
            { port: 8080, processName: "python", pid: 5678 },
          ],
        }),
      });
      expect(res.status).toBe(202);

      const body = await res.json();
      expect(body.ingested).toBe(2);
    });

    it("after scan, port map shows green for matching allocations", async () => {
      const res = await app.request("/api/ports/map");
      const body = await res.json();

      const port3000 = body.portMap.find(
        (e: { port: number; machineId: string }) =>
          e.port === 3000 && e.machineId === machineId
      );
      expect(port3000).toBeDefined();
      expect(port3000.liveStatus).toBe("green");
    });

    it("scan with empty array clears previous scans", async () => {
      const res = await app.request("/api/ports/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          scans: [],
        }),
      });
      expect(res.status).toBe(202);

      const body = await res.json();
      expect(body.ingested).toBe(0);
    });
  });

  // ── POST /api/ports/allocate ─────────────────────────────────────

  describe("POST /api/ports/allocate", () => {
    beforeAll(() => {
      // Seed a range
      instance.sqlite
        .prepare(
          `INSERT INTO port_ranges (id, name, start_port, end_port, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(nanoid(), "Test Range", 9000, 9009, "Test range", Date.now() / 1000);
    });

    it("auto-allocates the next available port", async () => {
      const res = await app.request("/api/ports/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          rangeName: "Test Range",
          serviceName: "Auto Service",
        }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.allocation.port).toBe(9000);
      expect(body.allocation.serviceName).toBe("Auto Service");
    });

    it("allocates the next port after existing", async () => {
      const res = await app.request("/api/ports/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          rangeName: "Test Range",
          serviceName: "Auto Service 2",
        }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.allocation.port).toBe(9001);
    });

    it("returns 404 for unknown range", async () => {
      const res = await app.request("/api/ports/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          rangeName: "Nonexistent Range",
          serviceName: "Fail",
        }),
      });
      expect(res.status).toBe(404);
    });
  });
});
