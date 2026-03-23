import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";

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
    // vec0 tables appear in sqlite_master as type='table'
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

  it("can insert and query vectors via two-table pattern", () => {
    // Insert metadata
    const info1 = instance.sqlite
      .prepare(
        `INSERT INTO embeddings(content_hash, source_type, source_id, model, dimensions, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("test-hash-1", "capture", "cap-1", "test-model", 768, "2026-01-01T00:00:00Z");

    const info2 = instance.sqlite
      .prepare(
        `INSERT INTO embeddings(content_hash, source_type, source_id, model, dimensions, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("test-hash-2", "commit", "com-1", "test-model", 768, "2026-01-02T00:00:00Z");

    // Create small vectors (768 floats)
    const dims = 768;
    const vec1 = new Float32Array(dims);
    vec1[0] = 1.0;
    vec1[1] = 0.5;

    const vec2 = new Float32Array(dims);
    vec2[0] = 0.0;
    vec2[1] = 1.0;

    // Insert into vec_search with matching rowids (must be bigint)
    instance.sqlite
      .prepare("INSERT INTO vec_search(rowid, embedding) VALUES (?, ?)")
      .run(BigInt(info1.lastInsertRowid), Buffer.from(vec1.buffer));

    instance.sqlite
      .prepare("INSERT INTO vec_search(rowid, embedding) VALUES (?, ?)")
      .run(BigInt(info2.lastInsertRowid), Buffer.from(vec2.buffer));

    // KNN query — vector close to vec1
    const queryVec = new Float32Array(dims);
    queryVec[0] = 0.9;
    queryVec[1] = 0.4;
    const queryBuf = Buffer.from(queryVec.buffer);

    const results = instance.sqlite
      .prepare(
        "SELECT rowid, distance FROM vec_search WHERE embedding MATCH ? AND k = 5"
      )
      .all(queryBuf) as Array<{ rowid: number | bigint; distance: number }>;

    expect(results.length).toBe(2);
    // vec1 should be closer (distance smaller)
    expect(Number(results[0]!.rowid)).toBe(Number(info1.lastInsertRowid));
    expect(results[0]!.distance).toBeLessThan(results[1]!.distance);

    // Enrich: lookup metadata by rowid
    const topRowid = Number(results[0]!.rowid);
    const meta = instance.sqlite
      .prepare("SELECT content_hash, source_type, source_id FROM embeddings WHERE id = ?")
      .get(topRowid) as { content_hash: string; source_type: string; source_id: string };

    expect(meta.content_hash).toBe("test-hash-1");
    expect(meta.source_type).toBe("capture");
    expect(meta.source_id).toBe("cap-1");
  });

  it("content-addressable: duplicate content_hash is rejected", () => {
    // First insert succeeds (or was already done above)
    const first = instance.sqlite
      .prepare(
        `INSERT OR IGNORE INTO embeddings(content_hash, source_type, source_id, model, dimensions, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("dedup-hash", "capture", "cap-dedup-1", "test-model", 768, "2026-01-01T00:00:00Z");

    // Second insert with same hash is silently ignored
    const second = instance.sqlite
      .prepare(
        `INSERT OR IGNORE INTO embeddings(content_hash, source_type, source_id, model, dimensions, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("dedup-hash", "capture", "cap-dedup-2", "test-model", 768, "2026-01-02T00:00:00Z");

    expect(second.changes).toBe(0); // No row inserted
  });
});
