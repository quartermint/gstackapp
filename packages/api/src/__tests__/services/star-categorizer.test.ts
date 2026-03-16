import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ai package
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn(({ schema }: { schema: unknown }) => ({ type: "object", schema })),
  },
}));

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => "mocked-model"),
}));

// Mock the ai-categorizer to control isAIAvailable
vi.mock("../../services/ai-categorizer.js", () => ({
  isAIAvailable: vi.fn(() => true),
  CONFIDENCE_THRESHOLD: 0.6,
}));

import { categorizeStarIntent } from "../../services/star-categorizer.js";
import { generateText } from "ai";
import { isAIAvailable } from "../../services/ai-categorizer.js";

const mockGenerateText = vi.mocked(generateText);
const mockIsAIAvailable = vi.mocked(isAIAvailable);

const testStar = {
  fullName: "microsoft/TypeScript",
  description: "TypeScript is a superset of JavaScript",
  language: "TypeScript",
  topics: ["typescript", "javascript", "compiler"],
};

describe("star categorizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAIAvailable.mockReturnValue(true);
  });

  it("returns intent 'tool' with high confidence", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        intent: "tool",
        confidence: 0.9,
        reasoning: "CLI utility for development",
      },
    } as never);

    const result = await categorizeStarIntent(testStar);

    expect(result).toEqual({
      intent: "tool",
      confidence: 0.9,
      reasoning: "CLI utility for development",
    });
  });

  it("returns intent 'reference' with high confidence", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        intent: "reference",
        confidence: 0.85,
        reasoning: "Documentation and learning resource",
      },
    } as never);

    const result = await categorizeStarIntent({
      ...testStar,
      fullName: "github/docs",
      description: "The open-source repo for docs.github.com",
    });

    expect(result).toEqual({
      intent: "reference",
      confidence: 0.85,
      reasoning: "Documentation and learning resource",
    });
  });

  it("returns intent 'try' with high confidence", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        intent: "try",
        confidence: 0.75,
        reasoning: "Interesting project to experiment with",
      },
    } as never);

    const result = await categorizeStarIntent({
      ...testStar,
      fullName: "denoland/deno",
      description: "A modern runtime for JavaScript and TypeScript",
    });

    expect(result).toEqual({
      intent: "try",
      confidence: 0.75,
      reasoning: "Interesting project to experiment with",
    });
  });

  it("returns intent 'inspiration' with high confidence", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        intent: "inspiration",
        confidence: 0.8,
        reasoning: "Architecture example worth studying",
      },
    } as never);

    const result = await categorizeStarIntent({
      ...testStar,
      fullName: "vercel/platforms",
      description: "A template for site builders and low-code tools",
    });

    expect(result).toEqual({
      intent: "inspiration",
      confidence: 0.8,
      reasoning: "Architecture example worth studying",
    });
  });

  it("sets intent to null when below confidence threshold", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        intent: "tool",
        confidence: 0.4,
        reasoning: "Unclear purpose",
      },
    } as never);

    const result = await categorizeStarIntent(testStar);

    expect(result.intent).toBeNull();
    expect(result.confidence).toBe(0.4);
    expect(result.reasoning).toBe("Unclear purpose");
  });

  it("returns fallback when AI is not available", async () => {
    mockIsAIAvailable.mockReturnValue(false);

    const result = await categorizeStarIntent(testStar);

    expect(result.intent).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain("no GEMINI_API_KEY");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns fallback when generateText returns null output", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: null,
    } as never);

    const result = await categorizeStarIntent(testStar);

    expect(result.intent).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain("no output");
  });

  it("returns fallback when generateText throws an error", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await categorizeStarIntent(testStar);

    expect(result.intent).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toBe("AI categorization failed");
  });

  it("handles star with no description or topics", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        intent: "reference",
        confidence: 0.65,
        reasoning: "Minimal metadata, likely documentation",
      },
    } as never);

    const result = await categorizeStarIntent({
      fullName: "unknown/repo",
      description: null,
      language: null,
      topics: [],
    });

    expect(result.intent).toBe("reference");
    expect(result.confidence).toBe(0.65);
    // Verify generateText was still called despite minimal metadata
    expect(mockGenerateText).toHaveBeenCalledOnce();
  });
});
