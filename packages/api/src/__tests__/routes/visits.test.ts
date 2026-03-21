import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";

describe("visit routes", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("GET /api/visits/last", () => {
    it("returns 404 when no visit exists for clientId", async () => {
      const res = await app.request("/api/visits/last?clientId=web");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("No previous visit");
    });

    it("returns 400 without clientId query param", async () => {
      const res = await app.request("/api/visits/last");
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/visits", () => {
    it("records a visit and returns clientId and lastVisitAt", async () => {
      const res = await app.request("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "web" }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.clientId).toBe("web");
      expect(body.lastVisitAt).toBeDefined();
      expect(typeof body.lastVisitAt).toBe("string");
    });

    it("returns 400 with empty clientId", async () => {
      const res = await app.request("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("visit rotation flow", () => {
    it("after POST, GET returns lastVisitAt with previousVisitAt null", async () => {
      // Record a visit for a fresh client
      const postRes = await app.request("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "rotation-test" }),
      });
      expect(postRes.status).toBe(200);
      const postBody = await postRes.json();
      const firstVisitAt = postBody.lastVisitAt;

      // Get should return the visit with previousVisitAt null
      const getRes = await app.request(
        "/api/visits/last?clientId=rotation-test"
      );
      expect(getRes.status).toBe(200);

      const getBody = await getRes.json();
      expect(getBody.clientId).toBe("rotation-test");
      expect(getBody.lastVisitAt).toBe(firstVisitAt);
      expect(getBody.previousVisitAt).toBeNull();
    });

    it("after second POST, previousVisitAt equals first visit's lastVisitAt", async () => {
      // Record first visit
      const firstRes = await app.request("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "rotation-test-2" }),
      });
      const firstBody = await firstRes.json();
      const firstVisitAt = firstBody.lastVisitAt;

      // Record second visit
      const secondRes = await app.request("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "rotation-test-2" }),
      });
      expect(secondRes.status).toBe(200);

      // GET should show rotation
      const getRes = await app.request(
        "/api/visits/last?clientId=rotation-test-2"
      );
      expect(getRes.status).toBe(200);

      const getBody = await getRes.json();
      expect(getBody.previousVisitAt).toBe(firstVisitAt);
      expect(getBody.lastVisitAt).not.toBe(firstVisitAt);
    });
  });
});
