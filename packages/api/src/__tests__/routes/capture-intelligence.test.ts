import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { createCapture, updateCaptureEnrichment } from "../../db/queries/captures.js";
import { upsertProject } from "../../db/queries/projects.js";
import { createExtraction } from "../../db/queries/capture-extractions.js";

describe("Capture Intelligence Routes", () => {
  let instance: DatabaseInstance;
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);

    // Seed test projects
    upsertProject(instance.db, {
      slug: "mission-control",
      name: "Mission Control",
      tagline: "Personal operating environment",
      path: "/Users/test/mission-control",
      host: "local",
      lastScannedAt: null,
    });
    upsertProject(instance.db, {
      slug: "openefb",
      name: "OpenEFB",
      tagline: "iPad VFR Electronic Flight Bag",
      path: "/Users/test/openefb",
      host: "local",
      lastScannedAt: null,
    });
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("POST /api/captures/:id/reassign", () => {
    it("reassigns capture to new project and creates few-shot example", async () => {
      // Create a capture that was AI-assigned to mission-control
      const capture = createCapture(instance.db, {
        rawContent: "Fix the waypoint overlay on the map",
        type: "text",
      });
      updateCaptureEnrichment(instance.db, capture.id, {
        projectId: "mission-control",
        aiProjectSlug: "mission-control",
        aiConfidence: 0.7,
        status: "enriched",
      });

      const res = await app.request(`/api/captures/${capture.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug: "openefb" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.capture.projectId).toBe("openefb");
      expect(body.correction.previousSlug).toBe("mission-control");
      expect(body.correction.newSlug).toBe("openefb");
      expect(body.correction.fewShotExampleCreated).toBe(true);
    });

    it("returns 404 for non-existent capture", async () => {
      const res = await app.request("/api/captures/nonexistent/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug: "openefb" }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/captures/:id/extractions", () => {
    it("returns extractions for a capture", async () => {
      const capture = createCapture(instance.db, {
        rawContent: "Add vector search to mission-control",
        type: "text",
      });

      // Add some extractions
      createExtraction(instance.db, {
        captureId: capture.id,
        extractionType: "project_ref",
        content: "mission-control",
        confidence: 0.95,
        groundingJson: JSON.stringify([
          { start: 22, end: 37, text: "mission-control", tier: "exact" },
        ]),
      });
      createExtraction(instance.db, {
        captureId: capture.id,
        extractionType: "action_item",
        content: "Add vector search",
        confidence: 0.8,
      });

      const res = await app.request(`/api/captures/${capture.id}/extractions`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.captureId).toBe(capture.id);
      expect(body.extractions).toHaveLength(2);
      expect(body.extractions[0].extractionType).toBe("project_ref");
      expect(body.extractions[0].grounding).toHaveLength(1);
      expect(body.extractions[0].grounding[0].tier).toBe("exact");
      expect(body.extractions[1].extractionType).toBe("action_item");
      expect(body.extractions[1].grounding).toBeNull();
    });

    it("returns 404 for non-existent capture", async () => {
      const res = await app.request("/api/captures/nonexistent/extractions");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/captures/correction-stats", () => {
    it("returns correction statistics", async () => {
      // Create a capture and reassign to generate correction stats
      const capture = createCapture(instance.db, {
        rawContent: "Another waypoint bug",
        type: "text",
      });
      updateCaptureEnrichment(instance.db, capture.id, {
        aiProjectSlug: "mission-control",
        status: "enriched",
      });

      // Reassign to generate stats
      await app.request(`/api/captures/${capture.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug: "openefb" }),
      });

      const res = await app.request("/api/captures/correction-stats");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stats.length).toBeGreaterThan(0);
      // Should have mission-control -> openefb correction
      const mcToEfb = body.stats.find(
        (s: Record<string, unknown>) =>
          s.predictedSlug === "mission-control" && s.actualSlug === "openefb"
      );
      expect(mcToEfb).toBeDefined();
      expect(mcToEfb.correctionCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GET /api/captures/few-shot-examples", () => {
    it("returns few-shot examples", async () => {
      const res = await app.request("/api/captures/few-shot-examples");
      expect(res.status).toBe(200);

      const body = await res.json();
      // Should have examples from previous reassignment tests
      expect(body.examples.length).toBeGreaterThan(0);
      expect(body.examples[0].isCorrection).toBe(true);
    });
  });
});
