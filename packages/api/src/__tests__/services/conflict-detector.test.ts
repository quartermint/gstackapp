import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import {
  createSession,
  updateSessionHeartbeat,
} from "../../db/queries/sessions.js";
import {
  detectConflicts,
  resolveSessionConflicts,
  normalizePath,
} from "../../services/conflict-detector.js";
import {
  upsertHealthFinding,
  getActiveFindings,
} from "../../db/queries/health.js";

describe("Conflict Detector", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  // ── normalizePath ──────────────────────────────────────────────

  describe("normalizePath", () => {
    it("returns absolute paths as-is", () => {
      expect(normalizePath("/abs/path.ts", "/root")).toBe("/abs/path.ts");
    });

    it("resolves relative paths using cwd", () => {
      expect(normalizePath("src/index.ts", "/root/project")).toBe(
        "/root/project/src/index.ts"
      );
    });
  });

  // ── detectConflicts ────────────────────────────────────────────

  describe("detectConflicts", () => {
    it("detects overlap between two active sessions on same project", () => {
      const { db } = instance;

      createSession(
        db,
        { sessionId: "cd-overlap-a", source: "claude-code", model: null, cwd: "/proj" },
        "overlap-proj"
      );
      updateSessionHeartbeat(db, "cd-overlap-a", ["/proj/src/shared.ts", "/proj/src/a.ts"]);

      createSession(
        db,
        { sessionId: "cd-overlap-b", source: "claude-code", model: null, cwd: "/proj" },
        "overlap-proj"
      );
      updateSessionHeartbeat(db, "cd-overlap-b", ["/proj/src/shared.ts", "/proj/src/b.ts"]);

      const conflicts = detectConflicts(db, "cd-overlap-b", "overlap-proj");
      expect(conflicts).toHaveLength(1);
      const conflict = conflicts[0]!;
      expect(conflict.projectSlug).toBe("overlap-proj");
      expect(conflict.sessionA).toBe("cd-overlap-b");
      expect(conflict.sessionB).toBe("cd-overlap-a");
      expect(conflict.conflictingFiles).toContain("/proj/src/shared.ts");
    });

    it("returns empty array when files do not overlap", () => {
      const { db } = instance;

      createSession(
        db,
        { sessionId: "cd-nooverlap-a", source: "claude-code", model: null, cwd: "/proj2" },
        "nooverlap-proj"
      );
      updateSessionHeartbeat(db, "cd-nooverlap-a", ["/proj2/src/a.ts"]);

      createSession(
        db,
        { sessionId: "cd-nooverlap-b", source: "claude-code", model: null, cwd: "/proj2" },
        "nooverlap-proj"
      );
      updateSessionHeartbeat(db, "cd-nooverlap-b", ["/proj2/src/b.ts"]);

      const conflicts = detectConflicts(db, "cd-nooverlap-b", "nooverlap-proj");
      expect(conflicts).toHaveLength(0);
    });

    it("returns empty array when only one active session exists", () => {
      const { db } = instance;

      createSession(
        db,
        { sessionId: "cd-single", source: "claude-code", model: null, cwd: "/proj3" },
        "single-proj"
      );
      updateSessionHeartbeat(db, "cd-single", ["/proj3/src/file.ts"]);

      const conflicts = detectConflicts(db, "cd-single", "single-proj");
      expect(conflicts).toHaveLength(0);
    });

    it("does not detect cross-project conflicts", () => {
      const { db } = instance;

      createSession(
        db,
        { sessionId: "cd-cross-a", source: "claude-code", model: null, cwd: "/projA" },
        "project-a"
      );
      updateSessionHeartbeat(db, "cd-cross-a", ["/shared/file.ts"]);

      createSession(
        db,
        { sessionId: "cd-cross-b", source: "claude-code", model: null, cwd: "/projB" },
        "project-b"
      );
      updateSessionHeartbeat(db, "cd-cross-b", ["/shared/file.ts"]);

      const conflicts = detectConflicts(db, "cd-cross-a", "project-a");
      expect(conflicts).toHaveLength(0);
    });

    it("normalizes relative file paths for conflict detection", () => {
      const { db } = instance;

      createSession(
        db,
        { sessionId: "cd-rel-a", source: "claude-code", model: null, cwd: "/myproj" },
        "rel-proj"
      );
      // Uses absolute path
      updateSessionHeartbeat(db, "cd-rel-a", ["/myproj/src/index.ts"]);

      createSession(
        db,
        { sessionId: "cd-rel-b", source: "claude-code", model: null, cwd: "/myproj" },
        "rel-proj"
      );
      // Uses relative path that resolves to the same file
      updateSessionHeartbeat(db, "cd-rel-b", ["src/index.ts"]);

      const conflicts = detectConflicts(db, "cd-rel-b", "rel-proj");
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]!.conflictingFiles).toContain("/myproj/src/index.ts");
    });

    it("returns empty array when triggering session has no filesJson", () => {
      const { db } = instance;

      createSession(
        db,
        { sessionId: "cd-nofiles-a", source: "claude-code", model: null, cwd: "/proj4" },
        "nofiles-proj"
      );
      updateSessionHeartbeat(db, "cd-nofiles-a", ["/proj4/src/file.ts"]);

      createSession(
        db,
        { sessionId: "cd-nofiles-b", source: "claude-code", model: null, cwd: "/proj4" },
        "nofiles-proj"
      );
      // No heartbeat with files -- filesJson is null

      const conflicts = detectConflicts(db, "cd-nofiles-b", "nofiles-proj");
      expect(conflicts).toHaveLength(0);
    });
  });

  // ── resolveSessionConflicts ────────────────────────────────────

  describe("resolveSessionConflicts", () => {
    it("resolves findings where session is sessionA", () => {
      const { db, sqlite } = instance;

      // Insert a conflict finding
      upsertHealthFinding(db, sqlite, {
        projectSlug: "resolve-a-proj",
        checkType: "session_file_conflict",
        severity: "warning",
        detail: "1 file(s) being edited in parallel sessions",
        metadata: {
          sessionA: "resolve-a-sess",
          sessionB: "resolve-other",
          files: ["/file.ts"],
          type: "session",
        },
      });

      // Verify it exists
      const before = getActiveFindings(db, "resolve-a-proj");
      expect(before.some((f) => f.checkType === "session_file_conflict")).toBe(true);

      // Resolve by sessionA
      resolveSessionConflicts(sqlite, "resolve-a-sess");

      // Verify it's resolved
      const after = getActiveFindings(db, "resolve-a-proj");
      expect(after.some((f) => f.checkType === "session_file_conflict")).toBe(false);
    });

    it("resolves findings where session is sessionB", () => {
      const { db, sqlite } = instance;

      // Insert a conflict finding
      upsertHealthFinding(db, sqlite, {
        projectSlug: "resolve-b-proj",
        checkType: "session_file_conflict",
        severity: "warning",
        detail: "1 file(s) being edited in parallel sessions",
        metadata: {
          sessionA: "resolve-other-2",
          sessionB: "resolve-b-sess",
          files: ["/file.ts"],
          type: "session",
        },
      });

      // Verify it exists
      const before = getActiveFindings(db, "resolve-b-proj");
      expect(before.some((f) => f.checkType === "session_file_conflict")).toBe(true);

      // Resolve by sessionB
      resolveSessionConflicts(sqlite, "resolve-b-sess");

      // Verify it's resolved
      const after = getActiveFindings(db, "resolve-b-proj");
      expect(after.some((f) => f.checkType === "session_file_conflict")).toBe(false);
    });
  });
});
