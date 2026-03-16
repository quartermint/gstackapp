import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";
import {
  upsertStar,
  getStar,
  listStars,
  updateStarIntent,
  getUncategorizedStars,
  getLatestStarredAt,
  getStarCount,
} from "../../../db/queries/stars.js";

const makeStar = (overrides: Partial<{
  githubId: number;
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  htmlUrl: string;
  starredAt: Date;
}> = {}) => ({
  githubId: overrides.githubId ?? 12345,
  fullName: overrides.fullName ?? "owner/test-repo",
  description: overrides.description ?? "A test repository",
  language: overrides.language ?? "TypeScript",
  topics: overrides.topics ?? ["test", "example"],
  htmlUrl: overrides.htmlUrl ?? "https://github.com/owner/test-repo",
  starredAt: overrides.starredAt ?? new Date("2024-06-15T10:00:00Z"),
});

describe("star queries", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("upsertStar", () => {
    it("inserts a new star with correct fields", () => {
      const star = upsertStar(instance.db, makeStar({ githubId: 1001 }));

      expect(star.githubId).toBe(1001);
      expect(star.fullName).toBe("owner/test-repo");
      expect(star.description).toBe("A test repository");
      expect(star.language).toBe("TypeScript");
      expect(star.topics).toEqual(["test", "example"]);
      expect(star.htmlUrl).toBe("https://github.com/owner/test-repo");
      expect(star.intent).toBeNull();
      expect(star.aiConfidence).toBeNull();
      expect(star.userOverride).toBe(false);
      expect(star.starredAt).toBe("2024-06-15T10:00:00.000Z");
      expect(star.createdAt).toBeDefined();
      expect(star.updatedAt).toBeDefined();
      expect(star.lastSyncedAt).toBeDefined();
    });

    it("updates existing star but preserves intent/aiConfidence/userOverride", () => {
      // Insert a star
      upsertStar(instance.db, makeStar({ githubId: 1002, description: "Original desc" }));

      // Manually set intent via updateStarIntent
      updateStarIntent(instance.db, 1002, "tool");

      // Now upsert again with updated description
      const updated = upsertStar(instance.db, makeStar({
        githubId: 1002,
        description: "Updated desc",
      }));

      expect(updated.description).toBe("Updated desc");
      // Categorization fields should be preserved
      expect(updated.intent).toBe("tool");
      expect(updated.userOverride).toBe(true);
    });
  });

  describe("getStar", () => {
    it("returns star by githubId", () => {
      upsertStar(instance.db, makeStar({ githubId: 2001 }));
      const star = getStar(instance.db, 2001);
      expect(star.githubId).toBe(2001);
      expect(star.topics).toEqual(["test", "example"]);
    });

    it("throws notFound for non-existent githubId", () => {
      expect(() => getStar(instance.db, 999999)).toThrow(/not found/i);
    });
  });

  describe("listStars", () => {
    let listInstance: DatabaseInstance;

    beforeAll(() => {
      listInstance = createTestDb();

      // Insert 5 stars with different properties
      upsertStar(listInstance.db, makeStar({ githubId: 3001, fullName: "org/alpha", language: "TypeScript", starredAt: new Date("2024-01-01T00:00:00Z") }));
      upsertStar(listInstance.db, makeStar({ githubId: 3002, fullName: "org/beta", language: "Rust", starredAt: new Date("2024-02-01T00:00:00Z") }));
      upsertStar(listInstance.db, makeStar({ githubId: 3003, fullName: "org/gamma", language: "TypeScript", starredAt: new Date("2024-03-01T00:00:00Z") }));
      upsertStar(listInstance.db, makeStar({ githubId: 3004, fullName: "org/delta-search-target", language: "Python", starredAt: new Date("2024-04-01T00:00:00Z") }));
      upsertStar(listInstance.db, makeStar({ githubId: 3005, fullName: "org/epsilon", language: "Go", starredAt: new Date("2024-05-01T00:00:00Z") }));

      // Set intents for some
      updateStarIntent(listInstance.db, 3001, "tool");
      updateStarIntent(listInstance.db, 3002, "reference");
    });

    afterAll(() => {
      listInstance.sqlite.close();
    });

    it("returns all stars with no filters", () => {
      const result = listStars(listInstance.db, { limit: 50, offset: 0 });
      expect(result.total).toBe(5);
      expect(result.stars.length).toBe(5);
    });

    it("filters by intent", () => {
      const result = listStars(listInstance.db, { intent: "tool", limit: 50, offset: 0 });
      expect(result.total).toBe(1);
      expect(result.stars[0]!.fullName).toBe("org/alpha");
    });

    it("filters by language", () => {
      const result = listStars(listInstance.db, { language: "TypeScript", limit: 50, offset: 0 });
      expect(result.total).toBe(2);
    });

    it("searches by fullName", () => {
      const result = listStars(listInstance.db, { search: "search-target", limit: 50, offset: 0 });
      expect(result.total).toBe(1);
      expect(result.stars[0]!.fullName).toBe("org/delta-search-target");
    });

    it("supports pagination", () => {
      const page1 = listStars(listInstance.db, { limit: 2, offset: 0 });
      expect(page1.stars.length).toBe(2);
      expect(page1.total).toBe(5);

      const page2 = listStars(listInstance.db, { limit: 2, offset: 2 });
      expect(page2.stars.length).toBe(2);
      expect(page2.total).toBe(5);
    });
  });

  describe("updateStarIntent", () => {
    it("sets intent and marks as user override", () => {
      upsertStar(instance.db, makeStar({ githubId: 4001 }));
      const updated = updateStarIntent(instance.db, 4001, "reference");

      expect(updated.intent).toBe("reference");
      expect(updated.aiConfidence).toBeNull();
      expect(updated.userOverride).toBe(true);
    });
  });

  describe("getUncategorizedStars", () => {
    let uncatInstance: DatabaseInstance;

    beforeAll(() => {
      uncatInstance = createTestDb();

      // Star with intent (categorized by user)
      upsertStar(uncatInstance.db, makeStar({ githubId: 5001 }));
      updateStarIntent(uncatInstance.db, 5001, "tool");

      // Star without intent, no user override (uncategorized)
      upsertStar(uncatInstance.db, makeStar({ githubId: 5002 }));

      // Another uncategorized
      upsertStar(uncatInstance.db, makeStar({ githubId: 5003 }));
    });

    afterAll(() => {
      uncatInstance.sqlite.close();
    });

    it("returns only stars without intent and without user override", () => {
      const uncategorized = getUncategorizedStars(uncatInstance.db);
      const ids = uncategorized.map((s) => s.githubId);

      expect(ids).toContain(5002);
      expect(ids).toContain(5003);
      expect(ids).not.toContain(5001);
    });
  });

  describe("getLatestStarredAt", () => {
    it("returns the latest starred_at date", () => {
      // Stars already inserted in the main instance above
      const latest = getLatestStarredAt(instance.db);
      expect(latest).toBeInstanceOf(Date);
    });

    it("returns null for empty table", () => {
      const emptyInstance = createTestDb();
      const result = getLatestStarredAt(emptyInstance.db);
      expect(result).toBeNull();
      emptyInstance.sqlite.close();
    });
  });

  describe("getStarCount", () => {
    it("returns the total number of stars", () => {
      const freshInstance = createTestDb();
      expect(getStarCount(freshInstance.db)).toBe(0);

      upsertStar(freshInstance.db, makeStar({ githubId: 6001 }));
      upsertStar(freshInstance.db, makeStar({ githubId: 6002 }));
      upsertStar(freshInstance.db, makeStar({ githubId: 6003 }));

      expect(getStarCount(freshInstance.db)).toBe(3);
      freshInstance.sqlite.close();
    });
  });
});
