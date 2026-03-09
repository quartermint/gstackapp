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

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => "mocked-model"),
}));

// Mock isAIAvailable from ai-categorizer
vi.mock("../../services/ai-categorizer.js", () => ({
  isAIAvailable: vi.fn(() => false),
}));

import {
  needsAIRewrite,
  processSearchQuery,
} from "../../services/ai-query-rewriter.js";
import { isAIAvailable } from "../../services/ai-categorizer.js";
import { generateText } from "ai";

const mockIsAIAvailable = vi.mocked(isAIAvailable);
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
    mockIsAIAvailable.mockReturnValue(false);
  });

  it("returns raw FTS5 query for short keywords (no AI call)", async () => {
    const result = await processSearchQuery("flight", TEST_PROJECTS);

    expect(result.rewritten).toBe(false);
    expect(result.ftsQuery).toBe('"flight"');
    expect(result.filters).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("falls back to FTS5 when isAIAvailable() returns false", async () => {
    mockIsAIAvailable.mockReturnValue(false);

    const result = await processSearchQuery(
      "what was I working on last week",
      TEST_PROJECTS
    );

    expect(result.rewritten).toBe(false);
    expect(result.ftsQuery).toContain("working");
    expect(result.filters).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("falls back to FTS5 when AI throws an error", async () => {
    mockIsAIAvailable.mockReturnValue(true);
    mockGenerateText.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await processSearchQuery(
      "what was I working on last week",
      TEST_PROJECTS
    );

    expect(result.rewritten).toBe(false);
    expect(result.ftsQuery).toContain("working");
    expect(result.filters).toBeNull();
  });

  it("returns rewritten query and filters when AI succeeds", async () => {
    mockIsAIAvailable.mockReturnValue(true);
    mockGenerateText.mockResolvedValueOnce({
      output: {
        ftsQuery: "flight captures navigation",
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
  });

  it("returns null filters when AI returns null for all filters", async () => {
    mockIsAIAvailable.mockReturnValue(true);
    mockGenerateText.mockResolvedValueOnce({
      output: {
        ftsQuery: "dashboard health status",
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
    expect(result.ftsQuery).toContain("dashboard");
  });

  it("falls back when AI returns null output", async () => {
    mockIsAIAvailable.mockReturnValue(true);
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
