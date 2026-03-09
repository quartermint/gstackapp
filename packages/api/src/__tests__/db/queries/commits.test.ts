import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";
import { upsertCommits, getCommitsByProject } from "../../../db/queries/commits.js";

describe("Commit queries", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("upsertCommits", () => {
    it("inserts new commits and they can be retrieved by project slug", () => {
      const commits = [
        {
          hash: "abc1234",
          message: "feat: initial commit",
          projectSlug: "mission-control",
          authorDate: "2026-03-01T10:00:00Z",
        },
        {
          hash: "def5678",
          message: "fix: resolve bug",
          projectSlug: "mission-control",
          authorDate: "2026-03-02T12:00:00Z",
        },
      ];

      upsertCommits(instance.db, instance.sqlite, commits);

      const results = getCommitsByProject(instance.db, "mission-control");
      expect(results.length).toBe(2);
      expect(results.map((r) => r.hash)).toContain("abc1234");
      expect(results.map((r) => r.hash)).toContain("def5678");
    });

    it("deduplicates by (project_slug, hash) -- re-inserting same commit does not create duplicate", () => {
      const commits = [
        {
          hash: "abc1234",
          message: "feat: initial commit",
          projectSlug: "mission-control",
          authorDate: "2026-03-01T10:00:00Z",
        },
      ];

      // Insert same commit again
      upsertCommits(instance.db, instance.sqlite, commits);

      const results = getCommitsByProject(instance.db, "mission-control");
      // Should still be 2 from the previous test, not 3
      expect(results.length).toBe(2);
    });

    it("updates message if hash exists but message changed (rebase scenario)", () => {
      const commits = [
        {
          hash: "abc1234",
          message: "feat: updated commit message after rebase",
          projectSlug: "mission-control",
          authorDate: "2026-03-01T10:00:00Z",
        },
      ];

      upsertCommits(instance.db, instance.sqlite, commits);

      const results = getCommitsByProject(instance.db, "mission-control");
      const updated = results.find((r) => r.hash === "abc1234");
      expect(updated).toBeDefined();
      expect(updated!.message).toBe("feat: updated commit message after rebase");
    });
  });

  describe("getCommitsByProject", () => {
    it("returns commits ordered by author_date descending", () => {
      const results = getCommitsByProject(instance.db, "mission-control");
      expect(results.length).toBeGreaterThan(1);

      // Verify descending order
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]!.authorDate >= results[i + 1]!.authorDate).toBe(true);
      }
    });

    it("returns empty array for unknown slug", () => {
      const results = getCommitsByProject(instance.db, "nonexistent-project");
      expect(results).toEqual([]);
    });
  });
});
