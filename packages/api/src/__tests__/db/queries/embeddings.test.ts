import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";
import {
  upsertEmbedding,
  getEmbedding,
  hasEmbedding,
  searchByVector,
  deleteEmbedding,
  countEmbeddings,
} from "../../../db/queries/embeddings.js";

describe("Embeddings and vector search", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("embeddings table exists after migration", () => {
    const tables = instance.sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'`
      )
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe("embeddings");
  });

  it("vec_search virtual table exists", () => {
    const tables = instance.sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE name='vec_search'`
      )
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it("sqlite-vec extension is loaded (vec_version)", () => {
    const row = instance.sqlite
      .prepare("SELECT vec_version() AS v")
      .get() as { v: string };
    expect(row.v).toMatch(/^v\d+\.\d+/);
  });

  describe("upsertEmbedding", () => {
    it("inserts new embedding and vector", () => {
      const dims = 768;
      const vec = Array.from({ length: dims }, (_, i) => i * 0.001);

      const rowId = upsertEmbedding(instance.sqlite, {
        contentHash: "upsert-hash-1",
        sourceType: "capture",
        sourceId: "cap-1",
        embedding: vec,
        model: "test-model",
        dimensions: dims,
      });

      expect(rowId).toBeGreaterThan(0);

      // Verify metadata
      const record = getEmbedding(instance.sqlite, "upsert-hash-1");
      expect(record).not.toBeNull();
      expect(record!.contentHash).toBe("upsert-hash-1");
      expect(record!.sourceType).toBe("capture");
      expect(record!.sourceId).toBe("cap-1");
      expect(record!.model).toBe("test-model");
      expect(record!.dimensions).toBe(dims);
    });

    it("skips duplicate content hash (content-addressable dedup)", () => {
      const dims = 768;
      const vec = Array.from({ length: dims }, () => 0.5);

      const id1 = upsertEmbedding(instance.sqlite, {
        contentHash: "dedup-hash",
        sourceType: "capture",
        sourceId: "cap-dedup-1",
        embedding: vec,
        model: "test-model",
        dimensions: dims,
      });

      const id2 = upsertEmbedding(instance.sqlite, {
        contentHash: "dedup-hash",
        sourceType: "commit",
        sourceId: "com-dedup-2",
        embedding: vec,
        model: "test-model",
        dimensions: dims,
      });

      // Same row returned
      expect(id2).toBe(id1);

      // Original source preserved (not overwritten)
      const record = getEmbedding(instance.sqlite, "dedup-hash");
      expect(record!.sourceType).toBe("capture");
      expect(record!.sourceId).toBe("cap-dedup-1");
    });
  });

  describe("hasEmbedding", () => {
    it("returns true for existing hash", () => {
      expect(hasEmbedding(instance.sqlite, "upsert-hash-1")).toBe(true);
    });

    it("returns false for non-existent hash", () => {
      expect(hasEmbedding(instance.sqlite, "nonexistent")).toBe(false);
    });
  });

  describe("searchByVector", () => {
    it("returns KNN results enriched with metadata", () => {
      const dims = 768;

      // Insert a second embedding with a different vector
      const vec2 = Array.from({ length: dims }, (_, i) => (dims - i) * 0.001);
      upsertEmbedding(instance.sqlite, {
        contentHash: "search-hash-2",
        sourceType: "commit",
        sourceId: "com-search-1",
        embedding: vec2,
        model: "test-model",
        dimensions: dims,
      });

      // Query vector close to first embedding (upsert-hash-1)
      const queryVec = Array.from({ length: dims }, (_, i) => i * 0.001);
      const results = searchByVector(instance.sqlite, queryVec, 5);

      expect(results.length).toBeGreaterThan(0);
      // Results should have enriched metadata
      expect(results[0]!.contentHash).toBeTruthy();
      expect(results[0]!.sourceType).toBeTruthy();
      expect(results[0]!.sourceId).toBeTruthy();
      expect(typeof results[0]!.distance).toBe("number");
    });

    it("returns empty array when no embeddings exist for fresh db", () => {
      const freshInstance = createTestDb();
      const queryVec = Array.from({ length: 768 }, () => 0.5);
      const results = searchByVector(freshInstance.sqlite, queryVec, 5);
      expect(results).toEqual([]);
      freshInstance.sqlite.close();
    });
  });

  describe("deleteEmbedding", () => {
    it("removes embedding by content hash", () => {
      const dims = 768;
      const vec = Array.from({ length: dims }, () => 0.1);

      upsertEmbedding(instance.sqlite, {
        contentHash: "delete-hash",
        sourceType: "project",
        sourceId: "proj-del",
        embedding: vec,
        model: "test-model",
        dimensions: dims,
      });

      expect(hasEmbedding(instance.sqlite, "delete-hash")).toBe(true);
      const deleted = deleteEmbedding(instance.sqlite, "delete-hash");
      expect(deleted).toBe(true);
      expect(hasEmbedding(instance.sqlite, "delete-hash")).toBe(false);
    });

    it("returns false for non-existent hash", () => {
      const deleted = deleteEmbedding(instance.sqlite, "nonexistent-hash");
      expect(deleted).toBe(false);
    });
  });

  describe("countEmbeddings", () => {
    it("returns current embedding count", () => {
      const count = countEmbeddings(instance.sqlite);
      expect(count).toBeGreaterThan(0);
    });
  });
});
