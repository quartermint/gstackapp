import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";

// Mock node-stream-zip before importing the module under test
vi.mock("node-stream-zip", () => {
  class MockStreamZip {
    private _entries: Record<string, { name: string }>;
    private _data: Record<string, string>;

    constructor(_opts: { file: string }) {
      // Entries and data will be set via the static helper
      this._entries = MockStreamZip._pendingEntries;
      this._data = MockStreamZip._pendingData;
    }

    static _pendingEntries: Record<string, { name: string }> = {};
    static _pendingData: Record<string, string> = {};

    async entries() {
      return this._entries;
    }

    async entryData(entry: string) {
      const content = this._data[entry] ?? "";
      return Buffer.from(content, "utf-8");
    }

    async close() {
      // no-op
    }

    static setMockData(entries: Record<string, { name: string }>, data: Record<string, string>) {
      MockStreamZip._pendingEntries = entries;
      MockStreamZip._pendingData = data;
    }
  }

  return {
    default: {
      async: MockStreamZip,
    },
  };
});

// Mock node:fs for findLatestBackupZip
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readdirSync: vi.fn(actual.readdirSync),
    statSync: vi.fn(actual.statSync),
  };
});

import { readdirSync } from "node:fs";

const mockReaddirSync = vi.mocked(readdirSync);

// Import module under test (after mocks)
const {
  computeContentHash,
  classifyCapacitiesEntry,
  buildCaptureContent,
  findLatestBackupZip,
  importCapacitiesBackup,
} = await import("../../services/capacities-importer.js");

// Access the mock class for setting test data
const StreamZipModule = await import("node-stream-zip");
const MockStreamZip = (StreamZipModule.default as unknown as { async: { setMockData: (e: Record<string, { name: string }>, d: Record<string, string>) => void } }).async;

describe("Capacities Importer", () => {
  describe("computeContentHash", () => {
    it("returns consistent SHA-256 hash for same content", () => {
      const hash1 = computeContentHash("hello world");
      const hash2 = computeContentHash("hello world");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it("normalizes CRLF to LF before hashing", () => {
      const hashCrlf = computeContentHash("line1\r\nline2");
      const hashLf = computeContentHash("line1\nline2");
      expect(hashCrlf).toBe(hashLf);
    });

    it("returns different hashes for different content", () => {
      const hash1 = computeContentHash("content A");
      const hash2 = computeContentHash("content B");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("classifyCapacitiesEntry", () => {
    it("classifies tweet entries", () => {
      const result = classifyCapacitiesEntry("Space/Tweets/some-tweet.md", {});
      expect(result).toEqual({ sourceSubtype: "tweet", captureType: "link" });
    });

    it("classifies weblink entries", () => {
      const result = classifyCapacitiesEntry("Space/Weblinks/some-link.md", {});
      expect(result).toEqual({ sourceSubtype: "weblink", captureType: "link" });
    });

    it("classifies daily note entries", () => {
      const result = classifyCapacitiesEntry("Space/DailyNotes/2026-03-23.md", {});
      expect(result).toEqual({ sourceSubtype: "daily_note", captureType: "text" });
    });

    it("classifies people entries", () => {
      const result = classifyCapacitiesEntry("Space/People/john.md", {});
      expect(result).toEqual({ sourceSubtype: "person", captureType: "text" });
    });

    it("defaults to other for unknown paths", () => {
      const result = classifyCapacitiesEntry("Space/Random/thing.md", {});
      expect(result).toEqual({ sourceSubtype: "other", captureType: "text" });
    });
  });

  describe("buildCaptureContent", () => {
    it("builds tweet content as URL", () => {
      const content = buildCaptureContent(
        { url: "https://x.com/user/status/123" },
        "Some body text",
        "tweet"
      );
      expect(content).toBe("https://x.com/user/status/123");
    });

    it("builds weblink content with title, url, and body", () => {
      const content = buildCaptureContent(
        { title: "Cool Article", url: "https://example.com/article" },
        "Article body here",
        "weblink"
      );
      expect(content).toBe("Cool Article\nhttps://example.com/article\nArticle body here");
    });

    it("builds daily note content from body", () => {
      const content = buildCaptureContent(
        { date: "2026-03-23" },
        "Today's notes here",
        "daily_note"
      );
      expect(content).toBe("Today's notes here");
    });

    it("falls back to date for empty daily notes", () => {
      const content = buildCaptureContent(
        { date: "2026-03-23" },
        "",
        "daily_note"
      );
      expect(content).toBe("Daily Note: 2026-03-23");
    });

    it("builds person content with title and body", () => {
      const content = buildCaptureContent(
        { title: "John Doe" },
        "Notes about John",
        "person"
      );
      expect(content).toBe("John Doe\nNotes about John");
    });
  });

  describe("findLatestBackupZip", () => {
    it("returns null when backup directory does not exist", () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = findLatestBackupZip({
        backupDir: "/nonexistent",
        scheduleId: "Schedule #1 (829272da)",
      });
      expect(result).toBeNull();
    });

    it("returns null when no ZIP files found", () => {
      mockReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

      const result = findLatestBackupZip({
        backupDir: "/backups",
        scheduleId: "Schedule #1 (829272da)",
      });
      expect(result).toBeNull();
    });

    it("returns the most recent ZIP file sorted by name", () => {
      mockReaddirSync.mockReturnValue([
        "Capacities (2026-03-20 00-00-00).zip",
        "Capacities (2026-03-23 00-38-22).zip",
        "Capacities (2026-03-21 12-00-00).zip",
      ] as unknown as ReturnType<typeof readdirSync>);

      const result = findLatestBackupZip({
        backupDir: "/backups",
        scheduleId: "Schedule #1 (829272da)",
      });
      expect(result).toContain("Capacities (2026-03-23 00-38-22).zip");
    });
  });

  describe("importCapacitiesBackup", () => {
    let instance: DatabaseInstance;

    beforeAll(() => {
      instance = createTestDb();
    });

    beforeEach(() => {
      // Clear captures between tests
      instance.sqlite.exec("DELETE FROM captures");
    });

    it("imports markdown files from ZIP and returns correct counts", async () => {
      const tweetMd = `---
title: "Cool tweet"
url: "https://x.com/user/status/123"
twitterHandle: "@user"
---
Tweet body`;

      const weblinkMd = `---
title: "Article Title"
url: "https://example.com/article"
domain: "example.com"
---
Article body text`;

      const dailyNoteMd = `---
title: "2026-03-23"
date: "2026-03-23"
---
Today I worked on MC`;

      const entries: Record<string, { name: string }> = {
        "Space/Tweets/cool-tweet.md": { name: "Space/Tweets/cool-tweet.md" },
        "Space/Weblinks/article.md": { name: "Space/Weblinks/article.md" },
        "Space/DailyNotes/2026-03-23.md": { name: "Space/DailyNotes/2026-03-23.md" },
        "Space/README.txt": { name: "Space/README.txt" }, // Non-md file, should be skipped
      };

      const data: Record<string, string> = {
        "Space/Tweets/cool-tweet.md": tweetMd,
        "Space/Weblinks/article.md": weblinkMd,
        "Space/DailyNotes/2026-03-23.md": dailyNoteMd,
      };

      MockStreamZip.setMockData(entries, data);

      const result = await importCapacitiesBackup(
        instance.db,
        instance.sqlite,
        "/fake/backup.zip"
      );

      expect(result.total).toBe(3);
      expect(result.imported).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.tweets).toBe(1);
      expect(result.weblinks).toBe(1);
      expect(result.dailyNotes).toBe(1);
    });

    it("skips duplicate items on second import (content-hash dedup)", async () => {
      const tweetMd = `---
title: "Duplicate tweet"
url: "https://x.com/user/status/456"
---
`;
      const entries: Record<string, { name: string }> = {
        "Space/Tweets/dup.md": { name: "Space/Tweets/dup.md" },
      };
      const data: Record<string, string> = {
        "Space/Tweets/dup.md": tweetMd,
      };

      MockStreamZip.setMockData(entries, data);

      // First import
      const result1 = await importCapacitiesBackup(
        instance.db,
        instance.sqlite,
        "/fake/backup.zip"
      );
      expect(result1.imported).toBe(1);

      // Second import (same content)
      const result2 = await importCapacitiesBackup(
        instance.db,
        instance.sqlite,
        "/fake/backup.zip"
      );
      expect(result2.imported).toBe(0);
      expect(result2.skipped).toBe(1);
    });

    it("emits SSE progress events during import", async () => {
      const { eventBus } = await import("../../services/event-bus.js");
      const events: unknown[] = [];
      const listener = (payload: unknown) => events.push(payload);
      eventBus.on("mc:event", listener);

      const entries: Record<string, { name: string }> = {};
      const data: Record<string, string> = {};

      // Create enough entries to trigger progress events (every 50)
      for (let i = 0; i < 3; i++) {
        const name = `Space/Tweets/tweet-${i}.md`;
        entries[name] = { name };
        data[name] = `---\ntitle: "Tweet ${i}"\nurl: "https://x.com/u/status/${i}"\n---\n`;
      }

      MockStreamZip.setMockData(entries, data);

      await importCapacitiesBackup(instance.db, instance.sqlite, "/fake/backup.zip");

      eventBus.removeListener("mc:event", listener);

      // Should have at least a completion event (uses capture:created with data.subtype)
      const completionEvent = events.find(
        (e: unknown) => {
          const evt = e as { type: string; data?: { subtype?: string } };
          return evt.type === "capture:created" && evt.data?.subtype === "import:complete";
        }
      );
      expect(completionEvent).toBeDefined();
    });
  });
});
