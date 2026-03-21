import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { MCConfig } from "../../lib/config.js";
import { getKnowledge } from "../../db/queries/knowledge.js";

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
      starSyncIntervalHours: 6,
    },
    conventions: [],
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
