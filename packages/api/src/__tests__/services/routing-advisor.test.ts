import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

// Mock the ai package before importing the module under test
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn(({ schema }: { schema: unknown }) => ({
      type: "object",
      schema,
    })),
  },
}));

// Mock LM Studio service
vi.mock("../../services/lm-studio.js", () => ({
  getLmStudioStatus: vi.fn(() => ({
    health: "unavailable",
    modelId: null,
    lastChecked: new Date(),
  })),
  createLmStudioProvider: vi.fn(() => vi.fn(() => "mocked-lm-studio-model")),
}));

import {
  computeTierStats,
  getRoutingSuggestion,
  buildRuleBasedSuggestion,
  routingSuggestionSchema,
  type TierStatsMap,
  type IntelligentRoutingSuggestion,
} from "../../services/routing-advisor.js";
import { getLmStudioStatus } from "../../services/lm-studio.js";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { sessions } from "../../db/schema.js";

const mockGetLmStudioStatus = vi.mocked(getLmStudioStatus);

// ── computeTierStats ──────────────────────────────────────────

describe("computeTierStats", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("returns all-zero stats for empty session list", () => {
    const stats = computeTierStats(instance.db, "nonexistent-project");
    expect(stats.opus.count).toBe(0);
    expect(stats.opus.avgDurationMinutes).toBe(0);
    expect(stats.opus.avgCommitCount).toBe(0);
    expect(stats.opus.avgFilesCount).toBe(0);
    expect(stats.sonnet.count).toBe(0);
    expect(stats.local.count).toBe(0);
  });

  it("returns correct tier stats from session data", () => {
    const db = instance.db;
    const now = new Date();
    const thirtyMinsAgo = new Date(now.getTime() - 30 * 60_000);

    // Insert completed sessions
    db.insert(sessions)
      .values({
        id: "routing-test-1",
        source: "claude-code",
        model: "claude-opus-4",
        tier: "opus",
        projectSlug: "test-routing",
        cwd: "/test",
        status: "completed",
        filesJson: JSON.stringify(["file1.ts", "file2.ts", "file3.ts"]),
        startedAt: thirtyMinsAgo,
        endedAt: now,
        createdAt: thirtyMinsAgo,
        updatedAt: now,
      })
      .run();

    db.insert(sessions)
      .values({
        id: "routing-test-2",
        source: "claude-code",
        model: "claude-sonnet-4",
        tier: "sonnet",
        projectSlug: "test-routing",
        cwd: "/test",
        status: "completed",
        filesJson: JSON.stringify(["a.ts"]),
        startedAt: thirtyMinsAgo,
        endedAt: now,
        createdAt: thirtyMinsAgo,
        updatedAt: now,
      })
      .run();

    const stats = computeTierStats(db, "test-routing");
    expect(stats.opus.count).toBe(1);
    expect(stats.opus.avgDurationMinutes).toBeGreaterThan(0);
    expect(stats.opus.avgFilesCount).toBe(3);
    expect(stats.sonnet.count).toBe(1);
    expect(stats.sonnet.avgFilesCount).toBe(1);
  });
});

// ── buildRuleBasedSuggestion ──────────────────────────────────

describe("buildRuleBasedSuggestion", () => {
  it("suggests sonnet when opus avg duration < 10min and < 3 files", () => {
    const stats: TierStatsMap = {
      opus: { count: 5, avgDurationMinutes: 8, avgCommitCount: 1, avgFilesCount: 2 },
      sonnet: { count: 0, avgDurationMinutes: 0, avgCommitCount: 0, avgFilesCount: 0 },
      local: { count: 0, avgDurationMinutes: 0, avgCommitCount: 0, avgFilesCount: 0 },
    };
    const result = buildRuleBasedSuggestion(stats, "moderate", false);
    expect(result).not.toBeNull();
    expect(result!.suggestedTier).toBe("sonnet");
    expect(result!.confidence).toBe("low");
    expect(result!.reason).toContain("lightweight");
  });

  it("suggests opus when sonnet avg duration > 30min and > 10 files", () => {
    const stats: TierStatsMap = {
      opus: { count: 0, avgDurationMinutes: 0, avgCommitCount: 0, avgFilesCount: 0 },
      sonnet: { count: 5, avgDurationMinutes: 35, avgCommitCount: 5, avgFilesCount: 12 },
      local: { count: 0, avgDurationMinutes: 0, avgCommitCount: 0, avgFilesCount: 0 },
    };
    const result = buildRuleBasedSuggestion(stats, "moderate", false);
    expect(result).not.toBeNull();
    expect(result!.suggestedTier).toBe("opus");
    expect(result!.confidence).toBe("low");
    expect(result!.reason).toContain("complex");
  });

  it("suggests local when available and tasks are simple", () => {
    const stats: TierStatsMap = {
      opus: { count: 2, avgDurationMinutes: 5, avgCommitCount: 1, avgFilesCount: 2 },
      sonnet: { count: 2, avgDurationMinutes: 5, avgCommitCount: 1, avgFilesCount: 3 },
      local: { count: 0, avgDurationMinutes: 0, avgCommitCount: 0, avgFilesCount: 0 },
    };
    const result = buildRuleBasedSuggestion(stats, "moderate", true);
    expect(result).not.toBeNull();
    // Should suggest local or sonnet when local is available and tasks are simple
    expect(["sonnet", "local"]).toContain(result!.suggestedTier);
  });
});

// ── routingSuggestionSchema ──────────────────────────────────

describe("routingSuggestionSchema", () => {
  it("validates correct structure", () => {
    const valid: IntelligentRoutingSuggestion = {
      suggestedTier: "sonnet",
      reason: "Recent sessions were lightweight",
      confidence: "medium",
      historicalContext: "5 opus sessions averaged 8 minutes",
    };
    const result = routingSuggestionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects invalid tier", () => {
    const invalid = {
      suggestedTier: "gpt4",
      reason: "test",
      confidence: "medium",
      historicalContext: null,
    };
    const result = routingSuggestionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("allows null historicalContext", () => {
    const valid = {
      suggestedTier: "opus",
      reason: "test",
      confidence: "low",
      historicalContext: null,
    };
    const result = routingSuggestionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

// ── getRoutingSuggestion ──────────────────────────────────────

describe("getRoutingSuggestion", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLmStudioStatus.mockReturnValue({
      health: "unavailable",
      modelId: null,
      lastChecked: new Date(),
    });
  });

  it("returns rule-based suggestion when LM Studio unavailable", () => {
    const db = instance.db;
    const now = new Date();
    const shortAgo = new Date(now.getTime() - 5 * 60_000);

    // Insert lightweight opus sessions
    for (let i = 0; i < 5; i++) {
      db.insert(sessions)
        .values({
          id: `rule-based-${i}`,
          source: "claude-code",
          model: "claude-opus-4",
          tier: "opus",
          projectSlug: "rule-test",
          cwd: "/test",
          status: "completed",
          filesJson: JSON.stringify(["f.ts"]),
          startedAt: shortAgo,
          endedAt: now,
          createdAt: shortAgo,
          updatedAt: now,
        })
        .run();
    }

    const result = getRoutingSuggestion(db, "rule-test");
    // Should return a suggestion (rule-based fallback)
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("low");
  });

  it("routing suggestion is advisory text, never a restriction", () => {
    const db = instance.db;
    const result = getRoutingSuggestion(db, "any-project");
    // Result is either null or has advisory fields -- never has a "block" or "restrict" field
    if (result) {
      expect(result).toHaveProperty("suggestedTier");
      expect(result).toHaveProperty("reason");
      expect(result).toHaveProperty("confidence");
      expect(result).not.toHaveProperty("restrict");
      expect(result).not.toHaveProperty("block");
      expect(result).not.toHaveProperty("enforce");
    }
  });
});
