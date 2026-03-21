import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";

describe("Captures API", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("POST /api/captures", () => {
    it("creates a capture and returns 201", async () => {
      const res = await app.request("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent: "My first thought" }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.capture).toBeDefined();
      expect(body.capture.id).toBeDefined();
      expect(body.capture.rawContent).toBe("My first thought");
      expect(body.capture.type).toBe("text");
      expect(body.capture.status).toBe("raw");
    });

    it("returns 400 for empty rawContent", async () => {
      const res = await app.request("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing rawContent", async () => {
      const res = await app.request("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("persists userId on capture (PLAT-02)", async () => {
      const res = await app.request("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawContent: "User-specific thought",
          userId: "user-123",
        }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.capture.userId).toBe("user-123");
    });

    it("accepts optional type field", async () => {
      const res = await app.request("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawContent: "A link capture",
          type: "link",
        }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.capture.type).toBe("link");
    });
  });

  describe("GET /api/captures/:id", () => {
    it("returns a capture by id", async () => {
      // Create first
      const createRes = await app.request("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent: "Retrievable thought" }),
      });
      const created = await createRes.json();
      const id = created.capture.id;

      // Retrieve
      const res = await app.request(`/api/captures/${id}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.capture.id).toBe(id);
      expect(body.capture.rawContent).toBe("Retrievable thought");
    });

    it("returns 404 for nonexistent id", async () => {
      const res = await app.request("/api/captures/nonexistent-id-123");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("GET /api/captures", () => {
    it("returns array of captures", async () => {
      const res = await app.request("/api/captures");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.captures)).toBe(true);
      expect(typeof body.total).toBe("number");
    });

    it("filters by projectId", async () => {
      // Create capture with projectId
      await app.request("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawContent: "Project-specific thought",
          projectId: "efb-212",
        }),
      });

      const res = await app.request("/api/captures?projectId=efb-212");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.captures.length).toBeGreaterThan(0);
      for (const capture of body.captures) {
        expect(capture.projectId).toBe("efb-212");
      }
    });

    it("filters by status", async () => {
      const res = await app.request("/api/captures?status=raw");
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const capture of body.captures) {
        expect(capture.status).toBe("raw");
      }
    });

    it("filters by userId", async () => {
      const res = await app.request("/api/captures?userId=user-123");
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const capture of body.captures) {
        expect(capture.userId).toBe("user-123");
      }
    });
  });

  describe("PATCH /api/captures/:id", () => {
    it("updates specified fields", async () => {
      // Create
      const createRes = await app.request("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent: "Original thought" }),
      });
      const created = await createRes.json();
      const id = created.capture.id;

      // Update
      const res = await app.request(`/api/captures/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawContent: "Updated thought",
          status: "enriched",
        }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.capture.rawContent).toBe("Updated thought");
      expect(body.capture.status).toBe("enriched");
    });

    it("returns 404 for nonexistent id", async () => {
      const res = await app.request("/api/captures/nonexistent-id-456", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent: "Won't work" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("Idempotency-Key handling", () => {
    it("creates capture normally with Idempotency-Key header and returns 201", async () => {
      const idempotencyKey = "idem-test-create-normal";
      const res = await app.request("/api/captures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ rawContent: "Idempotent capture" }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.capture).toBeDefined();
      expect(body.capture.id).toBeDefined();
      expect(body.capture.rawContent).toBe("Idempotent capture");
    });

    it("returns same capture id on duplicate Idempotency-Key", async () => {
      const idempotencyKey = "idem-test-duplicate-key";
      const payload = JSON.stringify({ rawContent: "Dedup capture" });

      // First request
      const res1 = await app.request("/api/captures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: payload,
      });
      expect(res1.status).toBe(201);
      const body1 = await res1.json();
      const firstId = body1.capture.id;

      // Second request with same key
      const res2 = await app.request("/api/captures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: payload,
      });
      expect(res2.status).toBe(201);
      const body2 = await res2.json();

      // Should return the SAME capture, not create a new one
      expect(body2.capture.id).toBe(firstId);
    });

    it("creates capture normally without Idempotency-Key (backward compat)", async () => {
      const res = await app.request("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent: "No idempotency key" }),
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.capture).toBeDefined();
      expect(body.capture.rawContent).toBe("No idempotency key");
    });

    it("creates separate captures for different Idempotency-Key values", async () => {
      const payload = JSON.stringify({ rawContent: "Different keys capture" });

      const res1 = await app.request("/api/captures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-key-alpha",
        },
        body: payload,
      });
      expect(res1.status).toBe(201);
      const body1 = await res1.json();

      const res2 = await app.request("/api/captures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-key-beta",
        },
        body: payload,
      });
      expect(res2.status).toBe(201);
      const body2 = await res2.json();

      // Different keys should create different captures
      expect(body1.capture.id).not.toBe(body2.capture.id);
    });

    it("handles lowercase idempotency-key header (case-insensitive)", async () => {
      const idempotencyKey = "idem-test-case-insensitive";
      const payload = JSON.stringify({ rawContent: "Case test capture" });

      // First request with standard casing
      const res1 = await app.request("/api/captures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: payload,
      });
      expect(res1.status).toBe(201);
      const body1 = await res1.json();

      // Second request with lowercase header
      const res2 = await app.request("/api/captures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: payload,
      });
      expect(res2.status).toBe(201);
      const body2 = await res2.json();

      // Should return the same capture (HTTP headers are case-insensitive)
      expect(body2.capture.id).toBe(body1.capture.id);
    });
  });

  describe("DELETE /api/captures/:id", () => {
    it("deletes a capture and returns 204", async () => {
      // Create
      const createRes = await app.request("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent: "Ephemeral thought" }),
      });
      const created = await createRes.json();
      const id = created.capture.id;

      // Delete
      const res = await app.request(`/api/captures/${id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(204);

      // Verify gone
      const getRes = await app.request(`/api/captures/${id}`);
      expect(getRes.status).toBe(404);
    });

    it("returns 404 for nonexistent id", async () => {
      const res = await app.request("/api/captures/nonexistent-id-789", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});
