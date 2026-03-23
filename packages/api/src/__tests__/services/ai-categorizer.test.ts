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

import { categorizeCapture, CONFIDENCE_THRESHOLD, validateFewShotExamples } from "../../services/ai-categorizer.js";
import type { FewShotExample } from "../../services/ai-categorizer.js";
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
    // Set GEMINI_API_KEY so isAIAvailable() returns true in tests
    process.env["GEMINI_API_KEY"] = "test-key";
  });

  it("returns projectSlug, confidence, reasoning, and extractions", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        projectSlug: "mission-control",
        confidence: 0.95,
        reasoning: "Clearly about the dashboard project",
        extractions: [
          { extractionType: "action_item", content: "needs a new widget", confidence: 0.9 },
        ],
      },
    } as never);

    const result = await categorizeCapture("Dashboard needs a new widget", TEST_PROJECTS);

    expect(result.projectSlug).toBe("mission-control");
    expect(result.confidence).toBe(0.95);
    expect(result.reasoning).toBe("Clearly about the dashboard project");
    expect(result.extractions).toHaveLength(1);
    expect(result.extractions[0]!.extractionType).toBe("action_item");
  });

  it("returns null projectSlug when no project matches (low confidence)", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        projectSlug: "mission-control",
        confidence: 0.3,
        reasoning: "Weak match, could be anything",
        extractions: [],
      },
    } as never);

    const result = await categorizeCapture("I need to buy groceries", TEST_PROJECTS);

    expect(result.projectSlug).toBeNull();
    expect(result.confidence).toBe(0.3);
    expect(result.reasoning).toBeDefined();
    expect(result.extractions).toEqual([]);
  });

  it("handles AI call failure gracefully", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await categorizeCapture("Some thought", TEST_PROJECTS);

    expect(result.projectSlug).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.extractions).toEqual([]);
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
        extractions: [],
      },
    } as never);

    const result = await categorizeCapture("flight planning feature", TEST_PROJECTS);

    expect(result.projectSlug).toBe("efb-212");
    expect(result.confidence).toBe(0.6);
  });

  it("includes few-shot examples in prompt when provided", async () => {
    const fewShotExamples: FewShotExample[] = [
      { captureContent: "Fix the map overlay", projectSlug: "efb-212" },
      { captureContent: "Dashboard hero card", projectSlug: "mission-control" },
    ];

    mockGenerateText.mockResolvedValueOnce({
      output: {
        projectSlug: "efb-212",
        confidence: 0.88,
        reasoning: "Similar to example about map overlay",
        extractions: [],
      },
    } as never);

    const result = await categorizeCapture(
      "Update waypoint rendering on the map",
      TEST_PROJECTS,
      fewShotExamples
    );

    expect(result.projectSlug).toBe("efb-212");

    // Verify the prompt included few-shot examples
    const callArgs = mockGenerateText.mock.calls[0]![0] as { prompt: string };
    expect(callArgs.prompt).toContain("Fix the map overlay");
    expect(callArgs.prompt).toContain("efb-212");
    expect(callArgs.prompt).toContain("Dashboard hero card");
    expect(callArgs.prompt).toContain("correctly categorized captures");
  });

  it("extracts multiple extraction types from a capture", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        projectSlug: "mission-control",
        confidence: 0.92,
        reasoning: "Capture about MC with multiple elements",
        extractions: [
          { extractionType: "project_ref", content: "mission-control", confidence: 0.95 },
          { extractionType: "action_item", content: "add new search feature", confidence: 0.8 },
          { extractionType: "idea", content: "could use vector embeddings", confidence: 0.7 },
          { extractionType: "question", content: "which embedding model?", confidence: 0.6 },
        ],
      },
    } as never);

    const result = await categorizeCapture(
      "Need to add new search feature to mission-control. Could use vector embeddings. Which embedding model?",
      TEST_PROJECTS
    );

    expect(result.extractions).toHaveLength(4);
    const types = result.extractions.map((e) => e.extractionType);
    expect(types).toContain("project_ref");
    expect(types).toContain("action_item");
    expect(types).toContain("idea");
    expect(types).toContain("question");
  });

  it("returns empty extractions when output has no extractions field", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: {
        projectSlug: "taxnav",
        confidence: 0.75,
        reasoning: "About tax stuff",
      },
    } as never);

    const result = await categorizeCapture("Need to organize W-2s", TEST_PROJECTS);

    expect(result.projectSlug).toBe("taxnav");
    expect(result.extractions).toEqual([]);
  });
});

describe("validateFewShotExamples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["GEMINI_API_KEY"] = "test-key";
  });

  it("returns empty array when all examples validate correctly", async () => {
    const examples: FewShotExample[] = [
      { captureContent: "Fix dashboard layout", projectSlug: "mission-control" },
      { captureContent: "Update flight plan export", projectSlug: "efb-212" },
    ];

    // Each validation call returns the correct project
    mockGenerateText
      .mockResolvedValueOnce({
        output: {
          projectSlug: "mission-control",
          confidence: 0.9,
          reasoning: "Dashboard match",
          extractions: [],
        },
      } as never)
      .mockResolvedValueOnce({
        output: {
          projectSlug: "efb-212",
          confidence: 0.85,
          reasoning: "Flight plan match",
          extractions: [],
        },
      } as never);

    const failures = await validateFewShotExamples(examples, TEST_PROJECTS);
    expect(failures).toHaveLength(0);
  });

  it("returns failed examples when AI predicts wrong project", async () => {
    const examples: FewShotExample[] = [
      { captureContent: "Fix dashboard layout", projectSlug: "mission-control" },
    ];

    mockGenerateText.mockResolvedValueOnce({
      output: {
        projectSlug: "efb-212",  // Wrong prediction
        confidence: 0.7,
        reasoning: "Mismatch",
        extractions: [],
      },
    } as never);

    const failures = await validateFewShotExamples(examples, TEST_PROJECTS);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.predicted).toBe("efb-212");
    expect(failures[0]!.expected).toBe("mission-control");
  });
});
