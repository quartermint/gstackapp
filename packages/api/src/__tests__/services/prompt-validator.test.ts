import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the categorizer module
vi.mock("../../services/ai-categorizer.js", () => ({
  categorizeCapture: vi.fn(),
  isAIAvailable: vi.fn(() => true),
  isLMStudioAvailable: vi.fn(() => false),
}));

// Mock the few-shot examples query
vi.mock("../../db/queries/few-shot-examples.js", () => ({
  getFewShotExamplesForCategorization: vi.fn(),
}));

// Mock the projects query
vi.mock("../../db/queries/projects.js", () => ({
  listProjects: vi.fn(),
}));

import { validatePromptExamples } from "../../services/prompt-validator.js";
import { categorizeCapture } from "../../services/ai-categorizer.js";
import { getFewShotExamplesForCategorization } from "../../db/queries/few-shot-examples.js";
import { listProjects } from "../../db/queries/projects.js";
import type { DrizzleDb } from "../../db/index.js";

const mockDb = {} as DrizzleDb;

describe("Prompt Validator", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Set GEMINI_API_KEY so isAIAvailable returns true
    process.env["GEMINI_API_KEY"] = "test-key";
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("logs 'No few-shot examples' when none exist", async () => {
    vi.mocked(getFewShotExamplesForCategorization).mockReturnValue([]);

    await validatePromptExamples(mockDb, 5);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("No few-shot examples to validate")
    );
  });

  it("logs warning on mismatch between expected and actual project slug", async () => {
    vi.mocked(getFewShotExamplesForCategorization).mockReturnValue([
      {
        id: "ex-1",
        captureContent: "Fix the login bug in mission-control dashboard",
        projectSlug: "mission-control",
        extractionType: "project_ref" as const,
        isCorrection: false,
        sourceCaptureId: null,
        createdAt: new Date(),
      },
    ]);

    vi.mocked(listProjects).mockReturnValue([
      {
        slug: "mission-control",
        name: "Mission Control",
        tagline: "Personal OS",
        path: "/Users/test/mission-control",
        host: "local" as const,
        lastScannedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        headCommit: null,
        lastActivityAt: null,
        previousVisitAt: null,
        lastVisitAt: null,
      },
    ]);

    // Categorizer returns a different project slug (mismatch)
    vi.mocked(categorizeCapture).mockResolvedValue({
      projectSlug: "other-project",
      confidence: 0.8,
      reasoning: "Test reasoning",
      extractions: [],
    });

    await validatePromptExamples(mockDb, 5);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Example mismatch")
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("mission-control")
    );
  });

  it("logs success summary when examples match", async () => {
    vi.mocked(getFewShotExamplesForCategorization).mockReturnValue([
      {
        id: "ex-1",
        captureContent: "Fix the login bug in mission-control",
        projectSlug: "mission-control",
        extractionType: "project_ref" as const,
        isCorrection: false,
        sourceCaptureId: null,
        createdAt: new Date(),
      },
    ]);

    vi.mocked(listProjects).mockReturnValue([
      {
        slug: "mission-control",
        name: "Mission Control",
        tagline: "Personal OS",
        path: "/Users/test/mission-control",
        host: "local" as const,
        lastScannedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        headCommit: null,
        lastActivityAt: null,
        previousVisitAt: null,
        lastVisitAt: null,
      },
    ]);

    // Categorizer returns matching slug
    vi.mocked(categorizeCapture).mockResolvedValue({
      projectSlug: "mission-control",
      confidence: 0.9,
      reasoning: "Matches project",
      extractions: [],
    });

    await validatePromptExamples(mockDb, 5);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Prompt validation: 1/1 examples matched")
    );
  });

  it("does not throw errors (fire-and-forget safe)", async () => {
    vi.mocked(getFewShotExamplesForCategorization).mockReturnValue([
      {
        id: "ex-1",
        captureContent: "test content",
        projectSlug: "test-project",
        extractionType: "project_ref" as const,
        isCorrection: false,
        sourceCaptureId: null,
        createdAt: new Date(),
      },
    ]);

    vi.mocked(listProjects).mockReturnValue([]);

    // Categorizer throws an error
    vi.mocked(categorizeCapture).mockRejectedValue(
      new Error("AI unavailable")
    );

    // Should not throw - fire-and-forget safe
    await expect(
      validatePromptExamples(mockDb, 5)
    ).resolves.not.toThrow();
  });

  it("respects maxSamples limit", async () => {
    const examples = Array.from({ length: 10 }, (_, i) => ({
      id: `ex-${i}`,
      captureContent: `Content ${i}`,
      projectSlug: "test",
      extractionType: "project_ref" as const,
      isCorrection: false,
      sourceCaptureId: null,
      createdAt: new Date(),
    }));

    vi.mocked(getFewShotExamplesForCategorization).mockReturnValue(examples);
    vi.mocked(listProjects).mockReturnValue([]);
    vi.mocked(categorizeCapture).mockResolvedValue({
      projectSlug: "test",
      confidence: 0.9,
      reasoning: "Match",
      extractions: [],
    });

    await validatePromptExamples(mockDb, 3);

    // Should only process 3 examples, not all 10
    expect(categorizeCapture).toHaveBeenCalledTimes(3);
  });
});
