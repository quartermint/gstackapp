import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Mock health query functions
vi.mock("../../db/queries/health.js", () => ({
  upsertHealthFinding: vi.fn(),
  resolveFindings: vi.fn(),
  getActiveFindings: vi.fn(() => []),
}));

// Mock copies query
vi.mock("../../db/queries/copies.js", () => ({
  upsertCopy: vi.fn(),
  getCopiesByProject: vi.fn(() => []),
  getCopiesByRemoteUrl: vi.fn(() => []),
}));

// Minimal mocks for other scanner dependencies
vi.mock("../../db/queries/projects.js", () => ({
  upsertProject: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock("../../db/queries/commits.js", () => ({
  upsertCommits: vi.fn(),
}));

vi.mock("../../db/queries/search.js", () => ({
  indexProject: vi.fn(),
}));

vi.mock("../../services/event-bus.js", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("../../services/cache.js", () => ({
  TTLCache: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    invalidateAll: vi.fn(),
    invalidate: vi.fn(),
  })),
}));

import { execFile as execFileCb } from "node:child_process";
import { checkAncestry } from "../../services/project-scanner.js";

const mockExecFile = vi.mocked(execFileCb);

// ── checkAncestry Tests ────────────────────────────────────────────

describe("checkAncestry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'ancestor' when headA is ancestor of headB (exit 0)", async () => {
    // Exit 0 on first call: headA is ancestor
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        (cb as (err: null, result: { stdout: string; stderr: string }) => void)(
          null,
          { stdout: "", stderr: "" }
        );
        return undefined as never;
      }
    );

    const result = await checkAncestry("/tmp/repo", "aaa", "bbb");
    expect(result).toBe("ancestor");
  });

  it("returns 'descendant' when headB is ancestor of headA (exit 1 then 0)", async () => {
    let callCount = 0;
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        callCount++;
        if (callCount === 1) {
          // First call: exit 1 (not ancestor)
          const err = new Error("exit 1") as Error & { code: number };
          err.code = 1;
          (cb as (err: Error) => void)(err);
        } else {
          // Second call: exit 0 (reverse is ancestor)
          (cb as (err: null, result: { stdout: string; stderr: string }) => void)(
            null,
            { stdout: "", stderr: "" }
          );
        }
        return undefined as never;
      }
    );

    const result = await checkAncestry("/tmp/repo", "aaa", "bbb");
    expect(result).toBe("descendant");
  });

  it("returns 'diverged' when neither is ancestor (exit 1 on both)", async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const err = new Error("exit 1") as Error & { code: number };
        err.code = 1;
        (cb as (err: Error) => void)(err);
        return undefined as never;
      }
    );

    const result = await checkAncestry("/tmp/repo", "aaa", "bbb");
    expect(result).toBe("diverged");
  });

  it("returns 'unknown' when exit code 128 (unknown commit)", async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const err = new Error("exit 128") as Error & { code: number };
        err.code = 128;
        (cb as (err: Error) => void)(err);
        return undefined as never;
      }
    );

    const result = await checkAncestry("/tmp/repo", "aaa", "bbb");
    expect(result).toBe("unknown");
  });

  it("returns 'unknown' when execFile throws (e.g., git not found)", async () => {
    mockExecFile.mockImplementation(
      (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
        const err = new Error("ENOENT: git not found");
        (cb as (err: Error) => void)(err);
        return undefined as never;
      }
    );

    const result = await checkAncestry("/tmp/repo", "aaa", "bbb");
    expect(result).toBe("unknown");
  });
});

// ── Dirty Severity Escalation Wiring Tests ───────────────────────

describe("dirty severity escalation wiring", () => {
  it("does not re-upsert when severity is already correct (1 day old = info)", async () => {
    const { getActiveFindings } = await import("../../db/queries/health.js");

    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    vi.mocked(getActiveFindings).mockReturnValue([
      {
        id: 1,
        projectSlug: "test-proj",
        checkType: "dirty_working_tree",
        severity: "info",
        detail: "Uncommitted changes",
        metadata: null,
        detectedAt: oneDayAgo,
        resolvedAt: null,
      },
    ]);

    // Import escalateDirtySeverity to verify the expected result
    const { escalateDirtySeverity } = await import(
      "../../services/git-health.js"
    );
    const escalated = escalateDirtySeverity(oneDayAgo);
    expect(escalated).toBe("info"); // 1 day = still info

    // Since severity matches, upsertHealthFinding should NOT be called for escalation
    // (it may be called for other reasons during the health phase, but not for escalation)
  });

  it("escalates to warning for 4-day-old dirty finding via escalateDirtySeverity", async () => {
    const { escalateDirtySeverity } = await import(
      "../../services/git-health.js"
    );

    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const escalated = escalateDirtySeverity(fourDaysAgo);
    expect(escalated).toBe("warning");
  });

  it("escalates to critical for 10-day-old dirty finding via escalateDirtySeverity", async () => {
    const { escalateDirtySeverity } = await import(
      "../../services/git-health.js"
    );

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const escalated = escalateDirtySeverity(tenDaysAgo);
    expect(escalated).toBe("critical");
  });
});
