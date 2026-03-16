import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { nanoid } from "nanoid";
import {
  getMergedPortMap,
  detectConflicts,
  autoAllocate,
} from "../../services/port-registry.js";
import { createAllocation } from "../../db/queries/port-allocations.js";
import { ingestScans } from "../../db/queries/port-scans.js";

describe("Port Registry Service", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();

    const now = Date.now() / 1000;

    // Seed machines
    instance.sqlite
      .prepare(
        `INSERT INTO machines (id, hostname, tailnet_ip, os, arch, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("m1", "machine-1", "100.0.0.1", "darwin", "arm64", now, now, now);

    instance.sqlite
      .prepare(
        `INSERT INTO machines (id, hostname, tailnet_ip, os, arch, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("m2", "machine-2", "100.0.0.2", "linux", "amd64", now, now, now);

    // Seed a range
    instance.sqlite
      .prepare(
        `INSERT INTO port_ranges (id, name, start_port, end_port, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(nanoid(), "Test Range", 5000, 5004, "Small test range", now);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  // ── getMergedPortMap ─────────────────────────────────────────────

  describe("getMergedPortMap", () => {
    it("returns empty array with no data", () => {
      const result = getMergedPortMap(instance.db);
      expect(Array.isArray(result)).toBe(true);
    });

    it("shows red for allocated but not scanned", () => {
      createAllocation(instance.db, {
        port: 3000,
        machineId: "m1",
        serviceName: "Web Server",
      });

      const map = getMergedPortMap(instance.db);
      const entry = map.find((e) => e.port === 3000 && e.machineId === "m1");
      expect(entry).toBeDefined();
      expect(entry!.liveStatus).toBe("red");
      expect(entry!.serviceName).toBe("Web Server");
    });

    it("shows green when allocation matches scan", () => {
      ingestScans(instance.db, "m1", [
        { port: 3000, processName: "node", pid: 123 },
      ]);

      const map = getMergedPortMap(instance.db);
      const entry = map.find((e) => e.port === 3000 && e.machineId === "m1");
      expect(entry).toBeDefined();
      expect(entry!.liveStatus).toBe("green");
      expect(entry!.processName).toBe("node");
      expect(entry!.pid).toBe(123);
    });

    it("shows yellow for scanned but not allocated", () => {
      ingestScans(instance.db, "m1", [
        { port: 3000, processName: "node", pid: 123 },
        { port: 4444, processName: "rogue", pid: 999 },
      ]);

      const map = getMergedPortMap(instance.db);
      const entry = map.find((e) => e.port === 4444 && e.machineId === "m1");
      expect(entry).toBeDefined();
      expect(entry!.liveStatus).toBe("yellow");
    });
  });

  // ── detectConflicts ──────────────────────────────────────────────

  describe("detectConflicts", () => {
    it("detects unregistered processes", () => {
      const conflicts = detectConflicts(instance.db);
      const unregistered = conflicts.filter((c) => c.type === "unregistered");
      expect(unregistered.length).toBeGreaterThan(0);
    });

    it("detects down services", () => {
      createAllocation(instance.db, {
        port: 8888,
        machineId: "m2",
        serviceName: "Down Service",
      });

      const conflicts = detectConflicts(instance.db);
      const down = conflicts.filter(
        (c) => c.type === "down" && c.port === 8888
      );
      expect(down.length).toBe(1);
      expect(down[0]!.machineHostname).toBe("machine-2");
    });
  });

  // ── autoAllocate ─────────────────────────────────────────────────

  describe("autoAllocate", () => {
    it("allocates the first port in range", () => {
      const alloc = autoAllocate(
        instance.db,
        "m2",
        "Test Range",
        "New Service"
      );
      expect(alloc.port).toBe(5000);
      expect(alloc.serviceName).toBe("New Service");
    });

    it("skips already allocated ports", () => {
      const alloc = autoAllocate(
        instance.db,
        "m2",
        "Test Range",
        "Second Service"
      );
      expect(alloc.port).toBe(5001);
    });

    it("throws when range is full", () => {
      // Fill remaining ports (5002, 5003, 5004)
      for (const name of ["S3", "S4", "S5"]) {
        autoAllocate(instance.db, "m2", "Test Range", name);
      }

      expect(() =>
        autoAllocate(instance.db, "m2", "Test Range", "Overflow")
      ).toThrow("No available ports");
    });

    it("throws for unknown range", () => {
      expect(() =>
        autoAllocate(instance.db, "m1", "Nonexistent", "Fail")
      ).toThrow("not found");
    });
  });
});
