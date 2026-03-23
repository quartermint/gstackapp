import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { createCapture, getCapture } from "../../db/queries/captures.js";
import { upsertProject } from "../../db/queries/projects.js";

// Mock external services
vi.mock("../../services/ai-categorizer.js", () => ({
  categorizeCapture: vi.fn(),
  isAIAvailable: vi.fn(() => true),
  isLMStudioAvailable: vi.fn(() => false),
  CONFIDENCE_THRESHOLD: 0.6,
}));

vi.mock("../../services/link-extractor.js", () => ({
  containsUrl: vi.fn(),
  extractUrls: vi.fn(),
  extractLinkMetadata: vi.fn(),
}));

import { enrichCapture } from "../../services/enrichment.js";
import { categorizeCapture } from "../../services/ai-categorizer.js";
import { containsUrl } from "../../services/link-extractor.js";

const mockCategorize = vi.mocked(categorizeCapture);
const mockContainsUrl = vi.mocked(containsUrl);

describe("Enrichment Device Hint Routing", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();

    // Seed test projects
    upsertProject(instance.db, {
      slug: "mission-control",
      name: "Mission Control",
      tagline: "Personal operating environment",
      path: "/Users/test/mission-control",
      host: "local",
      lastScannedAt: null,
    });
    upsertProject(instance.db, {
      slug: "nexusclaw",
      name: "NexusClaw",
      tagline: "iOS client for ZeroClaw",
      path: "/Users/test/nexusclaw",
      host: "local",
      lastScannedAt: null,
    });
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("high-confidence device hint skips AI categorization", async () => {
    const capture = createCapture(instance.db, {
      rawContent: "Fix the departure board layout",
      type: "text" as const,
    });

    await enrichCapture(instance.db, capture.id, {
      projectSlug: "mission-control",
      confidence: 0.9,
      classifiedOnDevice: true,
      classifiedAt: new Date().toISOString(),
    });

    // AI categorizer should NOT have been called
    expect(mockCategorize).not.toHaveBeenCalled();

    const enriched = getCapture(instance.db, capture.id);
    expect(enriched.status).toBe("enriched");
    expect(enriched.aiProjectSlug).toBe("mission-control");
    expect(enriched.aiConfidence).toBeCloseTo(0.9);
    expect(enriched.aiReasoning).toContain("Device-classified");
    expect(enriched.projectId).toBe("mission-control");
  });

  it("low-confidence device hint falls through to server enrichment", async () => {
    const capture = createCapture(instance.db, {
      rawContent: "Maybe something about the dashboard",
      type: "text" as const,
    });

    mockCategorize.mockResolvedValueOnce({
      projectSlug: "mission-control",
      confidence: 0.75,
      reasoning: "Mentions dashboard",
      extractions: [],
    });
    mockContainsUrl.mockReturnValueOnce(false);

    await enrichCapture(instance.db, capture.id, {
      projectSlug: "mission-control",
      confidence: 0.5,
      classifiedOnDevice: true,
      classifiedAt: new Date().toISOString(),
    });

    // Low confidence (0.5 <= 0.8) should fall through to AI categorization
    expect(mockCategorize).toHaveBeenCalled();
  });

  it("missing device hint uses existing enrichment path", async () => {
    const capture = createCapture(instance.db, {
      rawContent: "Some general thought about projects",
      type: "text" as const,
    });

    mockCategorize.mockResolvedValueOnce({
      projectSlug: null,
      confidence: 0.1,
      reasoning: "No clear match",
      extractions: [],
    });
    mockContainsUrl.mockReturnValueOnce(false);

    await enrichCapture(instance.db, capture.id);

    // No device hint -- should use AI categorization
    expect(mockCategorize).toHaveBeenCalled();
  });

  it("device hint preserves user-set projectId (IOS-13)", async () => {
    // User explicitly assigned capture to "nexusclaw" at creation time
    const capture = createCapture(instance.db, {
      rawContent: "Fix the login flow",
      type: "text" as const,
      projectId: "nexusclaw",
    });

    await enrichCapture(instance.db, capture.id, {
      projectSlug: "mission-control",
      confidence: 0.95,
      classifiedOnDevice: true,
      classifiedAt: new Date().toISOString(),
    });

    const enriched = getCapture(instance.db, capture.id);
    // User assignment takes precedence (IOS-13: capture.projectId ?? deviceHint.projectSlug)
    expect(enriched.projectId).toBe("nexusclaw");
    // Device classification is still recorded
    expect(enriched.aiProjectSlug).toBe("mission-control");
    expect(enriched.aiConfidence).toBeCloseTo(0.95);
  });

  it("device hint with null projectSlug falls through to AI", async () => {
    const capture = createCapture(instance.db, {
      rawContent: "Random thought the device could not classify",
      type: "text" as const,
    });

    mockCategorize.mockResolvedValueOnce({
      projectSlug: "mission-control",
      confidence: 0.7,
      reasoning: "Might be MC related",
      extractions: [],
    });
    mockContainsUrl.mockReturnValueOnce(false);

    // High confidence but null projectSlug -- device was uncertain about which project
    await enrichCapture(instance.db, capture.id, {
      projectSlug: null,
      confidence: 0.9,
      classifiedOnDevice: true,
      classifiedAt: new Date().toISOString(),
    });

    // Null slug means device hint condition fails, falls through to AI
    expect(mockCategorize).toHaveBeenCalled();
  });
});
