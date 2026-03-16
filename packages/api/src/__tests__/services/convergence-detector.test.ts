import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import {
  createSession,
  updateSessionHeartbeat,
  updateSessionStatus,
} from "../../db/queries/sessions.js";
import { detectConvergence } from "../../services/convergence-detector.js";

describe("Convergence Detector", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  // Helper: create a session with files and optional status/timing
  function makeSession(opts: {
    id: string;
    project: string;
    cwd: string;
    files?: string[];
    status?: "active" | "completed" | "abandoned";
    startedMinutesAgo?: number;
    endedMinutesAgo?: number;
  }) {
    const { db } = instance;
    createSession(
      db,
      { sessionId: opts.id, source: "claude-code", model: null, cwd: opts.cwd },
      opts.project
    );
    if (opts.files && opts.files.length > 0) {
      updateSessionHeartbeat(db, opts.id, opts.files);
    }
    if (opts.status === "completed" || opts.status === "abandoned") {
      updateSessionStatus(db, opts.id, opts.status);
    }

    // Adjust timestamps if specified
    const now = Math.floor(Date.now() / 1000);
    if (opts.startedMinutesAgo !== undefined) {
      const startedAt = now - opts.startedMinutesAgo * 60;
      instance.sqlite
        .prepare("UPDATE sessions SET started_at = ? WHERE id = ?")
        .run(startedAt, opts.id);
    }
    if (opts.endedMinutesAgo !== undefined) {
      const endedAt = now - opts.endedMinutesAgo * 60;
      instance.sqlite
        .prepare("UPDATE sessions SET ended_at = ? WHERE id = ?")
        .run(endedAt, opts.id);
    }
  }

  // ── Positive Cases ────────────────────────────────────────────────

  describe("positive cases", () => {
    it("detects convergence: 2 sessions same project, overlapping files, 1 completed, within 30min", () => {
      const { db } = instance;
      makeSession({
        id: "conv-pos1-a",
        project: "conv-proj-1",
        cwd: "/proj1",
        files: ["/proj1/src/shared.ts", "/proj1/src/a.ts"],
        status: "completed",
        startedMinutesAgo: 20,
        endedMinutesAgo: 5,
      });
      makeSession({
        id: "conv-pos1-b",
        project: "conv-proj-1",
        cwd: "/proj1",
        files: ["/proj1/src/shared.ts", "/proj1/src/b.ts"],
        status: "active",
        startedMinutesAgo: 15,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-proj-1");
      expect(match).toBeDefined();
      expect(match!.overlappingFiles).toContain("/proj1/src/shared.ts");
      expect(match!.sessions.length).toBeGreaterThanOrEqual(2);
    });

    it("detects convergence: 2 sessions both completed, overlapping files, within 30min", () => {
      const { db } = instance;
      makeSession({
        id: "conv-pos2-a",
        project: "conv-proj-2",
        cwd: "/proj2",
        files: ["/proj2/src/index.ts"],
        status: "completed",
        startedMinutesAgo: 25,
        endedMinutesAgo: 10,
      });
      makeSession({
        id: "conv-pos2-b",
        project: "conv-proj-2",
        cwd: "/proj2",
        files: ["/proj2/src/index.ts", "/proj2/src/other.ts"],
        status: "completed",
        startedMinutesAgo: 20,
        endedMinutesAgo: 2,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-proj-2");
      expect(match).toBeDefined();
      expect(match!.overlappingFiles).toContain("/proj2/src/index.ts");
    });

    it("detects convergence for only the overlapping pair among 3 sessions", () => {
      const { db } = instance;
      makeSession({
        id: "conv-pos3-a",
        project: "conv-proj-3",
        cwd: "/proj3",
        files: ["/proj3/src/shared.ts"],
        status: "completed",
        startedMinutesAgo: 20,
        endedMinutesAgo: 5,
      });
      makeSession({
        id: "conv-pos3-b",
        project: "conv-proj-3",
        cwd: "/proj3",
        files: ["/proj3/src/shared.ts", "/proj3/src/b.ts"],
        status: "active",
        startedMinutesAgo: 15,
      });
      makeSession({
        id: "conv-pos3-c",
        project: "conv-proj-3",
        cwd: "/proj3",
        files: ["/proj3/src/unrelated.ts"],
        status: "active",
        startedMinutesAgo: 10,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-proj-3");
      expect(match).toBeDefined();
      expect(match!.overlappingFiles).toContain("/proj3/src/shared.ts");
      // Session c should not be part of the convergence since it has no file overlap
      const sessionIds = match!.sessions.map((s) => s.id);
      expect(sessionIds).toContain("conv-pos3-a");
      expect(sessionIds).toContain("conv-pos3-b");
    });

    it("handles custom windowMinutes parameter", () => {
      const { db } = instance;
      makeSession({
        id: "conv-pos4-a",
        project: "conv-proj-4",
        cwd: "/proj4",
        files: ["/proj4/src/file.ts"],
        status: "completed",
        startedMinutesAgo: 50,
        endedMinutesAgo: 45,
      });
      makeSession({
        id: "conv-pos4-b",
        project: "conv-proj-4",
        cwd: "/proj4",
        files: ["/proj4/src/file.ts"],
        status: "active",
        startedMinutesAgo: 55,
      });

      // Default 30min should NOT find it (ended 45 min ago)
      const defaultResults = detectConvergence(db);
      const noMatch = defaultResults.find((r) => r.projectSlug === "conv-proj-4");
      expect(noMatch).toBeUndefined();

      // 60min window SHOULD find it
      const extendedResults = detectConvergence(db, 60);
      const match = extendedResults.find((r) => r.projectSlug === "conv-proj-4");
      expect(match).toBeDefined();
    });
  });

  // ── Negative Cases (false positive control) ─────────────────────

  describe("negative cases (false positive control)", () => {
    it("returns empty when same project but NO file overlap", () => {
      const { db } = instance;
      makeSession({
        id: "conv-neg1-a",
        project: "conv-neg-1",
        cwd: "/neg1",
        files: ["/neg1/src/a.ts"],
        status: "completed",
        startedMinutesAgo: 10,
        endedMinutesAgo: 5,
      });
      makeSession({
        id: "conv-neg1-b",
        project: "conv-neg-1",
        cwd: "/neg1",
        files: ["/neg1/src/b.ts"],
        status: "active",
        startedMinutesAgo: 8,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-neg-1");
      expect(match).toBeUndefined();
    });

    it("returns empty when file overlap but NEITHER session is completed", () => {
      const { db } = instance;
      makeSession({
        id: "conv-neg2-a",
        project: "conv-neg-2",
        cwd: "/neg2",
        files: ["/neg2/src/shared.ts"],
        status: "active",
        startedMinutesAgo: 10,
      });
      makeSession({
        id: "conv-neg2-b",
        project: "conv-neg-2",
        cwd: "/neg2",
        files: ["/neg2/src/shared.ts"],
        status: "active",
        startedMinutesAgo: 8,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-neg-2");
      expect(match).toBeUndefined();
    });

    it("returns empty when overlap and committed but outside 30min window", () => {
      const { db } = instance;
      makeSession({
        id: "conv-neg3-a",
        project: "conv-neg-3",
        cwd: "/neg3",
        files: ["/neg3/src/shared.ts"],
        status: "completed",
        startedMinutesAgo: 120,
        endedMinutesAgo: 60,
      });
      makeSession({
        id: "conv-neg3-b",
        project: "conv-neg-3",
        cwd: "/neg3",
        files: ["/neg3/src/shared.ts"],
        status: "completed",
        startedMinutesAgo: 90,
        endedMinutesAgo: 45,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-neg-3");
      expect(match).toBeUndefined();
    });

    it("returns empty for a single active session alone on project", () => {
      const { db } = instance;
      makeSession({
        id: "conv-neg4-solo",
        project: "conv-neg-4",
        cwd: "/neg4",
        files: ["/neg4/src/file.ts"],
        status: "active",
        startedMinutesAgo: 10,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-neg-4");
      expect(match).toBeUndefined();
    });

    it("returns empty for 2 sessions on DIFFERENT projects with file overlap", () => {
      const { db } = instance;
      makeSession({
        id: "conv-neg5-a",
        project: "conv-neg-5a",
        cwd: "/neg5",
        files: ["/shared/util.ts"],
        status: "completed",
        startedMinutesAgo: 10,
        endedMinutesAgo: 5,
      });
      makeSession({
        id: "conv-neg5-b",
        project: "conv-neg-5b",
        cwd: "/neg5",
        files: ["/shared/util.ts"],
        status: "active",
        startedMinutesAgo: 8,
      });

      const results = detectConvergence(db);
      const matchA = results.find((r) => r.projectSlug === "conv-neg-5a");
      const matchB = results.find((r) => r.projectSlug === "conv-neg-5b");
      expect(matchA).toBeUndefined();
      expect(matchB).toBeUndefined();
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("excludes sessions with null/empty filesJson", () => {
      const { db } = instance;
      makeSession({
        id: "conv-edge1-a",
        project: "conv-edge-1",
        cwd: "/edge1",
        // No files -- filesJson stays null
        status: "completed",
        startedMinutesAgo: 10,
        endedMinutesAgo: 5,
      });
      makeSession({
        id: "conv-edge1-b",
        project: "conv-edge-1",
        cwd: "/edge1",
        files: ["/edge1/src/file.ts"],
        status: "active",
        startedMinutesAgo: 8,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-edge-1");
      expect(match).toBeUndefined();
    });

    it("excludes sessions with null projectSlug", () => {
      const { db } = instance;
      // Create session with null project slug
      createSession(
        db,
        { sessionId: "conv-edge2-a", source: "claude-code", model: null, cwd: "/edge2" },
        null
      );
      updateSessionHeartbeat(db, "conv-edge2-a", ["/edge2/src/file.ts"]);
      updateSessionStatus(db, "conv-edge2-a", "completed");

      createSession(
        db,
        { sessionId: "conv-edge2-b", source: "claude-code", model: null, cwd: "/edge2" },
        null
      );
      updateSessionHeartbeat(db, "conv-edge2-b", ["/edge2/src/file.ts"]);

      const results = detectConvergence(db);
      // No convergence should be found for null-project sessions
      const match = results.find((r) =>
        r.sessions.some((s) => s.id === "conv-edge2-a" || s.id === "conv-edge2-b")
      );
      expect(match).toBeUndefined();
    });

    it("excludes sessions with status 'abandoned'", () => {
      const { db } = instance;
      makeSession({
        id: "conv-edge3-a",
        project: "conv-edge-3",
        cwd: "/edge3",
        files: ["/edge3/src/shared.ts"],
        status: "completed",
        startedMinutesAgo: 10,
        endedMinutesAgo: 5,
      });
      makeSession({
        id: "conv-edge3-b",
        project: "conv-edge-3",
        cwd: "/edge3",
        files: ["/edge3/src/shared.ts"],
        status: "abandoned",
        startedMinutesAgo: 8,
        endedMinutesAgo: 3,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-edge-3");
      // Abandoned session should not trigger convergence
      // Only 1 valid session remains so no pair exists
      expect(match).toBeUndefined();
    });

    it("includes sessions exactly at the 30-minute boundary (inclusive)", () => {
      const { db } = instance;
      makeSession({
        id: "conv-edge4-a",
        project: "conv-edge-4",
        cwd: "/edge4",
        files: ["/edge4/src/shared.ts"],
        status: "completed",
        startedMinutesAgo: 35,
        endedMinutesAgo: 30, // Exactly at boundary
      });
      makeSession({
        id: "conv-edge4-b",
        project: "conv-edge-4",
        cwd: "/edge4",
        files: ["/edge4/src/shared.ts"],
        status: "active",
        startedMinutesAgo: 25,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-edge-4");
      expect(match).toBeDefined();
    });
  });

  // ── Return Shape ──────────────────────────────────────────────────

  describe("return shape", () => {
    it("returns ConvergenceResult with correct shape", () => {
      const { db } = instance;
      makeSession({
        id: "conv-shape-a",
        project: "conv-shape",
        cwd: "/shape",
        files: ["/shape/src/file.ts"],
        status: "completed",
        startedMinutesAgo: 10,
        endedMinutesAgo: 5,
      });
      makeSession({
        id: "conv-shape-b",
        project: "conv-shape",
        cwd: "/shape",
        files: ["/shape/src/file.ts"],
        status: "active",
        startedMinutesAgo: 8,
      });

      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "conv-shape");
      expect(match).toBeDefined();
      expect(match!.projectSlug).toBe("conv-shape");
      expect(match!.sessions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "conv-shape-a", status: "completed" }),
          expect.objectContaining({ id: "conv-shape-b", status: "active" }),
        ])
      );
      expect(match!.overlappingFiles).toContain("/shape/src/file.ts");
      expect(match!.detectedAt).toBeDefined();
      // detectedAt should be a valid ISO timestamp
      expect(() => new Date(match!.detectedAt)).not.toThrow();
      expect(new Date(match!.detectedAt).toISOString()).toBe(match!.detectedAt);
    });
  });
});
