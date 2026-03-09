import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ai package before importing the module under test
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn(({ schema }: { schema: unknown }) => ({ type: "object", schema })),
  },
}));

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => "mocked-model"),
}));

import { categorizeCapture, CONFIDENCE_THRESHOLD } from "../../services/ai-categorizer.js";
import { generateText } from "ai";

const mockGenerateText = vi.mocked(generateText);

const TEST_PROJECTS = [
  { slug: "mission-control", name: "Mission Control", tagline: "Personal operating environment" },
  { slug: "efb-212", name: "OpenEFB", tagline: "iPad VFR Electronic Flight Bag" },
  { slug: "taxnav", name: "TaxNav", tagline: "Personal tax organization" },
];

describe("AI Categorizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns projectSlug, confidence, and reasoning matching schema", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        projectSlug: "mission-control",
        confidence: 0.95,
        reasoning: "Clearly about the dashboard project",
      },
    } as never);

    const result = await categorizeCapture("Dashboard needs a new widget", TEST_PROJECTS);

    expect(result).toEqual({
      projectSlug: "mission-control",
      confidence: 0.95,
      reasoning: "Clearly about the dashboard project",
    });
  });

  it("returns null projectSlug when no project matches (low confidence)", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        projectSlug: "mission-control",
        confidence: 0.3,
        reasoning: "Weak match, could be anything",
      },
    } as never);

    const result = await categorizeCapture("I need to buy groceries", TEST_PROJECTS);

    expect(result.projectSlug).toBeNull();
    expect(result.confidence).toBe(0.3);
    expect(result.reasoning).toBeDefined();
  });

  it("handles AI call failure gracefully", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await categorizeCapture("Some thought", TEST_PROJECTS);

    expect(result.projectSlug).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toBe("AI categorization failed");
  });

  it("exports CONFIDENCE_THRESHOLD as 0.6", () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.6);
  });

  it("applies threshold at confidence boundary (exactly 0.6 keeps projectSlug)", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        projectSlug: "efb-212",
        confidence: 0.6,
        reasoning: "Exactly at threshold",
      },
    } as never);

    const result = await categorizeCapture("flight planning feature", TEST_PROJECTS);

    expect(result.projectSlug).toBe("efb-212");
    expect(result.confidence).toBe(0.6);
  });
});
