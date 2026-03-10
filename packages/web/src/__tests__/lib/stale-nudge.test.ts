import { describe, it, expect } from "vitest";
import { isStaleWithDirty, getStaleNudgeMessage } from "../../lib/stale-nudge.js";

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("stale-nudge", () => {
  describe("isStaleWithDirty", () => {
    it("returns true when lastCommitDate > 14 days ago AND dirtyFiles.length > 0", () => {
      const result = isStaleWithDirty({
        lastCommitDate: daysAgo(20),
        dirty: true,
        dirtyFiles: ["file1.ts"],
      });
      expect(result).toBe(true);
    });

    it("returns false when lastCommitDate < 14 days ago", () => {
      const result = isStaleWithDirty({
        lastCommitDate: daysAgo(5),
        dirty: true,
        dirtyFiles: ["file1.ts"],
      });
      expect(result).toBe(false);
    });

    it("returns false when dirtyFiles is empty", () => {
      const result = isStaleWithDirty({
        lastCommitDate: daysAgo(20),
        dirty: true,
        dirtyFiles: [],
      });
      expect(result).toBe(false);
    });

    it("returns false when lastCommitDate is null", () => {
      const result = isStaleWithDirty({
        lastCommitDate: null,
        dirty: true,
        dirtyFiles: ["file1.ts"],
      });
      expect(result).toBe(false);
    });

    it("returns false when dirty is false even with old commit and files", () => {
      const result = isStaleWithDirty({
        lastCommitDate: daysAgo(20),
        dirty: false,
        dirtyFiles: ["file1.ts"],
      });
      expect(result).toBe(false);
    });

    it("returns false when dirty is null", () => {
      const result = isStaleWithDirty({
        lastCommitDate: daysAgo(20),
        dirty: null,
        dirtyFiles: ["file1.ts"],
      });
      expect(result).toBe(false);
    });

    it("returns true at exactly 15 days (boundary test)", () => {
      const result = isStaleWithDirty({
        lastCommitDate: daysAgo(15),
        dirty: true,
        dirtyFiles: ["file1.ts"],
      });
      expect(result).toBe(true);
    });

    it("returns false at exactly 14 days (boundary test)", () => {
      const result = isStaleWithDirty({
        lastCommitDate: daysAgo(14),
        dirty: true,
        dirtyFiles: ["file1.ts"],
      });
      expect(result).toBe(false);
    });
  });

  describe("getStaleNudgeMessage", () => {
    it("returns descriptive message with days idle", () => {
      const message = getStaleNudgeMessage({
        lastCommitDate: daysAgo(20),
        dirtyFiles: ["file1.ts", "file2.ts"],
      });
      expect(message).toContain("20");
      expect(message).toContain("uncommitted");
      expect(message).toContain("idle");
    });

    it("returns empty string when lastCommitDate is null", () => {
      const message = getStaleNudgeMessage({
        lastCommitDate: null,
        dirtyFiles: ["file1.ts"],
      });
      expect(message).toBe("");
    });
  });
});
