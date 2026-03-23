import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { createCapture, getCapture, getStaleCaptures } from "../../db/queries/captures.js";
import { upsertProject } from "../../db/queries/projects.js";

// Mock external services
vi.mock("../../services/ai-categorizer.js", () => ({
  categorizeCapture: vi.fn(),
  isAIAvailable: vi.fn(() => true),
  CONFIDENCE_THRESHOLD: 0.6,
}));

vi.mock("../../services/link-extractor.js", () => ({
  containsUrl: vi.fn(),
  extractUrls: vi.fn(),
  extractLinkMetadata: vi.fn(),
}));

import { enrichCapture } from "../../services/enrichment.js";
import { categorizeCapture } from "../../services/ai-categorizer.js";
import { containsUrl, extractUrls, extractLinkMetadata } from "../../services/link-extractor.js";

const mockCategorize = vi.mocked(categorizeCapture);
const mockContainsUrl = vi.mocked(containsUrl);
const mockExtractUrls = vi.mocked(extractUrls);
const mockExtractLinkMetadata = vi.mocked(extractLinkMetadata);

describe("Enrichment Service", () => {
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
      slug: "efb-212",
      name: "OpenEFB",
      tagline: "iPad VFR Electronic Flight Bag",
      path: "/Users/test/efb-212",
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

  it("updates status from raw to enriched with AI results", async () => {
    const capture = createCapture(instance.db, {
      rawContent: "Dashboard needs a new hero card widget",
      type: "text" as const,
    });

    mockCategorize.mockResolvedValueOnce({
      projectSlug: "mission-control",
      confidence: 0.92,
      reasoning: "Mentions dashboard and hero card",
      extractions: [],
    });
    mockContainsUrl.mockReturnValueOnce(false);

    await enrichCapture(instance.db, capture.id);

    const enriched = getCapture(instance.db, capture.id);
    expect(enriched.status).toBe("enriched");
    expect(enriched.aiConfidence).toBeCloseTo(0.92);
    expect(enriched.aiProjectSlug).toBe("mission-control");
    expect(enriched.aiReasoning).toBe("Mentions dashboard and hero card");
    expect(enriched.projectId).toBe("mission-control");
    expect(enriched.enrichedAt).toBeDefined();
  });

  it("sets projectId to null when confidence below 0.6 threshold", async () => {
    const capture = createCapture(instance.db, {
      rawContent: "Need to buy groceries later",
      type: "text" as const,
    });

    mockCategorize.mockResolvedValueOnce({
      projectSlug: null,
      confidence: 0.2,
      reasoning: "No matching project found",
      extractions: [],
    });
    mockContainsUrl.mockReturnValueOnce(false);

    await enrichCapture(instance.db, capture.id);

    const enriched = getCapture(instance.db, capture.id);
    expect(enriched.status).toBe("enriched");
    expect(enriched.projectId).toBeNull();
    expect(enriched.aiConfidence).toBeCloseTo(0.2);
  });

  it("extracts link metadata when URL is detected", async () => {
    const capture = createCapture(instance.db, {
      rawContent: "Check out https://example.com/article for ideas",
      type: "text" as const,
    });

    mockCategorize.mockResolvedValueOnce({
      projectSlug: "mission-control",
      confidence: 0.8,
      reasoning: "About project ideas",
      extractions: [],
    });
    mockContainsUrl.mockReturnValueOnce(true);
    mockExtractUrls.mockReturnValueOnce(["https://example.com/article"]);
    mockExtractLinkMetadata.mockResolvedValueOnce({
      title: "Great Article",
      description: "An inspiring article",
      domain: "example.com",
      image: "https://example.com/og.png",
    });

    await enrichCapture(instance.db, capture.id);

    const enriched = getCapture(instance.db, capture.id);
    expect(enriched.linkUrl).toBe("https://example.com/article");
    expect(enriched.linkTitle).toBe("Great Article");
    expect(enriched.linkDescription).toBe("An inspiring article");
    expect(enriched.linkDomain).toBe("example.com");
    expect(enriched.linkImage).toBe("https://example.com/og.png");
  });

  it("preserves user-assigned projectId over AI result (IOS-13)", async () => {
    // User explicitly assigned capture to "nexusclaw" at creation time
    const capture = createCapture(instance.db, {
      rawContent: "Fix the login flow in NexusClaw",
      type: "text" as const,
      projectId: "nexusclaw",  // User-assigned
    });

    // AI returns a different project ("mission-control")
    mockCategorize.mockResolvedValueOnce({
      projectSlug: "mission-control",
      confidence: 0.85,
      reasoning: "Mentions login flow",
      extractions: [],
    });
    mockContainsUrl.mockReturnValueOnce(false);

    await enrichCapture(instance.db, capture.id);

    const enriched = getCapture(instance.db, capture.id);
    // IOS-13: User assignment takes precedence -- projectId stays "nexusclaw"
    expect(enriched.projectId).toBe("nexusclaw");
    // AI result is still recorded for transparency
    expect(enriched.aiProjectSlug).toBe("mission-control");
    expect(enriched.aiConfidence).toBeCloseTo(0.85);
  });
});

describe("Stale Captures Query", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("returns only non-archived captures older than 14 days", () => {
    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    // Insert old capture (stale)
    instance.sqlite
      .prepare(
        `INSERT INTO captures (id, raw_content, type, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("stale-1", "Old thought", "text", "raw", Math.floor(fifteenDaysAgo.getTime() / 1000), Math.floor(fifteenDaysAgo.getTime() / 1000));

    // Insert recent capture (not stale)
    instance.sqlite
      .prepare(
        `INSERT INTO captures (id, raw_content, type, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("recent-1", "Recent thought", "text", "raw", Math.floor(tenDaysAgo.getTime() / 1000), Math.floor(tenDaysAgo.getTime() / 1000));

    const stale = getStaleCaptures(instance.db);
    const staleIds = stale.map((c) => c.id);
    expect(staleIds).toContain("stale-1");
    expect(staleIds).not.toContain("recent-1");
  });

  it("excludes archived captures", () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

    // Insert old archived capture
    instance.sqlite
      .prepare(
        `INSERT INTO captures (id, raw_content, type, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("archived-1", "Archived old thought", "text", "archived", Math.floor(fifteenDaysAgo.getTime() / 1000), Math.floor(fifteenDaysAgo.getTime() / 1000));

    const stale = getStaleCaptures(instance.db);
    const staleIds = stale.map((c) => c.id);
    expect(staleIds).not.toContain("archived-1");
  });
});
