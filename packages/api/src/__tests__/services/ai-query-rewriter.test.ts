import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Mock LM Studio service (replaces @ai-sdk/google and ai-categorizer mocks)
vi.mock("../../services/lm-studio.js", () => ({
  getLmStudioStatus: vi.fn(() => ({ health: "unavailable", modelId: null, lastChecked: new Date() })),
  createLmStudioProvider: vi.fn(() => vi.fn(() => "mocked-lm-studio-model")),
}));

import {
  needsAIRewrite,
  processSearchQuery,
  expandQuery,
} from "../../services/ai-query-rewriter.js";
import { getLmStudioStatus, createLmStudioProvider } from "../../services/lm-studio.js";
import { generateText } from "ai";

const mockGetLmStudioStatus = vi.mocked(getLmStudioStatus);
const mockCreateLmStudioProvider = vi.mocked(createLmStudioProvider);
const mockGenerateText = vi.mocked(generateText);

const TEST_PROJECTS = [
  {
    slug: "mission-control",
    name: "Mission Control",
    tagline: "Personal operating environment",
  },
  {
    slug: "efb-212",
    name: "OpenEFB",
    tagline: "iPad VFR Electronic Flight Bag",
  },
  { slug: "taxnav", name: "TaxNav", tagline: "Personal tax organization" },
];

describe("needsAIRewrite", () => {
  it('returns false for single keyword "flight"', () => {
    expect(needsAIRewrite("flight")).toBe(false);
  });

  it('returns false for 2 keywords without question pattern "tax docs"', () => {
    expect(needsAIRewrite("tax docs")).toBe(false);
  });

  it('returns true for natural language question "what was I working on last week"', () => {
    expect(needsAIRewrite("what was I working on last week")).toBe(true);
  });

  it('returns true for question word "find my flight captures"', () => {
    expect(needsAIRewrite("find my flight captures")).toBe(true);
  });

  it('returns true for question pattern "things related to taxnav"', () => {
    expect(needsAIRewrite("things related to taxnav")).toBe(true);
  });

  it('returns true for 3+ words without clear keyword "mission control dashboard health"', () => {
    expect(needsAIRewrite("mission control dashboard health")).toBe(true);
  });
});

describe("processSearchQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLmStudioStatus.mockReturnValue({
      health: "unavailable",
      modelId: null,
      lastChecked: new Date(),
    });
  });

  it("returns raw FTS5 query for short keywords (no AI call)", async () => {
    const result = await processSearchQuery("flight", TEST_PROJECTS);

    expect(result.rewritten).toBe(false);
    expect(result.ftsQuery).toBe('"flight"');
    expect(result.filters).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("falls back to FTS5 when LM Studio is not ready (per D-05)", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "unavailable",
      modelId: null,
      lastChecked: new Date(),
    });

    const result = await processSearchQuery(
      "what was I working on last week",
      TEST_PROJECTS
    );

    expect(result.rewritten).toBe(false);
    expect(result.ftsQuery).toContain("working");
    expect(result.filters).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("falls back to FTS5 when LM Studio is in loading state", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "loading",
      modelId: null,
      lastChecked: new Date(),
    });

    const result = await processSearchQuery(
      "what was I working on last week",
      TEST_PROJECTS
    );

    expect(result.rewritten).toBe(false);
    expect(result.ftsQuery).toContain("working");
    expect(result.filters).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("falls back to FTS5 when query expansion throws an error", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });
    mockGenerateText.mockRejectedValueOnce(new Error("LM Studio connection error"));

    const result = await processSearchQuery(
      "what was I working on last week",
      TEST_PROJECTS
    );

    expect(result.rewritten).toBe(false);
    expect(result.ftsQuery).toContain("working");
    expect(result.filters).toBeNull();
  });

  it("returns expanded queries when LM Studio is ready and expansion succeeds", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });
    mockGenerateText.mockResolvedValueOnce({
      output: {
        lexVariants: ["flight captures navigation", "efb flight notes"],
        vecVariants: ["notes about flying and navigation in electronic flight bag", "aviation captures"],
        projectFilter: "efb-212",
        typeFilter: "capture",
        dateFilter: null,
        reasoning: "User asking about flight-related captures in EFB project",
      },
    } as never);

    const result = await processSearchQuery(
      "find my flight captures",
      TEST_PROJECTS
    );

    expect(result.rewritten).toBe(true);
    expect(result.ftsQuery).toContain("flight");
    expect(result.filters).not.toBeNull();
    expect(result.filters?.project).toBe("efb-212");
    expect(result.filters?.type).toBe("capture");
    // Verify new variant fields
    expect(result.lexVariants).toEqual(["flight captures navigation", "efb flight notes"]);
    expect(result.vecVariants).toEqual(["notes about flying and navigation in electronic flight bag", "aviation captures"]);
  });

  it("preserves backward-compatible interface (ftsQuery, filters, rewritten, reasoning)", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });
    mockGenerateText.mockResolvedValueOnce({
      output: {
        lexVariants: ["dashboard health status"],
        vecVariants: ["how is the mission control dashboard health"],
        projectFilter: null,
        typeFilter: null,
        dateFilter: null,
        reasoning: "General query about dashboard health",
      },
    } as never);

    const result = await processSearchQuery(
      "mission control dashboard health",
      TEST_PROJECTS
    );

    expect(result.rewritten).toBe(true);
    expect(typeof result.ftsQuery).toBe("string");
    expect(result.ftsQuery).toContain("dashboard");
    expect(result.reasoning).toBe("General query about dashboard health");
    // filters present even when all null values
    expect(result.filters).toEqual({
      project: null,
      type: null,
      dateAfter: null,
      dateBefore: null,
    });
  });

  it("falls back when query expansion returns null output", async () => {
    mockGetLmStudioStatus.mockReturnValue({
      health: "ready",
      modelId: "qwen3-coder-30b",
      lastChecked: new Date(),
    });
    mockGenerateText.mockResolvedValueOnce({
      output: null,
    } as never);

    const result = await processSearchQuery(
      "what was I working on last week",
      TEST_PROJECTS
    );

    expect(result.rewritten).toBe(false);
    expect(result.filters).toBeNull();
  });
});

describe("expandQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates lex and vec variants via LM Studio generateText", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        lexVariants: ["search terms", "keyword variant"],
        vecVariants: ["semantic meaning of search", "rich query for embedding"],
        projectFilter: null,
        typeFilter: null,
        dateFilter: null,
        reasoning: "Expanded for hybrid search",
      },
    } as never);

    const result = await expandQuery(
      "test search query",
      TEST_PROJECTS,
      "http://localhost:1234"
    );

    expect(result).not.toBeNull();
    expect(result!.lexVariants).toEqual(["search terms", "keyword variant"]);
    expect(result!.vecVariants).toEqual(["semantic meaning of search", "rich query for embedding"]);
    expect(result!.reasoning).toBe("Expanded for hybrid search");
    expect(mockCreateLmStudioProvider).toHaveBeenCalledWith("http://localhost:1234");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("returns null when LM Studio generateText fails", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await expandQuery(
      "test query",
      TEST_PROJECTS,
      "http://localhost:1234"
    );

    expect(result).toBeNull();
  });

  it("returns null when generateText returns null output", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: null,
    } as never);

    const result = await expandQuery(
      "test query",
      TEST_PROJECTS,
      "http://localhost:1234"
    );

    expect(result).toBeNull();
  });

  it("extracts filters from expansion", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        lexVariants: ["taxnav receipts"],
        vecVariants: ["tax-related receipt captures"],
        projectFilter: "taxnav",
        typeFilter: "capture",
        dateFilter: { after: "2026-01-01", before: null },
        reasoning: "TaxNav capture query with date filter",
      },
    } as never);

    const result = await expandQuery(
      "taxnav receipts from this year",
      TEST_PROJECTS,
      "http://localhost:1234"
    );

    expect(result).not.toBeNull();
    expect(result!.filters).toEqual({
      project: "taxnav",
      type: "capture",
      dateAfter: "2026-01-01",
      dateBefore: null,
    });
  });
});
