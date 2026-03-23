import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

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

// Mock embedding service
vi.mock("../../services/embedding.js", () => ({
  computeContentHash: vi.fn((text: string) => `hash-${text.length}`),
}));

import {
  isSignificantSession,
  buildSessionSignal,
  buildSolutionContent,
  buildTitle,
  extractSolutionMetadata,
  type SessionSignal,
} from "../../services/solution-extractor.js";
import { getLmStudioStatus } from "../../services/lm-studio.js";
import { generateText } from "ai";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";

const mockGetLmStudioStatus = vi.mocked(getLmStudioStatus);
const mockGenerateText = vi.mocked(generateText);

// ── isSignificantSession ────────────────────────────────────────

describe("isSignificantSession", () => {
  it("returns false when projectSlug is null", () => {
    const signal: SessionSignal = {
      durationMinutes: 30,
      filesCount: 10,
      commitCount: 5,
      projectSlug: null,
    };
    expect(isSignificantSession(signal)).toBe(false);
  });

  it("returns false when duration < 5 minutes", () => {
    const signal: SessionSignal = {
      durationMinutes: 3,
      filesCount: 10,
      commitCount: 5,
      projectSlug: "mission-control",
    };
    expect(isSignificantSession(signal)).toBe(false);
  });

  it("returns false when filesCount < 3 AND commitCount === 0", () => {
    const signal: SessionSignal = {
      durationMinutes: 10,
      filesCount: 2,
      commitCount: 0,
      projectSlug: "mission-control",
    };
    expect(isSignificantSession(signal)).toBe(false);
  });

  it("returns true when commitCount >= 1 AND duration >= 5", () => {
    const signal: SessionSignal = {
      durationMinutes: 5,
      filesCount: 1,
      commitCount: 1,
      projectSlug: "mission-control",
    };
    expect(isSignificantSession(signal)).toBe(true);
  });

  it("returns true when duration >= 30 AND filesCount >= 5", () => {
    const signal: SessionSignal = {
      durationMinutes: 30,
      filesCount: 5,
      commitCount: 0,
      projectSlug: "mission-control",
    };
    expect(isSignificantSession(signal)).toBe(true);
  });

  it("returns true when filesCount >= 10 AND duration >= 5", () => {
    const signal: SessionSignal = {
      durationMinutes: 6,
      filesCount: 10,
      commitCount: 0,
      projectSlug: "mission-control",
    };
    expect(isSignificantSession(signal)).toBe(true);
  });

  it("returns false when no significance criteria are met", () => {
    const signal: SessionSignal = {
      durationMinutes: 10,
      filesCount: 4,
      commitCount: 0,
      projectSlug: "mission-control",
    };
    expect(isSignificantSession(signal)).toBe(false);
  });

  it("returns false at exact duration boundary (4.9 minutes)", () => {
    const signal: SessionSignal = {
      durationMinutes: 4.9,
      filesCount: 20,
      commitCount: 10,
      projectSlug: "mission-control",
    };
    expect(isSignificantSession(signal)).toBe(false);
  });
});

// ── buildSessionSignal ─────────────────────────────────────────

describe("buildSessionSignal", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("computes correct durationMinutes from startedAt/endedAt", () => {
    const startedAt = new Date("2026-03-20T10:00:00Z");
    const endedAt = new Date("2026-03-20T10:30:00Z");

    const signal = buildSessionSignal(instance.db, {
      id: "sig-test-1",
      projectSlug: "mission-control",
      filesJson: null,
      startedAt,
      endedAt,
    });

    expect(signal.durationMinutes).toBe(30);
  });

  it("parses filesJson to get filesCount", () => {
    const startedAt = new Date("2026-03-20T10:00:00Z");
    const endedAt = new Date("2026-03-20T10:30:00Z");

    const signal = buildSessionSignal(instance.db, {
      id: "sig-test-2",
      projectSlug: "mission-control",
      filesJson: JSON.stringify(["a.ts", "b.ts", "c.ts"]),
      startedAt,
      endedAt,
    });

    expect(signal.filesCount).toBe(3);
  });

  it("returns filesCount 0 for null filesJson", () => {
    const startedAt = new Date("2026-03-20T10:00:00Z");
    const endedAt = new Date("2026-03-20T10:30:00Z");

    const signal = buildSessionSignal(instance.db, {
      id: "sig-test-3",
      projectSlug: "mission-control",
      filesJson: null,
      startedAt,
      endedAt,
    });

    expect(signal.filesCount).toBe(0);
  });

  it("queries commits table for commitCount in session time range", () => {
    // Insert test commits within the session time range
    const startedAt = new Date("2026-03-20T10:00:00Z");
    const endedAt = new Date("2026-03-20T10:30:00Z");
    const nowSec = Math.floor(Date.now() / 1000);

    instance.sqlite
      .prepare(
        `INSERT OR IGNORE INTO commits (id, hash, message, project_slug, author_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "commit-sig-1",
        "abc123",
        "feat: add feature",
        "mission-control",
        "2026-03-20T10:15:00Z",
        nowSec
      );

    instance.sqlite
      .prepare(
        `INSERT OR IGNORE INTO commits (id, hash, message, project_slug, author_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "commit-sig-2",
        "def456",
        "fix: bug fix",
        "mission-control",
        "2026-03-20T10:20:00Z",
        nowSec
      );

    // A commit outside the range
    instance.sqlite
      .prepare(
        `INSERT OR IGNORE INTO commits (id, hash, message, project_slug, author_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "commit-sig-3",
        "ghi789",
        "chore: outside range",
        "mission-control",
        "2026-03-20T11:00:00Z",
        nowSec
      );

    const signal = buildSessionSignal(instance.db, {
      id: "sig-test-4",
      projectSlug: "mission-control",
      filesJson: null,
      startedAt,
      endedAt,
    });

    expect(signal.commitCount).toBe(2);
  });

  it("returns commitCount 0 when no commits in range", () => {
    const startedAt = new Date("2026-01-01T00:00:00Z");
    const endedAt = new Date("2026-01-01T00:30:00Z");

    const signal = buildSessionSignal(instance.db, {
      id: "sig-test-5",
      projectSlug: "nonexistent-project",
      filesJson: null,
      startedAt,
      endedAt,
    });

    expect(signal.commitCount).toBe(0);
  });

  it("preserves projectSlug from session", () => {
    const startedAt = new Date("2026-03-20T10:00:00Z");
    const endedAt = new Date("2026-03-20T10:30:00Z");

    const signal = buildSessionSignal(instance.db, {
      id: "sig-test-6",
      projectSlug: "openefb",
      filesJson: null,
      startedAt,
      endedAt,
    });

    expect(signal.projectSlug).toBe("openefb");
  });

  it("handles null endedAt by using current time", () => {
    const startedAt = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago

    const signal = buildSessionSignal(instance.db, {
      id: "sig-test-7",
      projectSlug: "mission-control",
      filesJson: null,
      startedAt,
      endedAt: null,
    });

    // Should be approximately 10 minutes
    expect(signal.durationMinutes).toBeGreaterThanOrEqual(9);
    expect(signal.durationMinutes).toBeLessThanOrEqual(11);
  });
});

// ── buildSolutionContent ───────────────────────────────────────

describe("buildSolutionContent", () => {
  it("formats content with project, duration, files, commits, and file list", () => {
    const commits = [
      { message: "feat: add login page" },
      { message: "fix: correct auth redirect" },
    ];
    const files = ["src/auth/login.tsx", "src/auth/redirect.ts"];
    const session = {
      projectSlug: "mission-control",
      startedAt: new Date("2026-03-20T10:00:00Z"),
      endedAt: new Date("2026-03-20T10:30:00Z"),
    };

    const content = buildSolutionContent(commits, files, session);

    expect(content).toContain("## Session Summary");
    expect(content).toContain("**Project:** mission-control");
    expect(content).toContain("**Duration:** 30 minutes");
    expect(content).toContain("**Files:** 2");
    expect(content).toContain("## Commits");
    expect(content).toContain("feat: add login page");
    expect(content).toContain("fix: correct auth redirect");
    expect(content).toContain("## Files Modified");
    expect(content).toContain("src/auth/login.tsx");
    expect(content).toContain("src/auth/redirect.ts");
  });

  it("handles empty commits list", () => {
    const content = buildSolutionContent([], ["a.ts"], {
      projectSlug: "test",
      startedAt: new Date("2026-03-20T10:00:00Z"),
      endedAt: new Date("2026-03-20T10:10:00Z"),
    });

    expect(content).toContain("## Session Summary");
    expect(content).toContain("No commits");
  });

  it("handles empty files list", () => {
    const content = buildSolutionContent(
      [{ message: "fix: something" }],
      [],
      {
        projectSlug: "test",
        startedAt: new Date("2026-03-20T10:00:00Z"),
        endedAt: new Date("2026-03-20T10:10:00Z"),
      }
    );

    expect(content).toContain("## Session Summary");
    expect(content).toContain("No files tracked");
  });
});

// ── buildTitle ─────────────────────────────────────────────────

describe("buildTitle", () => {
  it("uses single commit message when only 1 commit", () => {
    const title = buildTitle(
      [{ message: "feat(api): add solution extractor" }],
      "mission-control"
    );
    expect(title).toBe("feat(api): add solution extractor");
  });

  it("trims to 100 chars for long single commit", () => {
    const longMsg = "feat: " + "a".repeat(200);
    const title = buildTitle([{ message: longMsg }], "mission-control");
    expect(title.length).toBeLessThanOrEqual(100);
  });

  it("uses first commit message when multiple commits", () => {
    const title = buildTitle(
      [
        { message: "feat(api): add user model" },
        { message: "fix(api): correct validation" },
        { message: "test(api): add user tests" },
      ],
      "mission-control"
    );
    expect(title).toBe("feat(api): add user model");
  });

  it("returns fallback when no commits", () => {
    const title = buildTitle([], "mission-control");
    expect(title).toBe("Session work on mission-control");
  });

  it("handles null projectSlug in fallback", () => {
    const title = buildTitle([], null);
    expect(title).toBe("Session work");
  });
});

// ── extractSolutionMetadata ────────────────────────────────────

describe("extractSolutionMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLmStudioStatus.mockReturnValue({
      health: "unavailable",
      modelId: null,
      lastChecked: new Date(),
    });
  });

  it("returns null when LM Studio is unavailable", async () => {
    const result = await extractSolutionMetadata(
      "test content",
      "mission-control"
    );
    expect(result).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns null when LM Studio is in loading state", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "loading",
      modelId: "qwen3-coder",
      lastChecked: new Date(),
    });

    const result = await extractSolutionMetadata(
      "test content",
      "mission-control"
    );
    expect(result).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns extracted metadata when LM Studio is ready", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });

    mockGenerateText.mockResolvedValueOnce({
      output: {
        title: "SQLite WAL lock contention fix",
        problemType: "bug_fix",
        symptoms: "Tests failing with SQLITE_BUSY errors",
        rootCause: "Parallel test runners sharing the same DB file",
        tags: ["sqlite", "testing", "concurrency"],
        severity: "high",
        module: "packages/api/src/db",
      },
    } as never);

    const result = await extractSolutionMetadata(
      "## Session Summary\n\nFixed WAL locking issues",
      "mission-control"
    );

    expect(result).not.toBeNull();
    expect(result!.title).toBe("SQLite WAL lock contention fix");
    expect(result!.problemType).toBe("bug_fix");
    expect(result!.symptoms).toBe("Tests failing with SQLITE_BUSY errors");
    expect(result!.rootCause).toBe(
      "Parallel test runners sharing the same DB file"
    );
    expect(result!.tags).toEqual(["sqlite", "testing", "concurrency"]);
    expect(result!.severity).toBe("high");
    expect(result!.module).toBe("packages/api/src/db");
  });

  it("returns null when generateText throws", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });

    mockGenerateText.mockRejectedValueOnce(
      new Error("LM Studio connection error")
    );

    const result = await extractSolutionMetadata(
      "test content",
      "mission-control"
    );
    expect(result).toBeNull();
  });

  it("returns null when generateText returns null output", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });

    mockGenerateText.mockResolvedValueOnce({
      output: null,
    } as never);

    const result = await extractSolutionMetadata(
      "test content",
      "mission-control"
    );
    expect(result).toBeNull();
  });

  it("calls LM Studio with proper system prompt and content", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });

    mockGenerateText.mockResolvedValueOnce({
      output: {
        title: "Test",
        problemType: "bug_fix",
        symptoms: "test",
        rootCause: "test",
        tags: [],
        severity: "low",
        module: null,
      },
    } as never);

    await extractSolutionMetadata("session content here", "my-project");

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateText.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    // Verify system prompt mentions session analysis
    expect(callArgs["system"]).toContain("analyzing a Claude Code session");
    // Verify content is passed in the prompt
    expect(callArgs["prompt"]).toContain("session content here");
    expect(callArgs["prompt"]).toContain("my-project");
  });
});
