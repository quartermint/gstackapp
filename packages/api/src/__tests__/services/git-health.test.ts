import { describe, it, expect } from "vitest";
import type { HealthFindingInput, HealthSeverity } from "@mission-control/shared";
import {
  type HealthScanData,
  checkNoRemote,
  checkBrokenTracking,
  checkRemoteBranchGone,
  checkUnpushedCommits,
  checkUnpulledCommits,
  checkDirtyWorkingTree,
  runHealthChecks,
  normalizeRemoteUrl,
  computeHealthScore,
  escalateDirtySeverity,
} from "../../services/git-health.js";

/** Helper to construct HealthScanData with sensible defaults */
function makeScanData(overrides: Partial<HealthScanData> = {}): HealthScanData {
  return {
    slug: "test-project",
    branch: "main",
    dirty: false,
    remoteUrl: "git@github.com:owner/repo.git",
    hasRemote: true,
    isDetachedHead: false,
    hasUpstream: true,
    upstreamGone: false,
    unpushedCount: 0,
    unpulledCount: 0,
    headCommit: "abc1234",
    isPublic: false,
    ...overrides,
  };
}

// ── checkNoRemote ─────────────────────────────────────────────────

describe("checkNoRemote", () => {
  it("returns critical finding when hasRemote is false", () => {
    const data = makeScanData({ hasRemote: false, remoteUrl: null });
    const result = checkNoRemote(data);
    expect(result).not.toBeNull();
    expect(result!.checkType).toBe("no_remote");
    expect(result!.severity).toBe("critical");
    expect(result!.projectSlug).toBe("test-project");
  });

  it("returns null when hasRemote is true", () => {
    const data = makeScanData({ hasRemote: true });
    const result = checkNoRemote(data);
    expect(result).toBeNull();
  });
});

// ── checkBrokenTracking ───────────────────────────────────────────

describe("checkBrokenTracking", () => {
  it("returns critical finding when has remote, not detached, no upstream, not gone", () => {
    const data = makeScanData({
      hasRemote: true,
      isDetachedHead: false,
      hasUpstream: false,
      upstreamGone: false,
      branch: "feature-x",
    });
    const result = checkBrokenTracking(data);
    expect(result).not.toBeNull();
    expect(result!.checkType).toBe("broken_tracking");
    expect(result!.severity).toBe("critical");
    expect(result!.detail).toContain("feature-x");
  });

  it("returns null when no remote", () => {
    const data = makeScanData({ hasRemote: false });
    const result = checkBrokenTracking(data);
    expect(result).toBeNull();
  });

  it("returns null when detached HEAD", () => {
    const data = makeScanData({ isDetachedHead: true, hasUpstream: false });
    const result = checkBrokenTracking(data);
    expect(result).toBeNull();
  });

  it("returns null when has upstream", () => {
    const data = makeScanData({ hasUpstream: true });
    const result = checkBrokenTracking(data);
    expect(result).toBeNull();
  });

  it("returns null when upstream is gone", () => {
    const data = makeScanData({ hasUpstream: false, upstreamGone: true });
    const result = checkBrokenTracking(data);
    expect(result).toBeNull();
  });
});

// ── checkRemoteBranchGone ─────────────────────────────────────────

describe("checkRemoteBranchGone", () => {
  it("returns critical finding when upstreamGone is true", () => {
    const data = makeScanData({ upstreamGone: true });
    const result = checkRemoteBranchGone(data);
    expect(result).not.toBeNull();
    expect(result!.checkType).toBe("remote_branch_gone");
    expect(result!.severity).toBe("critical");
  });

  it("returns null when upstreamGone is false", () => {
    const data = makeScanData({ upstreamGone: false });
    const result = checkRemoteBranchGone(data);
    expect(result).toBeNull();
  });
});

// ── checkUnpushedCommits ──────────────────────────────────────────

describe("checkUnpushedCommits", () => {
  it("returns null when no remote", () => {
    const data = makeScanData({ hasRemote: false, unpushedCount: 5 });
    expect(checkUnpushedCommits(data)).toBeNull();
  });

  it("returns null when detached HEAD", () => {
    const data = makeScanData({ isDetachedHead: true, unpushedCount: 5 });
    expect(checkUnpushedCommits(data)).toBeNull();
  });

  it("returns null when no upstream", () => {
    const data = makeScanData({ hasUpstream: false, unpushedCount: 5 });
    expect(checkUnpushedCommits(data)).toBeNull();
  });

  it("returns null when upstream gone", () => {
    const data = makeScanData({ upstreamGone: true, unpushedCount: 5 });
    expect(checkUnpushedCommits(data)).toBeNull();
  });

  it("returns null when unpushedCount is 0", () => {
    const data = makeScanData({ unpushedCount: 0 });
    expect(checkUnpushedCommits(data)).toBeNull();
  });

  it("returns warning for 3 unpushed, private repo", () => {
    const data = makeScanData({ unpushedCount: 3, isPublic: false });
    const result = checkUnpushedCommits(data);
    expect(result).not.toBeNull();
    expect(result!.checkType).toBe("unpushed_commits");
    expect(result!.severity).toBe("warning");
    expect(result!.detail).toContain("3");
  });

  it("returns critical for 3 unpushed, public repo (HLTH-07 escalation)", () => {
    const data = makeScanData({ unpushedCount: 3, isPublic: true });
    const result = checkUnpushedCommits(data);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("critical");
    expect(result!.detail).toContain("public repo");
  });

  it("returns critical for 8 unpushed, private repo (6+ threshold)", () => {
    const data = makeScanData({ unpushedCount: 8, isPublic: false });
    const result = checkUnpushedCommits(data);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("critical");
  });

  it("returns critical for 8 unpushed, public repo", () => {
    const data = makeScanData({ unpushedCount: 8, isPublic: true });
    const result = checkUnpushedCommits(data);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("critical");
  });

  it("returns warning for exactly 5 unpushed, private repo", () => {
    const data = makeScanData({ unpushedCount: 5, isPublic: false });
    const result = checkUnpushedCommits(data);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("warning");
  });

  it("returns critical for exactly 6 unpushed, private repo (threshold)", () => {
    const data = makeScanData({ unpushedCount: 6, isPublic: false });
    const result = checkUnpushedCommits(data);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("critical");
  });
});

// ── checkUnpulledCommits ──────────────────────────────────────────

describe("checkUnpulledCommits", () => {
  it("returns null when no remote", () => {
    const data = makeScanData({ hasRemote: false, unpulledCount: 5 });
    expect(checkUnpulledCommits(data)).toBeNull();
  });

  it("returns null when detached HEAD", () => {
    const data = makeScanData({ isDetachedHead: true, unpulledCount: 5 });
    expect(checkUnpulledCommits(data)).toBeNull();
  });

  it("returns null when no upstream", () => {
    const data = makeScanData({ hasUpstream: false, unpulledCount: 5 });
    expect(checkUnpulledCommits(data)).toBeNull();
  });

  it("returns null when upstream gone", () => {
    const data = makeScanData({ upstreamGone: true, unpulledCount: 5 });
    expect(checkUnpulledCommits(data)).toBeNull();
  });

  it("returns null when unpulledCount is 0", () => {
    const data = makeScanData({ unpulledCount: 0 });
    expect(checkUnpulledCommits(data)).toBeNull();
  });

  it("returns warning for 5 unpulled commits", () => {
    const data = makeScanData({ unpulledCount: 5 });
    const result = checkUnpulledCommits(data);
    expect(result).not.toBeNull();
    expect(result!.checkType).toBe("unpulled_commits");
    expect(result!.severity).toBe("warning");
    expect(result!.detail).toContain("5");
  });
});

// ── checkDirtyWorkingTree ─────────────────────────────────────────

describe("checkDirtyWorkingTree", () => {
  it("returns null when dirty is false", () => {
    const data = makeScanData({ dirty: false });
    expect(checkDirtyWorkingTree(data)).toBeNull();
  });

  it("returns info finding when dirty is true", () => {
    const data = makeScanData({ dirty: true });
    const result = checkDirtyWorkingTree(data);
    expect(result).not.toBeNull();
    expect(result!.checkType).toBe("dirty_working_tree");
    expect(result!.severity).toBe("info");
  });
});

// ── escalateDirtySeverity ─────────────────────────────────────────

describe("escalateDirtySeverity", () => {
  it("returns info for 1 hour ago", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
    expect(escalateDirtySeverity(detectedAt, now)).toBe("info");
  });

  it("returns info for 2 days ago", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(escalateDirtySeverity(detectedAt, now)).toBe("info");
  });

  it("returns warning for 3 days ago", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(escalateDirtySeverity(detectedAt, now)).toBe("warning");
  });

  it("returns warning for 5 days ago", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(escalateDirtySeverity(detectedAt, now)).toBe("warning");
  });

  it("returns critical for 7 days ago", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(escalateDirtySeverity(detectedAt, now)).toBe("critical");
  });

  it("returns critical for 30 days ago", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(escalateDirtySeverity(detectedAt, now)).toBe("critical");
  });

  it("returns info for invalid date string", () => {
    expect(escalateDirtySeverity("invalid")).toBe("info");
  });
});

// ── normalizeRemoteUrl ────────────────────────────────────────────

describe("normalizeRemoteUrl", () => {
  it("normalizes SSH URL with .git suffix", () => {
    expect(normalizeRemoteUrl("git@github.com:owner/repo.git")).toBe(
      "github.com/owner/repo"
    );
  });

  it("normalizes HTTPS URL with .git suffix", () => {
    expect(normalizeRemoteUrl("https://github.com/owner/repo.git")).toBe(
      "github.com/owner/repo"
    );
  });

  it("normalizes SSH URL without .git suffix", () => {
    expect(normalizeRemoteUrl("git@github.com:owner/repo")).toBe(
      "github.com/owner/repo"
    );
  });

  it("normalizes HTTPS URL without .git suffix", () => {
    expect(normalizeRemoteUrl("https://github.com/owner/repo")).toBe(
      "github.com/owner/repo"
    );
  });

  it("is case insensitive", () => {
    expect(normalizeRemoteUrl("Git@GitHub.com:Owner/Repo.git")).toBe(
      "github.com/owner/repo"
    );
  });

  it("strips trailing slash", () => {
    expect(normalizeRemoteUrl("https://github.com/owner/repo/")).toBe(
      "github.com/owner/repo"
    );
  });

  it("SSH and HTTPS produce identical output", () => {
    const ssh = normalizeRemoteUrl("git@github.com:owner/repo.git");
    const https = normalizeRemoteUrl("https://github.com/owner/repo.git");
    expect(ssh).toBe(https);
  });
});

// ── computeHealthScore ────────────────────────────────────────────

describe("computeHealthScore", () => {
  it("returns 100 for empty findings", () => {
    expect(computeHealthScore([])).toBe(100);
  });

  it("returns 100 for only info findings", () => {
    const findings: HealthFindingInput[] = [
      {
        projectSlug: "test",
        checkType: "dirty_working_tree",
        severity: "info",
        detail: "Uncommitted changes",
      },
    ];
    expect(computeHealthScore(findings)).toBe(100);
  });

  it("returns 60 for worst severity = warning", () => {
    const findings: HealthFindingInput[] = [
      {
        projectSlug: "test",
        checkType: "unpushed_commits",
        severity: "warning",
        detail: "3 unpushed commits",
      },
      {
        projectSlug: "test",
        checkType: "dirty_working_tree",
        severity: "info",
        detail: "Uncommitted changes",
      },
    ];
    expect(computeHealthScore(findings)).toBe(60);
  });

  it("returns 20 for worst severity = critical", () => {
    const findings: HealthFindingInput[] = [
      {
        projectSlug: "test",
        checkType: "no_remote",
        severity: "critical",
        detail: "No remote configured",
      },
    ];
    expect(computeHealthScore(findings)).toBe(20);
  });
});

// ── runHealthChecks (orchestrator) ────────────────────────────────

describe("runHealthChecks", () => {
  it("short-circuits with no_remote when hasRemote is false", () => {
    const data = makeScanData({ hasRemote: false, dirty: true, remoteUrl: null });
    const findings = runHealthChecks(data);
    // Should contain no_remote and dirty_working_tree (always runs)
    expect(findings.some((f) => f.checkType === "no_remote")).toBe(true);
    expect(findings.some((f) => f.checkType === "dirty_working_tree")).toBe(true);
    // Should NOT contain any upstream-dependent checks
    expect(findings.some((f) => f.checkType === "unpushed_commits")).toBe(false);
    expect(findings.some((f) => f.checkType === "unpulled_commits")).toBe(false);
    expect(findings.some((f) => f.checkType === "broken_tracking")).toBe(false);
  });

  it("skips upstream checks when detached HEAD", () => {
    const data = makeScanData({
      isDetachedHead: true,
      hasUpstream: false,
      unpushedCount: 5,
      unpulledCount: 3,
    });
    const findings = runHealthChecks(data);
    expect(findings.some((f) => f.checkType === "unpushed_commits")).toBe(false);
    expect(findings.some((f) => f.checkType === "unpulled_commits")).toBe(false);
    expect(findings.some((f) => f.checkType === "broken_tracking")).toBe(false);
  });

  it("includes broken_tracking when no upstream configured", () => {
    const data = makeScanData({ hasUpstream: false, upstreamGone: false });
    const findings = runHealthChecks(data);
    expect(findings.some((f) => f.checkType === "broken_tracking")).toBe(true);
  });

  it("includes remote_branch_gone when upstream is gone", () => {
    const data = makeScanData({ upstreamGone: true });
    const findings = runHealthChecks(data);
    expect(findings.some((f) => f.checkType === "remote_branch_gone")).toBe(true);
  });

  it("returns empty array for a fully healthy repo", () => {
    const data = makeScanData();
    const findings = runHealthChecks(data);
    expect(findings).toHaveLength(0);
  });

  it("includes all applicable findings for a repo with multiple issues", () => {
    const data = makeScanData({
      dirty: true,
      unpushedCount: 3,
      unpulledCount: 2,
    });
    const findings = runHealthChecks(data);
    expect(findings.some((f) => f.checkType === "dirty_working_tree")).toBe(true);
    expect(findings.some((f) => f.checkType === "unpushed_commits")).toBe(true);
    expect(findings.some((f) => f.checkType === "unpulled_commits")).toBe(true);
  });

  it("skips unpushed/unpulled when broken tracking", () => {
    const data = makeScanData({
      hasUpstream: false,
      upstreamGone: false,
      unpushedCount: 5,
      unpulledCount: 3,
    });
    const findings = runHealthChecks(data);
    expect(findings.some((f) => f.checkType === "broken_tracking")).toBe(true);
    expect(findings.some((f) => f.checkType === "unpushed_commits")).toBe(false);
    expect(findings.some((f) => f.checkType === "unpulled_commits")).toBe(false);
  });

  it("dirty working tree always runs regardless of remote state", () => {
    const data = makeScanData({
      hasRemote: false,
      dirty: true,
      remoteUrl: null,
    });
    const findings = runHealthChecks(data);
    expect(findings.some((f) => f.checkType === "dirty_working_tree")).toBe(true);
  });
});
