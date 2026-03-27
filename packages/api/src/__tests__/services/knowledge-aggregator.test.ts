import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { MCConfig } from "../../lib/config.js";
import { getKnowledge, upsertKnowledge } from "../../db/queries/knowledge.js";
import { getActiveFindings } from "../../db/queries/health.js";
import type { ConventionRule } from "../../lib/config.js";

// Mock child_process before importing the module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// We need to dynamically import after mocking
const { execFile: execFileCb } = await import("node:child_process");
const execFileMock = vi.mocked(execFileCb);

// Import module under test (after mocks are set up)
const {
  computeContentHash,
  checkStaleKnowledge,
  buildScanTargets,
  scanAllKnowledge,
  startKnowledgeScan,
} = await import("../../services/knowledge-aggregator.js");

function makeConfig(overrides?: Partial<MCConfig>): MCConfig {
  return {
    projects: [],
    dataDir: "./data",
    services: [],
    macMiniSshHost: "mac-mini-host",
    modelTiers: [],
    budgetThresholds: {
      weeklyOpusHot: 20,
      weeklyOpusModerate: 10,
      weekResetDay: 5,
    },
    lmStudio: {
      url: "http://100.x.x.x:1234",
      targetModel: "qwen3-coder",
      probeIntervalMs: 30000,
    },
    discovery: {
      paths: ["~"],
      scanIntervalMinutes: 60,
      githubOrgs: [],
      starSyncIntervalHours: 6, sshEnabled: true,
    },
    conventions: [],
    ambientCapture: {},
    users: [],
    ...overrides,
  };
}

/**
 * Helper: simulate execFile resolving with stdout.
 * The mock intercepts promisified calls via callback pattern.
 */
function mockExecFileSuccess(stdout: string) {
  execFileMock.mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      if (typeof cb === "function") {
        (cb as (err: null, result: { stdout: string; stderr: string }) => void)(
          null,
          { stdout, stderr: "" }
        );
      }
      return {} as ReturnType<typeof execFileCb>;
    }
  );
}

function mockExecFileFailure(message: string) {
  execFileMock.mockImplementation(
    (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      if (typeof cb === "function") {
        (cb as (err: Error) => void)(new Error(message));
      }
      return {} as ReturnType<typeof execFileCb>;
    }
  );
}

describe("Knowledge Aggregator", () => {
  let instance: DatabaseInstance;

  beforeEach(() => {
    instance = createTestDb();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    instance.sqlite.close();
    vi.useRealTimers();
  });

  // ── computeContentHash ──────────────────────────────────────────

  describe("computeContentHash", () => {
    it("returns SHA-256 hex digest", () => {
      const hash = computeContentHash("# CLAUDE.md\n\nHello");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("normalizes CRLF to LF before hashing (Test 11)", () => {
      const hashLF = computeContentHash("line1\nline2\nline3");
      const hashCRLF = computeContentHash("line1\r\nline2\r\nline3");
      expect(hashLF).toBe(hashCRLF);
    });

    it("produces different hashes for different content", () => {
      const hash1 = computeContentHash("content A");
      const hash2 = computeContentHash("content B");
      expect(hash1).not.toBe(hash2);
    });
  });

  // ── checkStaleKnowledge ─────────────────────────────────────────

  describe("checkStaleKnowledge", () => {
    const now = new Date("2026-04-30T00:00:00Z");

    it("returns stale_knowledge finding when >30 days AND >10 commits (Test 7)", () => {
      const result = checkStaleKnowledge(
        "stale-proj",
        "2026-03-15T00:00:00Z", // 46 days old
        15,
        now
      );
      expect(result).not.toBeNull();
      expect(result!.projectSlug).toBe("stale-proj");
      expect(result!.checkType).toBe("stale_knowledge");
      expect(result!.severity).toBe("warning");
      expect(result!.detail).toContain("days");
      expect(result!.detail).toContain("commits");
    });

    it("returns null when only age threshold met (29 days + 15 commits = null) (Test 8 part 1)", () => {
      // 45 days + 5 commits: age met, commits not met
      const result = checkStaleKnowledge(
        "proj-a",
        "2026-03-16T00:00:00Z", // 45 days
        5, // only 5 commits
        now
      );
      expect(result).toBeNull();
    });

    it("returns null when only commit threshold met (29 days + 15 commits = null) (Test 8 part 2)", () => {
      // 29 days + 15 commits: commits met, age not met
      const result = checkStaleKnowledge(
        "proj-b",
        "2026-04-01T00:00:00Z", // 29 days
        15, // >10 commits
        now
      );
      expect(result).toBeNull();
    });

    it("returns null for fresh knowledge (0 days, 0 commits) (Test 9)", () => {
      const result = checkStaleKnowledge(
        "fresh-proj",
        "2026-04-30T00:00:00Z", // today
        0,
        now
      );
      expect(result).toBeNull();
    });
  });

  // ── buildScanTargets ────────────────────────────────────────────

  describe("buildScanTargets", () => {
    it("skips GitHub-only projects (Test 3)", () => {
      const config = makeConfig({
        projects: [
          {
            name: "GitHub Only",
            slug: "gh-only",
            path: "",
            host: "github",
            repo: "org/gh-only",
            dependsOn: [],
            conventionOverrides: [],
          },
          {
            name: "Local",
            slug: "local-proj",
            path: "/Users/test/local-proj",
            host: "local",
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
      });

      const targets = buildScanTargets(config);
      expect(targets.find((t) => t.slug === "gh-only")).toBeUndefined();
      expect(targets.find((t) => t.slug === "local-proj")).toBeDefined();
    });

    it("deduplicates multi-copy projects, preferring local (Test 10)", () => {
      const config = makeConfig({
        projects: [
          {
            name: "Multi",
            slug: "multi-proj",
            copies: [
              { host: "mac-mini", path: "/Users/ryanstern/multi-proj" },
              { host: "local", path: "/Users/test/multi-proj" },
            ],
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
      });

      const targets = buildScanTargets(config);
      const multiTargets = targets.filter((t) => t.slug === "multi-proj");
      expect(multiTargets).toHaveLength(1);
      expect(multiTargets[0]!.host).toBe("local");
      expect(multiTargets[0]!.path).toBe("/Users/test/multi-proj");
    });

    it("uses mac-mini copy when no local copy exists", () => {
      const config = makeConfig({
        projects: [
          {
            name: "Remote Only",
            slug: "remote-proj",
            copies: [
              { host: "mac-mini", path: "/Users/ryanstern/remote-proj" },
            ],
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
      });

      const targets = buildScanTargets(config);
      expect(targets).toHaveLength(1);
      expect(targets[0]!.host).toBe("mac-mini");
    });
  });

  // ── scanAllKnowledge ────────────────────────────────────────────

  describe("scanAllKnowledge", () => {
    it("reads CLAUDE.md from local project paths and stores content (Test 1)", async () => {
      const claudeMdContent = "# CLAUDE.md\n\nLocal project overview.";
      const lastModified = "2026-03-20T10:00:00Z";
      const delim = "===DELIM===";

      mockExecFileSuccess(
        `${claudeMdContent}${delim}${lastModified}${delim}3`
      );

      const config = makeConfig({
        projects: [
          {
            name: "Local Proj",
            slug: "local-proj",
            path: "/Users/test/local-proj",
            host: "local",
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
      });

      const stats = await scanAllKnowledge(config, instance.db, instance.sqlite);
      expect(stats.scanned).toBe(1);
      expect(stats.updated).toBe(1);
      expect(stats.errors).toBe(0);

      const knowledge = getKnowledge(instance.db, "local-proj");
      expect(knowledge).not.toBeNull();
      expect(knowledge!.content).toBe(claudeMdContent);
    });

    it("reads CLAUDE.md from Mac Mini projects via SSH (Test 2)", async () => {
      const claudeMdContent = "# CLAUDE.md\n\nMac Mini project.";
      const lastModified = "2026-03-18T08:00:00Z";
      const delim = "===DELIM===";

      mockExecFileSuccess(
        `${claudeMdContent}${delim}${lastModified}${delim}7`
      );

      const config = makeConfig({
        projects: [
          {
            name: "MM Proj",
            slug: "mm-proj",
            path: "/Users/ryanstern/mm-proj",
            host: "mac-mini",
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
      });

      const stats = await scanAllKnowledge(config, instance.db, instance.sqlite);
      expect(stats.scanned).toBe(1);
      expect(stats.updated).toBe(1);

      const knowledge = getKnowledge(instance.db, "mm-proj");
      expect(knowledge).not.toBeNull();
      expect(knowledge!.content).toBe(claudeMdContent);
    });

    it("content-hash caching: zero DB writes on unchanged file (Test 4)", async () => {
      const claudeMdContent = "# CLAUDE.md\n\nSame content.";
      const lastModified = "2026-03-20T10:00:00Z";
      const delim = "===DELIM===";

      mockExecFileSuccess(
        `${claudeMdContent}${delim}${lastModified}${delim}0`
      );

      const config = makeConfig({
        projects: [
          {
            name: "Cached",
            slug: "cached-proj",
            path: "/Users/test/cached",
            host: "local",
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
      });

      // First scan: inserts
      const stats1 = await scanAllKnowledge(config, instance.db, instance.sqlite);
      expect(stats1.updated).toBe(1);

      // Second scan: same content -> should NOT update
      const stats2 = await scanAllKnowledge(config, instance.db, instance.sqlite);
      expect(stats2.scanned).toBe(1);
      expect(stats2.updated).toBe(0);
    });

    it("content-hash caching: scanning changed file triggers DB write (Test 5)", async () => {
      const delim = "===DELIM===";

      // First scan
      mockExecFileSuccess(
        `Original content${delim}2026-03-20T10:00:00Z${delim}0`
      );

      const config = makeConfig({
        projects: [
          {
            name: "Changes",
            slug: "changing-proj",
            path: "/Users/test/changes",
            host: "local",
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
      });

      await scanAllKnowledge(config, instance.db, instance.sqlite);

      // Second scan with different content
      mockExecFileSuccess(
        `Updated content${delim}2026-03-21T12:00:00Z${delim}5`
      );

      const stats2 = await scanAllKnowledge(config, instance.db, instance.sqlite);
      expect(stats2.updated).toBe(1);

      const knowledge = getKnowledge(instance.db, "changing-proj");
      expect(knowledge!.content).toBe("Updated content");
    });

    it("SSH failure returns null and does not throw (Test 6)", async () => {
      mockExecFileFailure("Connection refused");

      const config = makeConfig({
        projects: [
          {
            name: "SSH Fail",
            slug: "ssh-fail",
            path: "/Users/ryanstern/ssh-fail",
            host: "mac-mini",
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
      });

      // Should NOT throw
      const stats = await scanAllKnowledge(config, instance.db, instance.sqlite);
      expect(stats.scanned).toBe(0);
      expect(stats.updated).toBe(0);
      expect(stats.errors).toBe(1);
    });

    it("GitHub-only projects are skipped entirely (Test 3 integration)", async () => {
      const delim = "===DELIM===";
      mockExecFileSuccess(
        `Local content${delim}2026-03-20T10:00:00Z${delim}0`
      );

      const config = makeConfig({
        projects: [
          {
            name: "GitHub Only",
            slug: "gh-only",
            path: "",
            host: "github",
            repo: "org/gh-only",
            dependsOn: [],
            conventionOverrides: [],
          },
          {
            name: "Local",
            slug: "local-proj",
            path: "/Users/test/local-proj",
            host: "local",
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
      });

      const stats = await scanAllKnowledge(config, instance.db, instance.sqlite);
      // Only local-proj should be scanned, gh-only skipped
      expect(stats.scanned).toBe(1);

      const ghKnowledge = getKnowledge(instance.db, "gh-only");
      expect(ghKnowledge).toBeNull();
    });

    it("multi-copy projects produce one knowledge record per slug (Test 10)", async () => {
      const delim = "===DELIM===";
      mockExecFileSuccess(
        `Multi content${delim}2026-03-20T10:00:00Z${delim}2`
      );

      const config = makeConfig({
        projects: [
          {
            name: "Multi",
            slug: "multi-proj",
            copies: [
              { host: "local", path: "/Users/test/multi-proj" },
              { host: "mac-mini", path: "/Users/ryanstern/multi-proj" },
            ],
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
      });

      const stats = await scanAllKnowledge(config, instance.db, instance.sqlite);
      expect(stats.scanned).toBe(1); // Only one target per slug
      expect(stats.updated).toBe(1);

      const knowledge = getKnowledge(instance.db, "multi-proj");
      expect(knowledge).not.toBeNull();
    });
  });

  // ── Convention Integration ───────────────────────────────────────

  describe("convention scanning integration", () => {
    const conventionRules: ConventionRule[] = [
      {
        id: "no-deprecated",
        pattern: "qwen3-8b",
        description: "Deprecated model reference",
        negativeContext: ["deprecated|replaced by"],
        severity: "warning",
        matchType: "must_not_match",
      },
      {
        id: "has-overview",
        pattern: "## Overview|## Architecture",
        description: "Missing overview section",
        negativeContext: [],
        severity: "info",
        matchType: "must_match",
      },
    ];

    it("convention violations are produced for matching content", async () => {
      // Seed knowledge directly (bypass scan to test convention pass)
      upsertKnowledge(instance.sqlite, {
        projectSlug: "conv-test",
        content: "# Project\n\nUsing qwen3-8b model.\n\nNo overview section.",
        contentHash: "abc123",
        fileSize: 50,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 0,
      });

      mockExecFileSuccess(""); // No scan targets needed

      const config = makeConfig({
        projects: [],
        conventions: conventionRules,
      });

      await scanAllKnowledge(config, instance.db, instance.sqlite);

      const findings = getActiveFindings(instance.db, "conv-test");
      const conventionFindings = findings.filter(
        (f) => f.checkType === "convention_violation"
      );
      expect(conventionFindings).toHaveLength(1);
      expect(conventionFindings[0]!.detail).toContain("no-deprecated");
      expect(conventionFindings[0]!.detail).toContain("has-overview");
      expect(conventionFindings[0]!.severity).toBe("warning"); // worst of warning + info
    });

    it("convention violations resolve when content is fixed", async () => {
      // Seed knowledge with violation
      upsertKnowledge(instance.sqlite, {
        projectSlug: "conv-fix",
        content: "# Project\n\nUsing qwen3-8b model.",
        contentHash: "bad1",
        fileSize: 30,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 0,
      });

      mockExecFileSuccess("");
      const config = makeConfig({ projects: [], conventions: conventionRules });

      // First scan: produces violation
      await scanAllKnowledge(config, instance.db, instance.sqlite);
      let findings = getActiveFindings(instance.db, "conv-fix");
      expect(findings.filter((f) => f.checkType === "convention_violation")).toHaveLength(1);

      // Fix the content
      upsertKnowledge(instance.sqlite, {
        projectSlug: "conv-fix",
        content: "# Project\n\n## Architecture\n\nUsing qwen3.5-35B model.",
        contentHash: "good1",
        fileSize: 50,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 0,
      });

      // Second scan: should resolve the violation
      await scanAllKnowledge(config, instance.db, instance.sqlite);
      findings = getActiveFindings(instance.db, "conv-fix");
      expect(findings.filter((f) => f.checkType === "convention_violation")).toHaveLength(0);
    });

    it("conventionOverrides suppress specific rules", async () => {
      upsertKnowledge(instance.sqlite, {
        projectSlug: "conv-override",
        content: "# Project\n\nUsing qwen3-8b model.\n\nNo overview section.",
        contentHash: "override1",
        fileSize: 50,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 0,
      });

      mockExecFileSuccess("");
      const config = makeConfig({
        projects: [
          {
            name: "Conv Override",
            slug: "conv-override",
            path: "/tmp/conv-override",
            host: "local",
            dependsOn: [],
            conventionOverrides: ["no-deprecated"],
          },
        ],
        conventions: conventionRules,
      });

      await scanAllKnowledge(config, instance.db, instance.sqlite);

      const findings = getActiveFindings(instance.db, "conv-override");
      const conventionFindings = findings.filter(
        (f) => f.checkType === "convention_violation"
      );
      // Only has-overview should fire (no-deprecated is overridden)
      expect(conventionFindings).toHaveLength(1);
      expect(conventionFindings[0]!.detail).toContain("has-overview");
      expect(conventionFindings[0]!.detail).not.toContain("no-deprecated");
    });

    it("empty conventions array means no convention checking (skip pass)", async () => {
      upsertKnowledge(instance.sqlite, {
        projectSlug: "conv-empty",
        content: "# Project\n\nUsing qwen3-8b model.",
        contentHash: "empty1",
        fileSize: 30,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 0,
      });

      mockExecFileSuccess("");
      const config = makeConfig({ projects: [], conventions: [] });

      await scanAllKnowledge(config, instance.db, instance.sqlite);

      const findings = getActiveFindings(instance.db, "conv-empty");
      const conventionFindings = findings.filter(
        (f) => f.checkType === "convention_violation"
      );
      expect(conventionFindings).toHaveLength(0);
    });

    it("resolveFindings calls preserve convention_violation findings", async () => {
      // Seed knowledge with convention violation
      upsertKnowledge(instance.sqlite, {
        projectSlug: "conv-preserve",
        content: "# Project\n\nUsing qwen3-8b model.",
        contentHash: "preserve1",
        fileSize: 30,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 0,
      });

      mockExecFileSuccess("");
      const config = makeConfig({
        projects: [
          {
            name: "Preserve Test",
            slug: "conv-preserve",
            path: "/tmp/conv-preserve",
            host: "local",
            dependsOn: [],
            conventionOverrides: [],
          },
        ],
        conventions: conventionRules,
      });

      // First scan: creates convention_violation
      await scanAllKnowledge(config, instance.db, instance.sqlite);
      let findings = getActiveFindings(instance.db, "conv-preserve");
      expect(findings.filter((f) => f.checkType === "convention_violation")).toHaveLength(1);

      // Second scan with same content (content-hash match triggers resolveFindings path)
      // The resolveFindings call should NOT clear convention_violation
      const delim = "===DELIM===";
      mockExecFileSuccess(
        `# Project\n\nUsing qwen3-8b model.${delim}${new Date().toISOString()}${delim}0`
      );

      await scanAllKnowledge(config, instance.db, instance.sqlite);
      findings = getActiveFindings(instance.db, "conv-preserve");
      // Convention violation should still be active (not resolved by resolveFindings)
      expect(findings.filter((f) => f.checkType === "convention_violation")).toHaveLength(1);
    });
  });

  // ── startKnowledgeScan ──────────────────────────────────────────

  describe("startKnowledgeScan", () => {
    it("returns interval handle (Test 12)", () => {
      const config = makeConfig({ projects: [] });

      // Mock to prevent actual scanning
      mockExecFileSuccess("");

      const timer = startKnowledgeScan(
        config,
        instance.db,
        instance.sqlite,
        60_000
      );
      expect(timer).toBeDefined();

      clearInterval(timer);
    });
  });
});
