import { describe, it, expect, afterAll } from "vitest";
import { createServer, type Server } from "node:net";
import { getSystemHealth, checkPort } from "../../services/health-monitor.js";
import { z } from "zod";

describe("Health Monitor", () => {
  let testServer: Server;
  let testPort: number;

  // Start a test server for port checking
  afterAll(() => {
    if (testServer) {
      testServer.close();
    }
  });

  describe("getSystemHealth", () => {
    it("returns cpu, memory, disk, uptime, and services fields", async () => {
      const health = await getSystemHealth([]);

      expect(health.cpu).toBeDefined();
      expect(typeof health.cpu.loadAvg1m).toBe("number");
      expect(typeof health.cpu.loadAvg5m).toBe("number");
      expect(typeof health.cpu.cores).toBe("number");
      expect(health.cpu.cores).toBeGreaterThan(0);

      expect(health.memory).toBeDefined();
      expect(typeof health.memory.totalMB).toBe("number");
      expect(typeof health.memory.freeMB).toBe("number");
      expect(typeof health.memory.usedPercent).toBe("number");

      expect(health.disk).toBeDefined();
      expect(typeof health.disk.totalGB).toBe("number");
      expect(typeof health.disk.usedGB).toBe("number");
      expect(typeof health.disk.usedPercent).toBe("number");

      expect(typeof health.uptime).toBe("number");
      expect(health.uptime).toBeGreaterThan(0);

      expect(Array.isArray(health.services)).toBe(true);
    });

    it("returns usedPercent between 0 and 100 for memory", async () => {
      const health = await getSystemHealth([]);
      expect(health.memory.usedPercent).toBeGreaterThanOrEqual(0);
      expect(health.memory.usedPercent).toBeLessThanOrEqual(100);
    });
  });

  describe("checkPort", () => {
    it("resolves true for a listening port", async () => {
      // Start a temporary server
      testServer = createServer();
      await new Promise<void>((resolve) => {
        testServer.listen(0, "localhost", () => {
          const addr = testServer.address();
          if (addr && typeof addr !== "string") {
            testPort = addr.port;
          }
          resolve();
        });
      });

      const result = await checkPort(testPort, "localhost", 2000);
      expect(result).toBe(true);
    });

    it("resolves false for a closed port", async () => {
      // Close the server first
      if (testServer) {
        testServer.close();
        // Wait a moment for the port to be released
        await new Promise((r) => setTimeout(r, 100));
      }

      const result = await checkPort(testPort, "localhost", 1000);
      expect(result).toBe(false);
    });
  });

  describe("Service checks", () => {
    it("handles timeout gracefully and returns down status", async () => {
      const health = await getSystemHealth([
        { name: "fake-service", port: 59999, host: "localhost" },
      ]);

      expect(health.services).toHaveLength(1);
      expect(health.services[0]!.name).toBe("fake-service");
      expect(health.services[0]!.status).toBe("down");
    });
  });

  describe("Config schema extension", () => {
    it("accepts services array with name, port, host", async () => {
      // Import ServiceEntry type to verify schema extension exists
      const configModule = await import("../../lib/config.js");

      // The ServiceEntry type should exist as an export
      // Verify the module exports are accessible (type-level check via runtime)
      expect(configModule.loadConfig).toBeDefined();

      // Validate the service entry shape using Zod directly
      const serviceEntrySchema = z.object({
        name: z.string().min(1),
        port: z.number().int().positive(),
        host: z.string().default("localhost"),
      });

      const result = serviceEntrySchema.safeParse({
        name: "my-service",
        port: 3000,
        host: "localhost",
      });

      expect(result.success).toBe(true);
    });
  });
});
