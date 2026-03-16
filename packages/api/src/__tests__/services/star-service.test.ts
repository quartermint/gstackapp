/**
 * Tests for the star sync service.
 *
 * Uses vi.hoisted + promisify.custom to correctly mock promisified execFile,
 * matching the pattern from discovery-scanner-ssh-github.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";

// Mock child_process before any module under test imports it.
const { mockExecFilePromise, mockExecFileCb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { promisify } = require("node:util") as typeof import("node:util");
  const promiseMock = vi.fn();
  const cbMock = vi.fn();
  (cbMock as unknown as Record<symbol, unknown>)[promisify.custom] = promiseMock;
  return { mockExecFilePromise: promiseMock, mockExecFileCb: cbMock };
});
vi.mock("node:child_process", () => ({
  execFile: mockExecFileCb,
}));

import { upsertStar, getStarCount } from "../../db/queries/stars.js";
import { checkRateLimit, fetchStarsFromGitHub, syncStars } from "../../services/star-service.js";
import { eventBus } from "../../services/event-bus.js";

const makeGitHubStar = (overrides: Partial<{
  starred_at: string;
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  html_url: string;
}> = {}) => ({
  starred_at: overrides.starred_at ?? "2024-06-15T10:00:00Z",
  repo: {
    id: overrides.id ?? 12345,
    full_name: overrides.full_name ?? "owner/test-repo",
    description: overrides.description ?? "A test repository",
    language: overrides.language ?? "TypeScript",
    topics: overrides.topics ?? ["test"],
    html_url: overrides.html_url ?? "https://github.com/owner/test-repo",
  },
});

describe("star service", () => {
  let instance: DatabaseInstance;

  beforeEach(() => {
    instance = createTestDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    instance.sqlite.close();
  });

  describe("checkRateLimit", () => {
    it("returns remaining and limit on success", async () => {
      mockExecFilePromise.mockResolvedValueOnce({
        stdout: JSON.stringify({ remaining: 4500, limit: 5000 }),
        stderr: "",
      });

      const result = await checkRateLimit();
      expect(result.remaining).toBe(4500);
      expect(result.limit).toBe(5000);
    });

    it("returns low budget values", async () => {
      mockExecFilePromise.mockResolvedValueOnce({
        stdout: JSON.stringify({ remaining: 200, limit: 5000 }),
        stderr: "",
      });

      const result = await checkRateLimit();
      expect(result.remaining).toBe(200);
      expect(result.limit).toBe(5000);
    });

    it("returns zeros on gh CLI error", async () => {
      mockExecFilePromise.mockRejectedValueOnce(new Error("gh not found"));

      const result = await checkRateLimit();
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(0);
    });
  });

  describe("fetchStarsFromGitHub", () => {
    it("parses valid star response", async () => {
      const stars = [makeGitHubStar({ id: 1 }), makeGitHubStar({ id: 2 })];
      mockExecFilePromise.mockResolvedValueOnce({
        stdout: JSON.stringify(stars),
        stderr: "",
      });

      const result = await fetchStarsFromGitHub();
      expect(result).toHaveLength(2);
      expect(result[0]!.repo.id).toBe(1);
      expect(result[1]!.repo.id).toBe(2);
    });

    it("returns empty array for empty response", async () => {
      mockExecFilePromise.mockResolvedValueOnce({
        stdout: "[]",
        stderr: "",
      });

      const result = await fetchStarsFromGitHub();
      expect(result).toEqual([]);
    });

    it("propagates error on gh CLI failure", async () => {
      mockExecFilePromise.mockRejectedValueOnce(new Error("gh api failed"));

      await expect(fetchStarsFromGitHub()).rejects.toThrow("gh api failed");
    });
  });

  describe("syncStars", () => {
    it("performs full sync when no existing stars", async () => {
      const emitSpy = vi.spyOn(eventBus, "emit");

      // Rate limit check
      mockExecFilePromise.mockResolvedValueOnce({
        stdout: JSON.stringify({ remaining: 4500, limit: 5000 }),
        stderr: "",
      });

      // Stars fetch
      const stars = [
        makeGitHubStar({ id: 101, starred_at: "2024-06-01T00:00:00Z" }),
        makeGitHubStar({ id: 102, starred_at: "2024-06-02T00:00:00Z" }),
        makeGitHubStar({ id: 103, starred_at: "2024-06-03T00:00:00Z" }),
      ];
      mockExecFilePromise.mockResolvedValueOnce({
        stdout: JSON.stringify(stars),
        stderr: "",
      });

      const result = await syncStars(instance.db);

      expect(result.synced).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.total).toBe(3);
      expect(getStarCount(instance.db)).toBe(3);

      // Verify SSE event emitted
      expect(emitSpy).toHaveBeenCalledWith("mc:event", expect.objectContaining({
        type: "star:synced",
        id: "all",
      }));

      emitSpy.mockRestore();
    });

    it("performs incremental sync (only new stars)", async () => {
      // Pre-populate DB with 2 stars
      upsertStar(instance.db, {
        githubId: 201,
        fullName: "owner/old-1",
        description: null,
        language: null,
        topics: [],
        htmlUrl: "https://github.com/owner/old-1",
        starredAt: new Date("2024-06-01T00:00:00Z"),
      });
      upsertStar(instance.db, {
        githubId: 202,
        fullName: "owner/old-2",
        description: null,
        language: null,
        topics: [],
        htmlUrl: "https://github.com/owner/old-2",
        starredAt: new Date("2024-06-02T00:00:00Z"),
      });

      // Rate limit check
      mockExecFilePromise.mockResolvedValueOnce({
        stdout: JSON.stringify({ remaining: 4500, limit: 5000 }),
        stderr: "",
      });

      // GitHub returns 3 stars (2 old + 1 new)
      const stars = [
        makeGitHubStar({ id: 201, starred_at: "2024-06-01T00:00:00Z" }),
        makeGitHubStar({ id: 202, starred_at: "2024-06-02T00:00:00Z" }),
        makeGitHubStar({ id: 203, starred_at: "2024-06-03T00:00:00Z" }),
      ];
      mockExecFilePromise.mockResolvedValueOnce({
        stdout: JSON.stringify(stars),
        stderr: "",
      });

      const result = await syncStars(instance.db);

      expect(result.synced).toBe(1); // Only the new one
      expect(result.skipped).toBe(2);
      expect(result.total).toBe(3);
    });

    it("skips sync when rate limit is low", async () => {
      // Rate limit check returns low budget
      mockExecFilePromise.mockResolvedValueOnce({
        stdout: JSON.stringify({ remaining: 100, limit: 5000 }),
        stderr: "",
      });

      const result = await syncStars(instance.db);

      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(0);
      // Should not have called fetchStarsFromGitHub (only 1 mock call consumed)
      expect(mockExecFilePromise).toHaveBeenCalledTimes(1);
    });

    it("handles GitHub API failure gracefully", async () => {
      // Rate limit check
      mockExecFilePromise.mockResolvedValueOnce({
        stdout: JSON.stringify({ remaining: 4500, limit: 5000 }),
        stderr: "",
      });

      // Stars fetch fails
      mockExecFilePromise.mockRejectedValueOnce(new Error("Network error"));

      const result = await syncStars(instance.db);

      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });
});
