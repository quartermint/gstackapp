import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { indexCapture, indexKnowledge, searchUnified } from "../../db/queries/search.js";
import { upsertKnowledge } from "../../db/queries/knowledge.js";

// Mock embedding service for backfill tests
vi.mock("../../services/embedding.js", () => ({
  isEmbeddingAvailable: vi.fn().mockReturnValue(false),
  generateEmbedding: vi.fn().mockResolvedValue(null),
  computeContentHash: vi.fn((text: string) => {
    // Simple hash for testing
    const { createHash } = require("node:crypto");
    return createHash("sha256").update(text.trim()).digest("hex");
  }),
  getEmbeddingModel: vi.fn().mockReturnValue("test-model"),
  getEmbeddingDimensions: vi.fn().mockReturnValue(768),
  vectorToBuffer: vi.fn((vec: number[]) => Buffer.from(new Float32Array(vec).buffer)),
}));

import { backfillEmbeddings } from "../../services/embedding-backfill.js";
import { isEmbeddingAvailable, generateEmbedding } from "../../services/embedding.js";

const mockIsAvailable = vi.mocked(isEmbeddingAvailable);
const mockGenerateEmbedding = vi.mocked(generateEmbedding);

describe("embedding backfill", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAvailable.mockReturnValue(false);
    mockGenerateEmbedding.mockResolvedValue(null);
  });

  it("returns empty progress when embedding unavailable", async () => {
    mockIsAvailable.mockReturnValue(false);
    const progress = await backfillEmbeddings(instance.sqlite);
    expect(progress.total).toBe(0);
    expect(progress.embedded).toBe(0);
  });

  it("processes search_index entries when available", async () => {
    // Seed some content
    indexCapture(instance.sqlite, {
      id: "backfill-cap-1",
      rawContent: "Test capture for backfill",
      projectId: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    mockIsAvailable.mockReturnValue(true);
    const mockVec = Array.from({ length: 768 }, () => 0.1);
    mockGenerateEmbedding.mockResolvedValue(mockVec);

    const progress = await backfillEmbeddings(instance.sqlite);
    expect(progress.total).toBeGreaterThan(0);
    expect(progress.embedded).toBeGreaterThan(0);
  });
});

describe("knowledge unified search integration", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("indexKnowledge makes CLAUDE.md content searchable via FTS5", () => {
    indexKnowledge(instance.sqlite, {
      projectSlug: "test-project",
      content: "# CLAUDE.md\n\nThis project uses TypeScript strict mode with Vitest for testing.",
    });

    const results = searchUnified(instance.sqlite, "TypeScript");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.sourceType).toBe("knowledge");
    expect(results[0]!.sourceId).toBe("knowledge:test-project");
    expect(results[0]!.projectSlug).toBe("test-project");
  });

  it("upsertKnowledge also indexes in search_index", () => {
    upsertKnowledge(instance.sqlite, {
      projectSlug: "indexed-project",
      content: "# Unique zephyr methodology guide for testing search integration",
      contentHash: "test-hash-zephyr",
      fileSize: 100,
      lastModified: "2026-01-01T00:00:00Z",
      commitsSinceUpdate: 0,
    });

    // Should be findable via unified search
    const results = searchUnified(instance.sqlite, "zephyr");
    expect(results.length).toBe(1);
    expect(results[0]!.sourceType).toBe("knowledge");
    expect(results[0]!.projectSlug).toBe("indexed-project");
  });

  it("re-indexing knowledge replaces old entry (no duplicates)", () => {
    indexKnowledge(instance.sqlite, {
      projectSlug: "replace-test",
      content: "Original unique kaleidoscope content",
    });

    let results = searchUnified(instance.sqlite, "kaleidoscope");
    expect(results.length).toBe(1);

    // Re-index with different content
    indexKnowledge(instance.sqlite, {
      projectSlug: "replace-test",
      content: "Updated unique chrysanthemum content",
    });

    // Old content gone
    results = searchUnified(instance.sqlite, "kaleidoscope");
    expect(results.length).toBe(0);

    // New content found
    results = searchUnified(instance.sqlite, "chrysanthemum");
    expect(results.length).toBe(1);
  });

  it("knowledge results mixed with other source types in unified search", () => {
    // Add a capture and a knowledge entry with overlapping keywords
    indexCapture(instance.sqlite, {
      id: "mixed-cap-1",
      rawContent: "Drizzle ORM migration for the database",
      projectId: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    indexKnowledge(instance.sqlite, {
      projectSlug: "mixed-project",
      content: "This project uses Drizzle ORM for database management",
    });

    const results = searchUnified(instance.sqlite, "Drizzle");
    expect(results.length).toBeGreaterThanOrEqual(2);

    const types = new Set(results.map((r) => r.sourceType));
    expect(types.has("capture")).toBe(true);
    expect(types.has("knowledge")).toBe(true);
  });
});
