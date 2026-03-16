import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";
import { upsertDiscovery } from "../../db/queries/discoveries.js";

describe("discovery routes", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("GET /api/discoveries", () => {
    it("returns empty array when no discoveries exist", async () => {
      const res = await app.request("/api/discoveries");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.discoveries).toEqual([]);
    });

    it("returns discoveries after insert", async () => {
      upsertDiscovery(instance.db, {
        path: "/Users/test/route-test-project",
        host: "local",
        remoteUrl: "https://github.com/test/route-test-project.git",
        name: "route-test-project",
        lastCommitAt: new Date("2026-03-15T10:00:00Z"),
      });

      const res = await app.request("/api/discoveries");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.discoveries.length).toBeGreaterThan(0);

      const discovery = body.discoveries.find(
        (d: Record<string, unknown>) => d.name === "route-test-project"
      );
      expect(discovery).toBeDefined();
      expect(discovery.path).toBe("/Users/test/route-test-project");
      expect(discovery.host).toBe("local");
      expect(discovery.status).toBe("found");
      // Verify timestamp serialization (should be ISO strings, not Date objects)
      expect(typeof discovery.discoveredAt).toBe("string");
      expect(typeof discovery.updatedAt).toBe("string");
    });

    it("filters by status query param", async () => {
      const res = await app.request("/api/discoveries?status=found");
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const d of body.discoveries) {
        expect(d.status).toBe("found");
      }
    });

    it("filters by host query param", async () => {
      const res = await app.request("/api/discoveries?host=local");
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const d of body.discoveries) {
        expect(d.host).toBe("local");
      }
    });

    it("returns empty for non-matching status filter", async () => {
      const res = await app.request("/api/discoveries?status=tracked");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.discoveries).toEqual([]);
    });
  });

  describe("PATCH /api/discoveries/:id", () => {
    it("dismisses a discovery", async () => {
      // Insert a fresh discovery to dismiss
      upsertDiscovery(instance.db, {
        path: "/Users/test/dismiss-route-test",
        host: "local",
        remoteUrl: null,
        name: "dismiss-route-test",
        lastCommitAt: null,
      });

      // Get the id
      const listRes = await app.request(
        "/api/discoveries?status=found"
      );
      const listBody = await listRes.json();
      const discovery = listBody.discoveries.find(
        (d: Record<string, unknown>) => d.name === "dismiss-route-test"
      );
      expect(discovery).toBeDefined();
      const id = discovery.id;

      // Dismiss it
      const res = await app.request(`/api/discoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe("Discovery dismissed");

      // Verify it's now dismissed
      const verifyRes = await app.request(
        "/api/discoveries?status=dismissed"
      );
      const verifyBody = await verifyRes.json();
      const dismissed = verifyBody.discoveries.find(
        (d: Record<string, unknown>) => d.id === id
      );
      expect(dismissed).toBeDefined();
      expect(dismissed.status).toBe("dismissed");
    });

    it("returns 404 for non-existent discovery", async () => {
      const res = await app.request("/api/discoveries/nonexistent-id-999", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns 400 when trying to dismiss an already-dismissed discovery", async () => {
      // Insert and dismiss a discovery
      upsertDiscovery(instance.db, {
        path: "/Users/test/already-dismissed-route",
        host: "local",
        remoteUrl: null,
        name: "already-dismissed-route",
        lastCommitAt: null,
      });

      const listRes = await app.request("/api/discoveries?status=found");
      const listBody = await listRes.json();
      const discovery = listBody.discoveries.find(
        (d: Record<string, unknown>) =>
          d.name === "already-dismissed-route"
      );
      const id = discovery.id;

      // First dismiss
      await app.request(`/api/discoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });

      // Try to dismiss again
      const res = await app.request(`/api/discoveries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/discoveries/scan", () => {
    it("returns 500 when config not loaded (test env)", async () => {
      // In test env, config is null by default (no mc.config.json loaded)
      const res = await app.request("/api/discoveries/scan", {
        method: "POST",
      });
      // Without config, the route returns 500 with INTERNAL_ERROR
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toContain("Config not loaded");
    });
  });
});
