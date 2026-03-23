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

// Mock event-bus
vi.mock("../../services/event-bus.js", () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

import { z } from "zod";
import {
  narrativeSchema,
  getNarrative,
  generateProjectNarrative,
  type ProjectNarrative,
} from "../../services/narrative-generator.js";
import { getLmStudioStatus } from "../../services/lm-studio.js";
import { generateText } from "ai";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import {
  writeToCache,
  getFromCache,
  releaseGenerationLock,
} from "../../services/intelligence-cache.js";

const mockGetLmStudioStatus = vi.mocked(getLmStudioStatus);
const mockGenerateText = vi.mocked(generateText);

// ── narrativeSchema ─────────────────────────────────────────────

describe("narrativeSchema", () => {
  it("validates a correct structure", () => {
    const valid = {
      summary: "Recent work focused on authentication improvements.",
      highlights: [
        "Added JWT refresh token rotation",
        "Fixed session timeout bug",
        "Updated test coverage",
      ],
      openThreads: ["Dirty tree with 3 uncommitted files"],
      suggestedFocus: "Complete the auth middleware refactor",
    };

    const result = narrativeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates with null suggestedFocus", () => {
    const valid = {
      summary: "No recent activity.",
      highlights: [],
      openThreads: [],
      suggestedFocus: null,
    };

    const result = narrativeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects invalid data", () => {
    const invalid = {
      summary: 123,
      highlights: "not-an-array",
    };

    const result = narrativeSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ── getNarrative ────────────────────────────────────────────────

describe("getNarrative", () => {
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

  it("returns cached narrative when cache is valid", () => {
    const narrative: ProjectNarrative = {
      summary: "Cached narrative",
      highlights: ["Event 1"],
      openThreads: [],
      suggestedFocus: null,
    };

    // Write to cache
    writeToCache(instance.db, "test-project", "narrative", narrative, "hash-1");

    const result = getNarrative(instance.db, "test-project");
    expect(result).toEqual(narrative);
  });

  it("returns null when cache is empty and LM Studio unavailable", () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "unavailable",
      modelId: null,
      lastChecked: new Date(),
    });

    const result = getNarrative(instance.db, "nonexistent-project");
    expect(result).toBeNull();
  });
});

// ── generateProjectNarrative ────────────────────────────────────

describe("generateProjectNarrative", () => {
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

  it("returns null when LM Studio health is not ready", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "unavailable",
      modelId: null,
      lastChecked: new Date(),
    });

    const result = await generateProjectNarrative(instance.db, "test-project");
    expect(result).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns null when LM Studio is loading", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "loading",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });

    const result = await generateProjectNarrative(instance.db, "test-project");
    expect(result).toBeNull();
  });

  it("calls generateText with Output.object pattern when LM Studio is ready", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });

    const mockNarrative: ProjectNarrative = {
      summary: "Project saw recent auth improvements.",
      highlights: ["Added JWT tokens", "Fixed session bug"],
      openThreads: ["3 dirty files"],
      suggestedFocus: "Complete auth refactor",
    };

    mockGenerateText.mockResolvedValue({
      output: mockNarrative,
      text: "",
      reasoning: undefined,
      reasoningDetails: [],
      sources: [],
      files: [],
      finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      request: {} as never,
      response: {} as never,
      warnings: [],
      providerMetadata: undefined,
      experimental_providerMetadata: undefined,
      steps: [],
      toolCalls: [],
      toolResults: [],
      responseMessages: [],
      toJsonResponse: (() => new Response()) as never,
    });

    const result = await generateProjectNarrative(instance.db, "test-project");
    expect(result).toEqual(mockNarrative);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);

    // Verify Output.object pattern was used
    const callArgs = mockGenerateText.mock.calls[0]![0];
    expect(callArgs).toHaveProperty("output");
    expect(callArgs).toHaveProperty("system");
    expect(callArgs).toHaveProperty("prompt");
  });

  it("returns null on generation error", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });

    mockGenerateText.mockRejectedValue(new Error("LM Studio timeout"));

    const result = await generateProjectNarrative(instance.db, "test-project");
    expect(result).toBeNull();
  });
});
