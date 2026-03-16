import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";
import {
  createSession,
  getSession,
  listSessions,
  updateSessionHeartbeat,
  updateSessionStatus,
} from "../../../db/queries/sessions.js";

describe("Session queries", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("createSession", () => {
    it("creates a session with correct tier derivation", () => {
      const session = createSession(instance.db, {
        sessionId: "sess-001",
        source: "claude-code",
        model: "claude-opus-4-20250514",
        cwd: "/Users/ryanstern/mission-control",
      });

      expect(session.id).toBe("sess-001");
      expect(session.source).toBe("claude-code");
      expect(session.model).toBe("claude-opus-4-20250514");
      expect(session.tier).toBe("opus");
      expect(session.status).toBe("active");
      expect(session.cwd).toBe("/Users/ryanstern/mission-control");
      expect(session.startedAt).toBeInstanceOf(Date);
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it("creates a session with sonnet tier", () => {
      const session = createSession(instance.db, {
        sessionId: "sess-002",
        source: "claude-code",
        model: "claude-sonnet-4-20250514",
        cwd: "/Users/ryanstern/nexusclaw",
      });

      expect(session.tier).toBe("sonnet");
    });

    it("creates an aider session with local tier", () => {
      const session = createSession(instance.db, {
        sessionId: "sess-003",
        source: "aider",
        model: "qwen3-coder-30b",
        cwd: "/Users/ryanstern/openefb",
      });

      expect(session.source).toBe("aider");
      expect(session.tier).toBe("local");
    });

    it("handles null model with unknown tier", () => {
      const session = createSession(instance.db, {
        sessionId: "sess-004",
        source: "claude-code",
        model: null,
        cwd: "/tmp/test",
      });

      expect(session.model).toBeNull();
      expect(session.tier).toBe("unknown");
    });

    it("stores taskDescription when provided", () => {
      const session = createSession(instance.db, {
        sessionId: "sess-005",
        source: "claude-code",
        model: "claude-opus-4-20250514",
        cwd: "/tmp/test",
        taskDescription: "Fix the login bug",
      });

      expect(session.taskDescription).toBe("Fix the login bug");
    });
  });

  describe("getSession", () => {
    it("returns existing session by ID", () => {
      const session = getSession(instance.db, "sess-001");
      expect(session.id).toBe("sess-001");
      expect(session.source).toBe("claude-code");
    });

    it("throws notFound for nonexistent session", () => {
      expect(() => getSession(instance.db, "nonexistent")).toThrow(
        "Session nonexistent not found"
      );
    });
  });

  describe("listSessions", () => {
    it("lists all sessions", () => {
      const result = listSessions(instance.db, { limit: 50, offset: 0 });
      expect(result.sessions.length).toBeGreaterThanOrEqual(5);
      expect(result.total).toBeGreaterThanOrEqual(5);
    });

    it("filters by status", () => {
      const result = listSessions(instance.db, {
        status: "active",
        limit: 50,
        offset: 0,
      });
      expect(result.sessions.every((s) => s.status === "active")).toBe(true);
    });

    it("filters by source", () => {
      const result = listSessions(instance.db, {
        source: "aider",
        limit: 50,
        offset: 0,
      });
      expect(result.sessions.every((s) => s.source === "aider")).toBe(true);
      expect(result.sessions.length).toBeGreaterThanOrEqual(1);
    });

    it("respects limit and offset", () => {
      const result = listSessions(instance.db, { limit: 2, offset: 0 });
      expect(result.sessions.length).toBeLessThanOrEqual(2);
    });

    it("orders by startedAt descending", () => {
      const result = listSessions(instance.db, { limit: 50, offset: 0 });
      for (let i = 1; i < result.sessions.length; i++) {
        const prev = result.sessions[i - 1]!.startedAt;
        const curr = result.sessions[i]!.startedAt;
        expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
      }
    });
  });

  describe("updateSessionHeartbeat", () => {
    it("updates lastHeartbeatAt and adds files", () => {
      const updated = updateSessionHeartbeat(instance.db, "sess-001", [
        "/Users/ryanstern/mission-control/src/app.ts",
      ]);

      expect(updated.lastHeartbeatAt).toBeInstanceOf(Date);
      expect(updated.filesJson).not.toBeNull();
      const files = JSON.parse(updated.filesJson!);
      expect(files).toContain(
        "/Users/ryanstern/mission-control/src/app.ts"
      );
    });

    it("deduplicates files across heartbeats", () => {
      updateSessionHeartbeat(instance.db, "sess-001", [
        "/Users/ryanstern/mission-control/src/app.ts",
        "/Users/ryanstern/mission-control/src/db.ts",
      ]);
      const updated = updateSessionHeartbeat(instance.db, "sess-001", [
        "/Users/ryanstern/mission-control/src/app.ts",
        "/Users/ryanstern/mission-control/src/routes.ts",
      ]);

      const files = JSON.parse(updated.filesJson!);
      expect(files).toHaveLength(3);
      expect(files).toContain(
        "/Users/ryanstern/mission-control/src/app.ts"
      );
      expect(files).toContain(
        "/Users/ryanstern/mission-control/src/db.ts"
      );
      expect(files).toContain(
        "/Users/ryanstern/mission-control/src/routes.ts"
      );
    });

    it("throws for nonexistent session", () => {
      expect(() =>
        updateSessionHeartbeat(instance.db, "nonexistent", [])
      ).toThrow("Session nonexistent not found");
    });
  });

  describe("updateSessionStatus", () => {
    it("marks session as completed with endedAt", () => {
      const updated = updateSessionStatus(
        instance.db,
        "sess-002",
        "completed"
      );
      expect(updated.status).toBe("completed");
      expect(updated.endedAt).toBeInstanceOf(Date);
    });

    it("marks session as abandoned with stopReason", () => {
      const updated = updateSessionStatus(
        instance.db,
        "sess-003",
        "abandoned",
        "context limit reached"
      );
      expect(updated.status).toBe("abandoned");
      expect(updated.stopReason).toBe("context limit reached");
      expect(updated.endedAt).toBeInstanceOf(Date);
    });

    it("throws for nonexistent session", () => {
      expect(() =>
        updateSessionStatus(instance.db, "nonexistent", "completed")
      ).toThrow("Session nonexistent not found");
    });
  });
});
