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

// Mock node-cron
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn((_expr: string, _fn: () => void) => ({
      stop: vi.fn(),
    })),
  },
}));

import {
  digestSchema,
  gatherDigestData,
  generateDailyDigest,
  getDigest,
  scheduleDigestGeneration,
  type DailyDigest,
} from "../../services/digest-generator.js";
import { getLmStudioStatus } from "../../services/lm-studio.js";
import { generateText } from "ai";
import cron from "node-cron";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { sessions, commits, captures } from "../../db/schema.js";

const mockGetLmStudioStatus = vi.mocked(getLmStudioStatus);
const mockGenerateText = vi.mocked(generateText);
const mockCronSchedule = vi.mocked(cron.schedule);

// ── digestSchema ──────────────────────────────────────────────

describe("digestSchema", () => {
  it("validates correct structure", () => {
    const valid: DailyDigest = {
      summary: "Active overnight development on mission-control",
      sections: [
        {
          title: "Stale Captures",
          items: ["2 captures older than 7 days"],
          priority: "high",
        },
      ],
      actionItems: ["Review stale captures", "Check dependency drift"],
      projectHighlights: [
        { slug: "mission-control", activity: "3 commits, 1 session" },
      ],
      generatedAt: new Date().toISOString(),
    };
    const result = digestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects missing summary", () => {
    const invalid = {
      sections: [],
      actionItems: [],
      projectHighlights: [],
      generatedAt: new Date().toISOString(),
    };
    const result = digestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid section priority", () => {
    const invalid = {
      summary: "test",
      sections: [{ title: "x", items: [], priority: "extreme" }],
      actionItems: [],
      projectHighlights: [],
      generatedAt: new Date().toISOString(),
    };
    const result = digestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ── gatherDigestData ──────────────────────────────────────────

describe("gatherDigestData", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("collects overnight commits, captures, and sessions", () => {
    const db = instance.db;
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);

    // Insert a commit
    db.insert(commits)
      .values({
        id: "digest-commit-1",
        hash: "abc1234",
        message: "feat: add digest",
        projectSlug: "test-project",
        authorDate: twoHoursAgo.toISOString(),
        createdAt: twoHoursAgo,
      })
      .run();

    // Insert a capture
    db.insert(captures)
      .values({
        id: "digest-capture-1",
        rawContent: "Need to fix the build",
        type: "text",
        status: "raw",
        sourceType: "manual",
        createdAt: twoHoursAgo,
        updatedAt: twoHoursAgo,
      })
      .run();

    // Insert a session
    db.insert(sessions)
      .values({
        id: "digest-session-1",
        source: "claude-code",
        tier: "opus",
        projectSlug: "test-project",
        cwd: "/test",
        status: "completed",
        startedAt: twoHoursAgo,
        endedAt: now,
        createdAt: twoHoursAgo,
        updatedAt: now,
      })
      .run();

    const since = new Date(now.getTime() - 24 * 60 * 60_000);
    const data = gatherDigestData(db, since);

    expect(data.commits.length).toBeGreaterThanOrEqual(1);
    expect(data.captures.length).toBeGreaterThanOrEqual(1);
    expect(data.sessions.length).toBeGreaterThanOrEqual(1);
    expect(data).toHaveProperty("findings");
  });

  it("returns empty arrays when no data in range", () => {
    const db = createTestDb().db;
    const since = new Date();
    const data = gatherDigestData(db, since);
    expect(data.commits).toHaveLength(0);
    expect(data.captures).toHaveLength(0);
    expect(data.sessions).toHaveLength(0);
  });
});

// ── generateDailyDigest ───────────────────────────────────────

describe("generateDailyDigest", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when LM Studio unavailable", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "unavailable",
      modelId: null,
      lastChecked: new Date(),
    });

    const result = await generateDailyDigest(instance.db);
    expect(result).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns structured digest when LM Studio ready", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder",
      lastChecked: new Date(),
    });

    const mockDigest: DailyDigest = {
      summary: "Overnight activity summary",
      sections: [
        { title: "Activity", items: ["3 commits"], priority: "medium" },
      ],
      actionItems: ["Review stale captures"],
      projectHighlights: [
        { slug: "mc", activity: "3 commits in 1 session" },
      ],
      generatedAt: new Date().toISOString(),
    };

    mockGenerateText.mockResolvedValue({
      output: mockDigest,
      text: "",
      reasoning: undefined,
      reasoningDetails: [],
      sources: [],
      files: [],
      steps: [],
      toolCalls: [],
      toolResults: [],
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      request: { body: "" },
      response: {
        id: "test",
        timestamp: new Date(),
        modelId: "test",
        headers: {},
        body: undefined,
      },
      warnings: [],
      providerMetadata: undefined,
      experimental_providerMetadata: undefined,
      responseMessages: [],
      roundtrips: [],
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await generateDailyDigest(instance.db);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe("Overnight activity summary");
    expect(result!.sections).toHaveLength(1);
    expect(result!.actionItems).toHaveLength(1);
  });
});

// ── getDigest ─────────────────────────────────────────────────

describe("getDigest", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("returns null when cache is empty", () => {
    const result = getDigest(instance.db);
    expect(result).toBeNull();
  });
});

// ── scheduleDigestGeneration ──────────────────────────────────

describe("scheduleDigestGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a stop function", () => {
    const instance = createTestDb();
    const scheduler = scheduleDigestGeneration(instance.db);
    expect(scheduler).toHaveProperty("stop");
    expect(typeof scheduler.stop).toBe("function");
  });

  it("uses default 6am cron expression", () => {
    const instance = createTestDb();
    scheduleDigestGeneration(instance.db);
    expect(mockCronSchedule).toHaveBeenCalledWith(
      "0 6 * * *",
      expect.any(Function)
    );
  });

  it("accepts custom cron expression", () => {
    const instance = createTestDb();
    scheduleDigestGeneration(instance.db, "30 7 * * *");
    expect(mockCronSchedule).toHaveBeenCalledWith(
      "30 7 * * *",
      expect.any(Function)
    );
  });
});
