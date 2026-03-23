import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";
import {
  createInsight,
  getActiveInsights,
  dismissInsight,
  snoozeInsight,
  getInsightById,
} from "../../../db/queries/insights.js";
import { insights } from "../../../db/schema.js";

describe("Insights CRUD queries", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    instance.db.delete(insights).run();
  });

  describe("createInsight", () => {
    it("inserts a new insight and returns it", () => {
      const result = createInsight(instance.db, {
        type: "stale_capture",
        title: "Stale captures in mission-control",
        body: "3 captures older than 7 days need attention",
        metadata: JSON.stringify({ count: 3 }),
        projectSlug: "mission-control",
        contentHash: "hash-abc-123",
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBeTruthy();
      expect(result!.type).toBe("stale_capture");
      expect(result!.title).toBe("Stale captures in mission-control");
      expect(result!.body).toBe("3 captures older than 7 days need attention");
      expect(result!.metadata).toBe(JSON.stringify({ count: 3 }));
      expect(result!.projectSlug).toBe("mission-control");
      expect(result!.contentHash).toBe("hash-abc-123");
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.dismissedAt).toBeNull();
      expect(result!.snoozedUntil).toBeNull();
    });

    it("returns null for duplicate contentHash (ON CONFLICT DO NOTHING)", () => {
      const first = createInsight(instance.db, {
        type: "stale_capture",
        title: "First insight",
        body: "First body",
        contentHash: "duplicate-hash",
      });
      expect(first).not.toBeNull();

      const second = createInsight(instance.db, {
        type: "activity_gap",
        title: "Second insight with same hash",
        body: "Second body",
        contentHash: "duplicate-hash",
      });
      expect(second).toBeNull();

      // Only one row in table
      const all = instance.db.select().from(insights).all();
      expect(all).toHaveLength(1);
      expect(all[0]!.title).toBe("First insight");
    });
  });

  describe("getActiveInsights", () => {
    it("returns insights that are not dismissed and not snoozed", () => {
      createInsight(instance.db, {
        type: "stale_capture",
        title: "Active insight",
        body: "Should appear",
        contentHash: "active-hash",
      });

      const active = getActiveInsights(instance.db);
      expect(active).toHaveLength(1);
      expect(active[0]!.title).toBe("Active insight");
    });

    it("excludes dismissed insights", () => {
      const insight = createInsight(instance.db, {
        type: "stale_capture",
        title: "Will be dismissed",
        body: "Should not appear after dismiss",
        contentHash: "dismiss-hash",
      });

      dismissInsight(instance.db, insight!.id);

      const active = getActiveInsights(instance.db);
      expect(active).toHaveLength(0);
    });

    it("excludes snoozed insights (snoozedUntil in future)", () => {
      const insight = createInsight(instance.db, {
        type: "activity_gap",
        title: "Snoozed insight",
        body: "Should not appear while snoozed",
        contentHash: "snooze-hash",
      });

      snoozeInsight(instance.db, insight!.id, 24); // 24 hours from now

      const active = getActiveInsights(instance.db);
      expect(active).toHaveLength(0);
    });

    it("includes insights whose snooze has expired", () => {
      const insight = createInsight(instance.db, {
        type: "session_pattern",
        title: "Snooze expired",
        body: "Should appear after snooze expires",
        contentHash: "expired-snooze-hash",
      });

      // Set snoozedUntil to the past (1 hour ago)
      const pastDate = new Date(Date.now() - 60 * 60 * 1000);
      instance.db
        .update(insights)
        .set({ snoozedUntil: pastDate })
        .where(eq(insights.id, insight!.id))
        .run();

      const active = getActiveInsights(instance.db);
      expect(active).toHaveLength(1);
      expect(active[0]!.title).toBe("Snooze expired");
    });

    it("filters by type when type parameter provided", () => {
      createInsight(instance.db, {
        type: "stale_capture",
        title: "Stale one",
        body: "Type A",
        contentHash: "type-a-hash",
      });

      createInsight(instance.db, {
        type: "activity_gap",
        title: "Gap one",
        body: "Type B",
        contentHash: "type-b-hash",
      });

      const staleOnly = getActiveInsights(instance.db, { type: "stale_capture" });
      expect(staleOnly).toHaveLength(1);
      expect(staleOnly[0]!.type).toBe("stale_capture");

      const gapOnly = getActiveInsights(instance.db, { type: "activity_gap" });
      expect(gapOnly).toHaveLength(1);
      expect(gapOnly[0]!.type).toBe("activity_gap");
    });
  });

  describe("dismissInsight", () => {
    it("sets dismissedAt to current timestamp", () => {
      const insight = createInsight(instance.db, {
        type: "cross_project",
        title: "Dismiss me",
        body: "Should be dismissed",
        contentHash: "dismiss-test-hash",
      });

      const before = Date.now();
      dismissInsight(instance.db, insight!.id);
      const after = Date.now();

      const updated = getInsightById(instance.db, insight!.id);
      expect(updated).toBeDefined();
      expect(updated!.dismissedAt).toBeInstanceOf(Date);
      expect(updated!.dismissedAt!.getTime()).toBeGreaterThanOrEqual(before - 2000);
      expect(updated!.dismissedAt!.getTime()).toBeLessThanOrEqual(after + 2000);
    });
  });

  describe("snoozeInsight", () => {
    it("sets snoozedUntil to now + hours", () => {
      const insight = createInsight(instance.db, {
        type: "session_pattern",
        title: "Snooze me",
        body: "Should be snoozed",
        contentHash: "snooze-test-hash",
      });

      const before = Date.now();
      snoozeInsight(instance.db, insight!.id, 12);
      const after = Date.now();

      const updated = getInsightById(instance.db, insight!.id);
      expect(updated).toBeDefined();
      expect(updated!.snoozedUntil).toBeInstanceOf(Date);

      const expectedMin = before + 12 * 60 * 60 * 1000 - 2000;
      const expectedMax = after + 12 * 60 * 60 * 1000 + 2000;
      expect(updated!.snoozedUntil!.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(updated!.snoozedUntil!.getTime()).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe("getInsightById", () => {
    it("returns insight by id", () => {
      const created = createInsight(instance.db, {
        type: "stale_capture",
        title: "Find me",
        body: "Body",
        contentHash: "find-me-hash",
      });

      const found = getInsightById(instance.db, created!.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created!.id);
      expect(found!.title).toBe("Find me");
    });

    it("returns undefined for non-existent id", () => {
      const result = getInsightById(instance.db, "nonexistent-id");
      expect(result).toBeUndefined();
    });
  });
});
