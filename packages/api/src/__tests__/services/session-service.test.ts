import { describe, it, expect, afterAll, beforeAll } from "vitest";
import {
  resolveProjectFromCwd,
  shouldDebounceHeartbeat,
  recordHeartbeat,
  clearHeartbeatDebounce,
  bufferFile,
  getBufferedFiles,
  reapAbandonedSessions,
} from "../../services/session-service.js";
import { createSession, getSession } from "../../db/queries/sessions.js";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { MCConfig } from "../../lib/config.js";

// ── Project Resolution ───────────────────────────────────────────

describe("resolveProjectFromCwd", () => {
  const testConfig: MCConfig = {
    projects: [
      {
        name: "Mission Control",
        slug: "mission-control",
        path: "/Users/ryanstern/mission-control",
        host: "local" as const,
      },
      {
        name: "NexusClaw",
        slug: "nexusclaw",
        path: "/Users/ryanstern/nexusclaw",
        host: "local" as const,
      },
      {
        name: "LifeVault",
        slug: "lifevault",
        copies: [
          { host: "local" as const, path: "/Users/ryanstern/lifevault" },
          { host: "mac-mini" as const, path: "/opt/services/lifevault" },
        ],
      },
    ],
    dataDir: "./data",
    services: [],
    macMiniSshHost: "mac-mini-host",
    modelTiers: [],
    budgetThresholds: { weeklyOpusHot: 20, weeklyOpusModerate: 10, weekResetDay: 5 },
    lmStudio: { url: "http://100.x.x.x:1234", targetModel: "qwen3-coder", probeIntervalMs: 30000 },
  };

  it("returns slug for exact path match", () => {
    const result = resolveProjectFromCwd(
      "/Users/ryanstern/mission-control",
      testConfig
    );
    expect(result).toBe("mission-control");
  });

  it("returns slug for prefix match (subdirectory)", () => {
    const result = resolveProjectFromCwd(
      "/Users/ryanstern/mission-control/packages/api",
      testConfig
    );
    expect(result).toBe("mission-control");
  });

  it("returns null for unrecognized cwd", () => {
    const result = resolveProjectFromCwd(
      "/Users/ryanstern/unknown-project",
      testConfig
    );
    expect(result).toBeNull();
  });

  it("returns longest match for nested projects", () => {
    const nestedConfig: MCConfig = {
      ...testConfig,
      projects: [
        ...testConfig.projects,
        {
          name: "MC API",
          slug: "mc-api",
          path: "/Users/ryanstern/mission-control/packages/api",
          host: "local" as const,
        },
      ],
    };

    const result = resolveProjectFromCwd(
      "/Users/ryanstern/mission-control/packages/api/src",
      nestedConfig
    );
    expect(result).toBe("mc-api");
  });

  it("resolves multi-copy project paths", () => {
    const result = resolveProjectFromCwd(
      "/Users/ryanstern/lifevault/src",
      testConfig
    );
    expect(result).toBe("lifevault");
  });

  it("resolves multi-copy Mac Mini paths", () => {
    const result = resolveProjectFromCwd(
      "/opt/services/lifevault/data",
      testConfig
    );
    expect(result).toBe("lifevault");
  });

  it("returns null for empty config", () => {
    const emptyConfig: MCConfig = {
      ...testConfig,
      projects: [],
    };
    const result = resolveProjectFromCwd("/Users/ryanstern/anything", emptyConfig);
    expect(result).toBeNull();
  });
});

// ── Heartbeat Debounce ───────────────────────────────────────────

describe("shouldDebounceHeartbeat + recordHeartbeat", () => {
  it("returns false for first heartbeat", () => {
    const result = shouldDebounceHeartbeat("debounce-new-session");
    expect(result).toBe(false);
  });

  it("returns true within debounce window after recordHeartbeat", () => {
    recordHeartbeat("debounce-sess-1");
    const result = shouldDebounceHeartbeat("debounce-sess-1");
    expect(result).toBe(true);
  });

  it("clearHeartbeatDebounce resets debounce", () => {
    recordHeartbeat("debounce-sess-2");
    clearHeartbeatDebounce("debounce-sess-2");
    const result = shouldDebounceHeartbeat("debounce-sess-2");
    expect(result).toBe(false);
  });

  it("different sessions have independent debounce", () => {
    recordHeartbeat("debounce-sess-a");
    const result = shouldDebounceHeartbeat("debounce-sess-b");
    expect(result).toBe(false);
  });
});

// ── File Buffering ───────────────────────────────────────────────

describe("bufferFile + getBufferedFiles", () => {
  it("buffers file and retrieves it", () => {
    bufferFile("buf-s1", "/a.ts");
    const files = getBufferedFiles("buf-s1");
    expect(files).toEqual(["/a.ts"]);
  });

  it("getBufferedFiles clears buffer", () => {
    bufferFile("buf-s2", "/b.ts");
    getBufferedFiles("buf-s2");
    const files = getBufferedFiles("buf-s2");
    expect(files).toEqual([]);
  });

  it("deduplicates files", () => {
    bufferFile("buf-s3", "/c.ts");
    bufferFile("buf-s3", "/c.ts");
    const files = getBufferedFiles("buf-s3");
    expect(files).toHaveLength(1);
  });

  it("returns empty for unknown session", () => {
    const files = getBufferedFiles("buf-unknown");
    expect(files).toEqual([]);
  });
});

// ── Session Reaper ───────────────────────────────────────────────

describe("reapAbandonedSessions", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("marks stale active sessions as abandoned", () => {
    // Create a session
    createSession(instance.db, {
      sessionId: "reaper-stale-001",
      source: "claude-code",
      model: "claude-opus-4-20250514",
      cwd: "/tmp/test",
    });

    // Manually set startedAt to 20 minutes ago (integer timestamp in ms / 1000 for Drizzle timestamp mode)
    const twentyMinAgoMs = Date.now() - 20 * 60 * 1000;
    const twentyMinAgoSec = Math.floor(twentyMinAgoMs / 1000);
    instance.sqlite
      .prepare(
        `UPDATE sessions SET started_at = ?, last_heartbeat_at = NULL WHERE id = ?`
      )
      .run(twentyMinAgoSec, "reaper-stale-001");

    const reaped = reapAbandonedSessions(instance.db);
    expect(reaped).toBeGreaterThanOrEqual(1);

    const session = getSession(instance.db, "reaper-stale-001");
    expect(session.status).toBe("abandoned");
  });

  it("does not reap recent active sessions", () => {
    createSession(instance.db, {
      sessionId: "reaper-recent-001",
      source: "claude-code",
      model: "claude-opus-4-20250514",
      cwd: "/tmp/test",
    });

    reapAbandonedSessions(instance.db);

    const session = getSession(instance.db, "reaper-recent-001");
    expect(session.status).toBe("active");
  });

  it("does not reap completed sessions", () => {
    createSession(instance.db, {
      sessionId: "reaper-completed-001",
      source: "claude-code",
      model: "claude-opus-4-20250514",
      cwd: "/tmp/test",
    });

    // Mark as completed first
    const nowSec = Math.floor(Date.now() / 1000);
    instance.sqlite
      .prepare(
        `UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?`
      )
      .run(nowSec, "reaper-completed-001");

    // Set startedAt to 20 minutes ago (would be reaped if it were active)
    const twentyMinAgoSec = Math.floor((Date.now() - 20 * 60 * 1000) / 1000);
    instance.sqlite
      .prepare(`UPDATE sessions SET started_at = ? WHERE id = ?`)
      .run(twentyMinAgoSec, "reaper-completed-001");

    reapAbandonedSessions(instance.db);

    const session = getSession(instance.db, "reaper-completed-001");
    expect(session.status).toBe("completed");
  });
});
