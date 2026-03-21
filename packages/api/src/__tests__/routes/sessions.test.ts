import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import { createApp } from "../../app.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { MCConfig } from "../../lib/config.js";
import { getActiveFindings } from "../../db/queries/health.js";

const testConfig: MCConfig = {
  projects: [
    {
      name: "Test Project",
      slug: "test-project",
      path: "/test/project",
      host: "local",
      dependsOn: [],
    },
  ],
  dataDir: "./data",
  services: [],
  macMiniSshHost: "test-host",
  modelTiers: [
    { pattern: "^claude-opus", tier: "opus" },
    { pattern: "^claude-sonnet", tier: "sonnet" },
  ],
  budgetThresholds: { weeklyOpusHot: 20, weeklyOpusModerate: 10, weekResetDay: 5 },
  lmStudio: { url: "http://100.x.x.x:1234", targetModel: "qwen3-coder", probeIntervalMs: 30000 },
  discovery: { paths: ["~"], scanIntervalMinutes: 60, githubOrgs: ["quartermint", "vanboompow"], starSyncIntervalHours: 6 },
};

describe("Sessions API", () => {
  let instance: DatabaseInstance;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    instance = createTestDb();
    app = createApp(instance, testConfig);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  // ── POST /api/sessions/hook/start ────────────────────────────

  describe("POST /api/sessions/hook/start", () => {
    it("creates a new session from Claude Code hook payload", async () => {
      const res = await app.request("/api/sessions/hook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-001",
          cwd: "/test/project",
          model: "claude-opus-4-20250514",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.session).toBeDefined();
      expect(body.session.id).toBe("test-001");
      expect(body.session.status).toBe("active");
      expect(body.session.projectSlug).toBe("test-project");
      expect(body.session.tier).toBe("opus");
    });

    it("handles resume by updating existing active session", async () => {
      // Create a session first
      await app.request("/api/sessions/hook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-002",
          cwd: "/test/project",
          model: "claude-opus-4-20250514",
        }),
      });

      // POST again with same session_id (resume)
      const res = await app.request("/api/sessions/hook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-002",
          cwd: "/test/project",
          model: "claude-opus-4-20250514",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session.status).toBe("active");
    });

    it("sets projectSlug to null for unrecognized cwd", async () => {
      const res = await app.request("/api/sessions/hook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-003",
          cwd: "/unknown/path",
          model: "claude-opus-4-20250514",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.session.projectSlug).toBeNull();
    });

    it("creates session with null model (unknown tier)", async () => {
      const res = await app.request("/api/sessions/hook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-004",
          cwd: "/test/project",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.session.tier).toBe("unknown");
    });
  });

  // ── POST /api/sessions/hook/heartbeat ────────────────────────

  describe("POST /api/sessions/hook/heartbeat", () => {
    it("updates session files and returns ok", async () => {
      // Create a session first
      await app.request("/api/sessions/hook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-hb-1",
          cwd: "/test/project",
          model: "claude-opus-4-20250514",
        }),
      });

      const res = await app.request("/api/sessions/hook/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-hb-1",
          tool_input: { file_path: "/test/project/src/index.ts" },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("debounces rapid heartbeats", async () => {
      // Create a session
      await app.request("/api/sessions/hook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-hb-2",
          cwd: "/test/project",
          model: "claude-opus-4-20250514",
        }),
      });

      // First heartbeat (not debounced)
      await app.request("/api/sessions/hook/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-hb-2",
          tool_input: { file_path: "/test/project/src/a.ts" },
        }),
      });

      // Second heartbeat (should be debounced)
      const res = await app.request("/api/sessions/hook/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-hb-2",
          tool_input: { file_path: "/test/project/src/b.ts" },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.debounced).toBe(true);
    });

    it("silently handles unknown session", async () => {
      const res = await app.request("/api/sessions/hook/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "nonexistent-hb-session",
          tool_input: { file_path: "/some/file.ts" },
        }),
      });

      expect(res.status).toBe(200);
    });
  });

  // ── POST /api/sessions/hook/stop ─────────────────────────────

  describe("POST /api/sessions/hook/stop", () => {
    it("marks session as completed", async () => {
      // Create a session
      await app.request("/api/sessions/hook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-stop-1",
          cwd: "/test/project",
          model: "claude-opus-4-20250514",
        }),
      });

      const res = await app.request("/api/sessions/hook/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test-stop-1",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session).toBeDefined();
      expect(body.session.status).toBe("completed");
      expect(body.session.endedAt).toBeDefined();
    });

    it("handles stop for unknown session gracefully", async () => {
      const res = await app.request("/api/sessions/hook/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "nonexistent-stop-session",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  // ── GET /api/sessions ────────────────────────────────────────

  describe("GET /api/sessions", () => {
    it("returns all sessions", async () => {
      const res = await app.request("/api/sessions");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.sessions)).toBe(true);
      expect(body.sessions.length).toBeGreaterThanOrEqual(2);
      expect(typeof body.total).toBe("number");
      expect(body.total).toBeGreaterThanOrEqual(2);
    });

    it("filters by status", async () => {
      const res = await app.request("/api/sessions?status=active");
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const session of body.sessions) {
        expect(session.status).toBe("active");
      }
    });

    it("filters by projectSlug", async () => {
      const res = await app.request(
        "/api/sessions?projectSlug=test-project"
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const session of body.sessions) {
        expect(session.projectSlug).toBe("test-project");
      }
      expect(body.sessions.length).toBeGreaterThanOrEqual(1);
    });

    it("filters by source", async () => {
      const res = await app.request("/api/sessions?source=claude-code");
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const session of body.sessions) {
        expect(session.source).toBe("claude-code");
      }
      expect(body.sessions.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Conflict Detection Integration ────────────────────────────

  describe("Conflict Detection Integration", () => {
    it("heartbeat with file overlap creates session_file_conflict finding", async () => {
      // Create two sessions on the same project
      await app.request("/api/sessions/hook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "conflict-int-a",
          cwd: "/test/project",
          model: "claude-opus-4-20250514",
        }),
      });

      // Heartbeat session A with a file
      await app.request("/api/sessions/hook/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "conflict-int-a",
          tool_input: { file_path: "/test/project/src/shared.ts" },
        }),
      });

      await app.request("/api/sessions/hook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "conflict-int-b",
          cwd: "/test/project",
          model: "claude-sonnet-4-20250514",
        }),
      });

      // Heartbeat session B with overlapping file
      await app.request("/api/sessions/hook/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "conflict-int-b",
          tool_input: { file_path: "/test/project/src/shared.ts" },
        }),
      });

      // Check for conflict finding in project_health
      const findings = getActiveFindings(instance.db, "test-project");
      const conflictFindings = findings.filter(
        (f) => f.checkType === "session_file_conflict"
      );
      expect(conflictFindings.length).toBeGreaterThanOrEqual(1);
      expect(conflictFindings[0]!.severity).toBe("warning");
    });
  });

  // ── Session Relationships ─────────────────────────────────────

  describe("Session Relationships", () => {
    it("includes relationships when filtering by projectSlug", async () => {
      const res = await app.request(
        "/api/sessions?projectSlug=test-project"
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.relationships).toBeDefined();
      expect(typeof body.relationships.activeCount).toBe("number");
      expect(typeof body.relationships.recentCompletedCount).toBe("number");
      expect(typeof body.relationships.summary).toBe("string");
    });

    it("does NOT include relationships without projectSlug filter", async () => {
      const res = await app.request("/api/sessions");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.relationships).toBeUndefined();
    });
  });
});
