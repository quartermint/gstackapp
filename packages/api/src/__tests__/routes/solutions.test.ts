import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";
import { solutions, solutionReferences } from "../../db/schema.js";

describe("Solution Routes", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  beforeEach(() => {
    instance.db.delete(solutionReferences).run();
    instance.db.delete(solutions).run();
  });

  async function createTestSolution(overrides: Record<string, unknown> = {}) {
    const body = {
      title: "Test solution",
      content: "Test content for solution",
      contentHash: `hash-${Date.now()}-${Math.random()}`,
      ...overrides,
    };
    const res = await app.request("/api/solutions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res;
  }

  describe("POST /api/solutions", () => {
    it("creates a solution candidate", async () => {
      const res = await createTestSolution({
        title: "Fix scanner null pointer",
        content: "Added null check before scanner access",
        contentHash: "hash-post-1",
        projectSlug: "mission-control",
        problemType: "bug_fix",
        severity: "high",
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.solution.id).toBeTruthy();
      expect(body.solution.title).toBe("Fix scanner null pointer");
      expect(body.solution.status).toBe("candidate");
      expect(body.solution.problemType).toBe("bug_fix");
      expect(body.solution.severity).toBe("high");
    });

    it("returns 409 for duplicate contentHash", async () => {
      await createTestSolution({ contentHash: "hash-dup-test" });
      const res = await createTestSolution({ contentHash: "hash-dup-test" });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("CONFLICT");
    });
  });

  describe("GET /api/solutions", () => {
    it("returns list with filtering", async () => {
      await createTestSolution({
        contentHash: "hash-list-a",
        projectSlug: "mission-control",
      });
      await createTestSolution({
        contentHash: "hash-list-b",
        projectSlug: "openefb",
      });

      // All
      const allRes = await app.request("/api/solutions");
      expect(allRes.status).toBe(200);
      const allBody = await allRes.json();
      expect(allBody.solutions).toHaveLength(2);
      expect(allBody.total).toBe(2);

      // Filtered
      const filteredRes = await app.request(
        "/api/solutions?projectSlug=mission-control"
      );
      expect(filteredRes.status).toBe(200);
      const filteredBody = await filteredRes.json();
      expect(filteredBody.solutions).toHaveLength(1);
      expect(filteredBody.total).toBe(1);
    });
  });

  describe("GET /api/solutions/:id", () => {
    it("returns specific solution", async () => {
      const createRes = await createTestSolution({
        contentHash: "hash-get-one",
      });
      const created = await createRes.json();

      const res = await app.request(
        `/api/solutions/${created.solution.id}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.solution.id).toBe(created.solution.id);
    });

    it("returns 404 for unknown id", async () => {
      const res = await app.request("/api/solutions/nonexistent-id");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/solutions/:id/status", () => {
    it("updates status and sets reviewedAt", async () => {
      const createRes = await createTestSolution({
        contentHash: "hash-patch-status",
      });
      const created = await createRes.json();

      const res = await app.request(
        `/api/solutions/${created.solution.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "accepted" }),
        }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.solution.status).toBe("accepted");
      expect(body.solution.reviewedAt).toBeTruthy();
    });
  });

  describe("PATCH /api/solutions/:id/metadata", () => {
    it("updates metadata fields", async () => {
      const createRes = await createTestSolution({
        contentHash: "hash-patch-meta",
      });
      const created = await createRes.json();

      const res = await app.request(
        `/api/solutions/${created.solution.id}/metadata`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            module: "scanner",
            problemType: "performance",
            symptoms: "slow response",
          }),
        }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.solution.module).toBe("scanner");
      expect(body.solution.problemType).toBe("performance");
      expect(body.solution.symptoms).toBe("slow response");
    });
  });

  describe("GET /api/solutions/compound-score", () => {
    it("returns score shape with zeros initially", async () => {
      const res = await app.request("/api/solutions/compound-score");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalSolutions).toBe(0);
      expect(body.acceptedSolutions).toBe(0);
      expect(body.referencedSolutions).toBe(0);
      expect(body.totalReferences).toBe(0);
      expect(body.reuseRate).toBe(0);
      expect(body.weeklyTrend).toEqual([]);
    });
  });
});
