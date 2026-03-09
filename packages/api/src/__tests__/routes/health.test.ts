import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";

describe("GET /api/health", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("returns 200 with status ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("returns a timestamp number", async () => {
    const res = await app.request("/api/health");
    const body = await res.json();
    expect(typeof body.timestamp).toBe("number");
    expect(body.timestamp).toBeGreaterThan(0);
  });

  it("returns a version string", async () => {
    const res = await app.request("/api/health");
    const body = await res.json();
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
  });
});
