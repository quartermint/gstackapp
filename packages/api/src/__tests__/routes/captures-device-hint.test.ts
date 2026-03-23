import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";

describe("Captures API - Device Classification", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("POST /captures accepts deviceClassification field", async () => {
    const res = await app.request("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawContent: "Fix the departure board sorting",
        deviceClassification: {
          projectSlug: "mission-control",
          confidence: 0.92,
          classifiedAt: new Date().toISOString(),
          classifiedOnDevice: true,
        },
      }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.capture).toBeDefined();
    expect(body.capture.id).toBeDefined();
    expect(body.capture.rawContent).toBe("Fix the departure board sorting");
  });

  it("POST /captures works without deviceClassification (backward compatible)", async () => {
    const res = await app.request("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawContent: "A thought without device classification",
      }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.capture).toBeDefined();
    expect(body.capture.rawContent).toBe("A thought without device classification");
  });

  it("POST /captures rejects invalid confidence range", async () => {
    const res = await app.request("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawContent: "Invalid confidence",
        deviceClassification: {
          projectSlug: "mission-control",
          confidence: 1.5, // Invalid: exceeds max(1)
          classifiedAt: new Date().toISOString(),
          classifiedOnDevice: true,
        },
      }),
    });
    expect(res.status).toBe(400);
  });
});
