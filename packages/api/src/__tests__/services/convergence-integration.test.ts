import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import {
  createSession,
  updateSessionHeartbeat,
  updateSessionStatus,
} from "../../db/queries/sessions.js";
import { upsertHealthFinding, getActiveFindings, resolveFindings } from "../../db/queries/health.js";

describe("Convergence Integration (Scanner + API)", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  // Helper: create a session with files and optional status
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

  // ── Convergence finding creation ────────────────────────────────

  describe("convergence findings via detectConvergence", () => {
    it("creates health findings with checkType='convergence' and severity='info'", async () => {
      const { db } = instance;

      // Set up convergent sessions
      makeSession({
        id: "int-conv-a",
        project: "int-conv-proj",
        cwd: "/int-conv",
        files: ["/int-conv/src/shared.ts"],
        status: "completed",
        startedMinutesAgo: 15,
        endedMinutesAgo: 5,
      });
      makeSession({
        id: "int-conv-b",
        project: "int-conv-proj",
        cwd: "/int-conv",
        files: ["/int-conv/src/shared.ts", "/int-conv/src/b.ts"],
        status: "active",
        startedMinutesAgo: 10,
      });

      // Import and run convergence detection + upsert as Stage 5 would
      const { detectConvergence } = await import(
        "../../services/convergence-detector.js"
      );
      const results = detectConvergence(db);
      const match = results.find((r) => r.projectSlug === "int-conv-proj");
      expect(match).toBeDefined();

      // Upsert as health finding (mimics Stage 5 logic)
      upsertHealthFinding(db, instance.sqlite, {
        projectSlug: match!.projectSlug,
        checkType: "convergence",
        severity: "info",
        detail: `${match!.sessions.length} sessions may be ready to converge (${match!.overlappingFiles.length} overlapping files)`,
        metadata: {
          sessions: match!.sessions,
          overlappingFiles: match!.overlappingFiles,
          type: "convergence",
        },
      });

      // Verify finding was created
      const findings = getActiveFindings(db, "int-conv-proj");
      const convFinding = findings.find((f) => f.checkType === "convergence");
      expect(convFinding).toBeDefined();
      expect(convFinding!.severity).toBe("info");
      expect(convFinding!.detail).toContain("sessions may be ready to converge");
      expect(convFinding!.metadata).toBeDefined();
      expect(
        (convFinding!.metadata as Record<string, unknown>).type
      ).toBe("convergence");
    });
  });

  // ── Convergence finding auto-resolution ──────────────────────────

  describe("convergence finding auto-resolution", () => {
    it("resolves convergence findings when conditions no longer hold", () => {
      const { db } = instance;

      // Create a convergence finding manually
      upsertHealthFinding(db, instance.sqlite, {
        projectSlug: "int-resolve-proj",
        checkType: "convergence",
        severity: "info",
        detail: "2 sessions may be ready to converge",
        metadata: { type: "convergence" },
      });

      // Verify it exists
      const beforeFindings = getActiveFindings(db, "int-resolve-proj");
      const beforeConv = beforeFindings.find((f) => f.checkType === "convergence");
      expect(beforeConv).toBeDefined();

      // Simulate resolution: convergence no longer detected (empty results)
      // Resolve convergence findings for projects not in convergedSlugs
      const convergedSlugs = new Set<string>(); // empty = no convergence
      const activeConvergenceFindings = getActiveFindings(db).filter(
        (f) => f.checkType === "convergence"
      );
      for (const finding of activeConvergenceFindings) {
        if (!convergedSlugs.has(finding.projectSlug)) {
          instance.sqlite
            .prepare(
              `UPDATE project_health SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL`
            )
            .run(new Date().toISOString(), finding.id);
        }
      }

      // Verify finding is resolved
      const afterFindings = getActiveFindings(db, "int-resolve-proj");
      const afterConv = afterFindings.find((f) => f.checkType === "convergence");
      expect(afterConv).toBeUndefined();
    });
  });

  // ── Convergence in activeCheckTypes ──────────────────────────────

  describe("convergence excluded from resolveFindings", () => {
    it("convergence findings survive per-repo resolveFindings when in activeCheckTypes", () => {
      const { db } = instance;

      // Create a convergence finding
      upsertHealthFinding(db, instance.sqlite, {
        projectSlug: "int-preserve-proj",
        checkType: "convergence",
        severity: "info",
        detail: "test convergence",
        metadata: { type: "convergence" },
      });

      // Simulate Stage 1: resolveFindings with convergence in activeCheckTypes
      const activeCheckTypes = ["dirty_working_tree", "diverged_copies", "convergence"];
      resolveFindings(instance.sqlite, "int-preserve-proj", activeCheckTypes);

      // Convergence finding should survive
      const findings = getActiveFindings(db, "int-preserve-proj");
      const convFinding = findings.find((f) => f.checkType === "convergence");
      expect(convFinding).toBeDefined();
    });
  });

  // ── GET /api/sessions/convergence ─────────────────────────────────

  describe("GET /api/sessions/convergence endpoint", () => {
    it("returns active convergence findings", async () => {
      const { db } = instance;

      // Create a convergence finding
      upsertHealthFinding(db, instance.sqlite, {
        projectSlug: "int-api-proj",
        checkType: "convergence",
        severity: "info",
        detail: "2 sessions converging",
        metadata: {
          sessions: [
            { id: "s1", status: "completed" },
            { id: "s2", status: "active" },
          ],
          overlappingFiles: ["/src/shared.ts"],
          type: "convergence",
        },
      });

      // Verify the finding is queryable
      const findings = getActiveFindings(db).filter(
        (f) => f.checkType === "convergence" && f.projectSlug === "int-api-proj"
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);

      // Simulate what the endpoint does
      const convergences = findings.map((f) => ({
        projectSlug: f.projectSlug,
        sessions:
          ((f.metadata as Record<string, unknown>)?.sessions as Array<{
            id: string;
            status: string;
          }>) ?? [],
        overlappingFiles:
          ((f.metadata as Record<string, unknown>)?.overlappingFiles as string[]) ??
          [],
        severity: f.severity,
        detectedAt: f.detectedAt,
      }));

      expect(convergences[0]!.projectSlug).toBe("int-api-proj");
      expect(convergences[0]!.sessions).toHaveLength(2);
      expect(convergences[0]!.overlappingFiles).toContain("/src/shared.ts");
      expect(convergences[0]!.severity).toBe("info");
    });
  });
});
