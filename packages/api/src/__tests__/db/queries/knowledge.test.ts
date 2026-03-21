import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";
import {
  upsertKnowledge,
  getKnowledge,
  getAllKnowledge,
} from "../../../db/queries/knowledge.js";

describe("Knowledge queries", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("upsertKnowledge", () => {
    it("inserts a new record when none exists for slug", () => {
      upsertKnowledge(instance.sqlite, {
        projectSlug: "mission-control",
        content: "# CLAUDE.md\n\nProject overview here.",
        contentHash: "abc123hash",
        fileSize: 42,
        lastModified: "2026-03-20T10:00:00Z",
        commitsSinceUpdate: 3,
      });

      const record = getKnowledge(instance.db, "mission-control");
      expect(record).not.toBeNull();
      expect(record!.projectSlug).toBe("mission-control");
      expect(record!.content).toBe("# CLAUDE.md\n\nProject overview here.");
      expect(record!.contentHash).toBe("abc123hash");
      expect(record!.fileSize).toBe(42);
      expect(record!.lastModified).toBe("2026-03-20T10:00:00Z");
      expect(record!.commitsSinceUpdate).toBe(3);
      expect(record!.lastScannedAt).toBeTruthy();
      expect(record!.createdAt).toBeTruthy();
      expect(record!.updatedAt).toBeTruthy();
    });

    it("updates an existing record when slug already exists", () => {
      const beforeUpdate = getKnowledge(instance.db, "mission-control");
      const originalCreatedAt = beforeUpdate!.createdAt;

      upsertKnowledge(instance.sqlite, {
        projectSlug: "mission-control",
        content: "# CLAUDE.md\n\nUpdated content.",
        contentHash: "def456hash",
        fileSize: 38,
        lastModified: "2026-03-21T12:00:00Z",
        commitsSinceUpdate: 0,
      });

      const record = getKnowledge(instance.db, "mission-control");
      expect(record).not.toBeNull();
      expect(record!.content).toBe("# CLAUDE.md\n\nUpdated content.");
      expect(record!.contentHash).toBe("def456hash");
      expect(record!.fileSize).toBe(38);
      expect(record!.lastModified).toBe("2026-03-21T12:00:00Z");
      expect(record!.commitsSinceUpdate).toBe(0);
      // createdAt should be preserved on update
      expect(record!.createdAt).toBe(originalCreatedAt);
    });
  });

  describe("getKnowledge", () => {
    it("returns null for unknown slug", () => {
      const record = getKnowledge(instance.db, "nonexistent-project");
      expect(record).toBeNull();
    });

    it("returns full record for known slug", () => {
      const record = getKnowledge(instance.db, "mission-control");
      expect(record).not.toBeNull();
      expect(record!.projectSlug).toBe("mission-control");
      expect(record!.content).toBeTruthy();
      expect(record!.contentHash).toBeTruthy();
      expect(record!.fileSize).toBeGreaterThan(0);
      expect(record!.lastModified).toBeTruthy();
      expect(typeof record!.commitsSinceUpdate).toBe("number");
      expect(record!.lastScannedAt).toBeTruthy();
      expect(record!.createdAt).toBeTruthy();
      expect(record!.updatedAt).toBeTruthy();
    });
  });

  describe("getAllKnowledge", () => {
    it("returns array of all records without content", () => {
      // Add another record
      upsertKnowledge(instance.sqlite, {
        projectSlug: "openefb",
        content: "# OpenEFB\n\nFlight bag app.",
        contentHash: "ghi789hash",
        fileSize: 30,
        lastModified: "2026-03-19T08:00:00Z",
        commitsSinceUpdate: 15,
      });

      const records = getAllKnowledge(instance.db);
      expect(records.length).toBeGreaterThanOrEqual(2);

      // Verify no content field in list records
      for (const record of records) {
        expect(record.projectSlug).toBeTruthy();
        expect(record.contentHash).toBeTruthy();
        expect(record.fileSize).toBeGreaterThan(0);
        expect(record.lastModified).toBeTruthy();
        expect(typeof record.commitsSinceUpdate).toBe("number");
        expect(record.lastScannedAt).toBeTruthy();
        // content should NOT be included in list results
        expect("content" in record).toBe(false);
      }
    });
  });
});
