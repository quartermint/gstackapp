import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";
import {
  upsertCacheEntry,
  getCacheEntry,
  purgeExpiredEntries,
} from "../../../db/queries/intelligence-cache.js";
import {
  getFromCache,
  writeToCache,
  acquireGenerationLock,
  releaseGenerationLock,
  purgeExpiredCache,
  TTLS,
} from "../../../services/intelligence-cache.js";
import { intelligenceCache } from "../../../db/schema.js";

describe("Intelligence cache queries", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    instance.db.delete(intelligenceCache).run();
  });

  describe("upsertCacheEntry", () => {
    it("creates new entry with all fields populated", () => {
      const entry = upsertCacheEntry(instance.db, {
        projectSlug: "mission-control",
        generationType: "narrative" as const,
        inputHash: "abc123",
        content: '{"summary":"test"}',
        modelId: "qwen3-coder-30b",
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
      });

      expect(entry.id).toBeTruthy();
      expect(entry.projectSlug).toBe("mission-control");
      expect(entry.generationType).toBe("narrative");
      expect(entry.inputHash).toBe("abc123");
      expect(entry.content).toBe('{"summary":"test"}');
      expect(entry.modelId).toBe("qwen3-coder-30b");
      expect(entry.generatedAt).toBeInstanceOf(Date);
      expect(entry.expiresAt).toBeInstanceOf(Date);
      expect(entry.createdAt).toBeInstanceOf(Date);
    });

    it("updates existing entry when slug+type match (ON CONFLICT DO UPDATE)", () => {
      upsertCacheEntry(instance.db, {
        projectSlug: "mission-control",
        generationType: "narrative" as const,
        inputHash: "hash1",
        content: '{"version":1}',
        modelId: "model-a",
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const updated = upsertCacheEntry(instance.db, {
        projectSlug: "mission-control",
        generationType: "narrative" as const,
        inputHash: "hash2",
        content: '{"version":2}',
        modelId: "model-b",
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 7200_000),
      });

      expect(updated.content).toBe('{"version":2}');
      expect(updated.inputHash).toBe("hash2");
      expect(updated.modelId).toBe("model-b");

      // Should only be one row total
      const all = instance.db.select().from(intelligenceCache).all();
      expect(all).toHaveLength(1);
    });
  });

  describe("getCacheEntry", () => {
    it("returns entry when slug+type exists and not expired", () => {
      upsertCacheEntry(instance.db, {
        projectSlug: "mission-control",
        generationType: "narrative" as const,
        inputHash: "hash1",
        content: '{"data":"fresh"}',
        modelId: null,
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000), // 1h from now
      });

      const result = getCacheEntry(instance.db, "mission-control", "narrative");
      expect(result).not.toBeNull();
      expect(result!.content).toBe('{"data":"fresh"}');
    });

    it("returns null when entry is expired (expiresAt < now)", () => {
      upsertCacheEntry(instance.db, {
        projectSlug: "mission-control",
        generationType: "digest" as const,
        inputHash: "hash-expired",
        content: '{"data":"stale"}',
        modelId: null,
        generatedAt: new Date(Date.now() - 7200_000),
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
      });

      const result = getCacheEntry(instance.db, "mission-control", "digest");
      expect(result).toBeNull();
    });

    it("returns null when no entry exists", () => {
      const result = getCacheEntry(instance.db, "nonexistent", "narrative");
      expect(result).toBeNull();
    });
  });

  describe("purgeExpiredEntries", () => {
    it("removes entries where expiresAt < now", () => {
      // Insert an expired entry
      upsertCacheEntry(instance.db, {
        projectSlug: "project-a",
        generationType: "narrative" as const,
        inputHash: "hash-expired",
        content: '{"old":true}',
        modelId: null,
        generatedAt: new Date(Date.now() - 7200_000),
        expiresAt: new Date(Date.now() - 1000),
      });

      // Insert a valid entry
      upsertCacheEntry(instance.db, {
        projectSlug: "project-b",
        generationType: "digest" as const,
        inputHash: "hash-valid",
        content: '{"fresh":true}',
        modelId: null,
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const purged = purgeExpiredEntries(instance.db);
      expect(purged).toBe(1);

      const remaining = instance.db.select().from(intelligenceCache).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.projectSlug).toBe("project-b");
    });
  });
});

describe("Intelligence cache service", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    instance.db.delete(intelligenceCache).run();
  });

  describe("getFromCache", () => {
    it("returns cached content when valid", () => {
      writeToCache(instance.db, "mission-control", "narrative", { summary: "hello" }, "hash1");

      const result = getFromCache<{ summary: string }>(instance.db, "mission-control", "narrative");
      expect(result).not.toBeNull();
      expect(result!.summary).toBe("hello");
    });

    it("returns null when expired", () => {
      // Write with a past expiresAt by directly inserting
      upsertCacheEntry(instance.db, {
        projectSlug: "mission-control",
        generationType: "narrative" as const,
        inputHash: "hash-old",
        content: JSON.stringify({ old: true }),
        modelId: null,
        generatedAt: new Date(Date.now() - 7200_000),
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = getFromCache(instance.db, "mission-control", "narrative");
      expect(result).toBeNull();
    });
  });

  describe("writeToCache", () => {
    it("stores JSON-stringified content with correct TTL", () => {
      const before = Date.now();
      writeToCache(instance.db, "mission-control", "narrative", { data: "test" }, "hash-write");
      const after = Date.now();

      const entry = getCacheEntry(instance.db, "mission-control", "narrative");
      expect(entry).not.toBeNull();
      expect(JSON.parse(entry!.content)).toEqual({ data: "test" });

      // Check TTL is approximately correct (narrative = 60 * 60_000 = 3600000ms)
      // SQLite integer timestamps lose sub-second precision, allow 2s tolerance
      const expiresMs = entry!.expiresAt.getTime();
      expect(expiresMs).toBeGreaterThanOrEqual(before + TTLS.narrative - 2000);
      expect(expiresMs).toBeLessThanOrEqual(after + TTLS.narrative + 2000);
    });
  });

  describe("acquireGenerationLock / releaseGenerationLock", () => {
    it("returns true first time, false for same key while locked", () => {
      const acquired = acquireGenerationLock("mc", "narrative");
      expect(acquired).toBe(true);

      const second = acquireGenerationLock("mc", "narrative");
      expect(second).toBe(false);

      // Clean up
      releaseGenerationLock("mc", "narrative");
    });

    it("allows re-acquisition after release", () => {
      acquireGenerationLock("mc", "digest");
      releaseGenerationLock("mc", "digest");

      const reacquired = acquireGenerationLock("mc", "digest");
      expect(reacquired).toBe(true);

      // Clean up
      releaseGenerationLock("mc", "digest");
    });
  });

  describe("purgeExpiredCache", () => {
    it("delegates to purgeExpiredEntries", () => {
      upsertCacheEntry(instance.db, {
        projectSlug: "project-a",
        generationType: "narrative" as const,
        inputHash: "hash-purge",
        content: "{}",
        modelId: null,
        generatedAt: new Date(Date.now() - 7200_000),
        expiresAt: new Date(Date.now() - 1000),
      });

      const purged = purgeExpiredCache(instance.db);
      expect(purged).toBe(1);
    });
  });
});
