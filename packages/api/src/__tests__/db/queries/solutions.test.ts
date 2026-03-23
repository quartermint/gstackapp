import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "../../helpers/setup.js";
import type { DatabaseInstance } from "../../../db/index.js";
import {
  createSolution,
  getSolution,
  listSolutions,
  updateSolutionStatus,
  updateSolutionMetadata,
  solutionExistsForHash,
  getRelevantSolutions,
  recordSolutionReference,
  getCompoundScore,
} from "../../../db/queries/solutions.js";
import { solutions, solutionReferences } from "../../../db/schema.js";

describe("Solution queries", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    instance.db.delete(solutionReferences).run();
    instance.db.delete(solutions).run();
  });

  describe("createSolution", () => {
    it("inserts a row and returns it with generated id", () => {
      const result = createSolution(instance.db, {
        title: "Fix null pointer in scanner",
        content: "Added null check before accessing scanner results",
        contentHash: "hash-abc-123",
        projectSlug: "mission-control",
        sessionId: "session-1",
        problemType: "bug_fix",
        severity: "high",
      });

      expect(result.id).toBeTruthy();
      expect(result.title).toBe("Fix null pointer in scanner");
      expect(result.content).toBe("Added null check before accessing scanner results");
      expect(result.contentHash).toBe("hash-abc-123");
      expect(result.projectSlug).toBe("mission-control");
      expect(result.sessionId).toBe("session-1");
      expect(result.problemType).toBe("bug_fix");
      expect(result.severity).toBe("high");
      expect(result.referenceCount).toBe(0);
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
    });

    it("defaults status to candidate when omitted", () => {
      const result = createSolution(instance.db, {
        title: "Architecture refactor",
        content: "Refactored module structure",
        contentHash: "hash-def-456",
      });

      expect(result.status).toBe("candidate");
    });
  });

  describe("getSolution", () => {
    it("returns the correct solution by id", () => {
      const created = createSolution(instance.db, {
        title: "Test solution",
        content: "Test content",
        contentHash: "hash-get-test",
      });

      const found = getSolution(instance.db, created.id);
      expect(found.id).toBe(created.id);
      expect(found.title).toBe("Test solution");
    });

    it("throws notFound for missing id", () => {
      expect(() => getSolution(instance.db, "nonexistent-id")).toThrow(
        /not found/i
      );
    });
  });

  describe("listSolutions", () => {
    it("filters by projectSlug correctly", () => {
      createSolution(instance.db, {
        title: "MC Solution",
        content: "Content A",
        contentHash: "hash-list-1",
        projectSlug: "mission-control",
      });
      createSolution(instance.db, {
        title: "EFB Solution",
        content: "Content B",
        contentHash: "hash-list-2",
        projectSlug: "openefb",
      });

      const result = listSolutions(instance.db, { projectSlug: "mission-control" });
      expect(result.solutions).toHaveLength(1);
      expect(result.solutions[0]!.projectSlug).toBe("mission-control");
      expect(result.total).toBe(1);
    });

    it("filters by status correctly", () => {
      createSolution(instance.db, {
        title: "Candidate",
        content: "C1",
        contentHash: "hash-status-1",
      });
      const accepted = createSolution(instance.db, {
        title: "Accepted",
        content: "C2",
        contentHash: "hash-status-2",
      });
      updateSolutionStatus(instance.db, accepted.id, "accepted");

      const result = listSolutions(instance.db, { status: "accepted" });
      expect(result.solutions).toHaveLength(1);
      expect(result.solutions[0]!.status).toBe("accepted");
    });

    it("respects limit and offset, returns correct total", () => {
      for (let i = 0; i < 5; i++) {
        createSolution(instance.db, {
          title: `Solution ${i}`,
          content: `Content ${i}`,
          contentHash: `hash-page-${i}`,
        });
      }

      const page1 = listSolutions(instance.db, { limit: 2, offset: 0 });
      expect(page1.solutions).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = listSolutions(instance.db, { limit: 2, offset: 2 });
      expect(page2.solutions).toHaveLength(2);
      expect(page2.total).toBe(5);
    });
  });

  describe("updateSolutionStatus", () => {
    it("changes status and sets reviewedAt timestamp", () => {
      const created = createSolution(instance.db, {
        title: "To review",
        content: "Review me",
        contentHash: "hash-review-1",
      });
      expect(created.reviewedAt).toBeNull();

      const updated = updateSolutionStatus(instance.db, created.id, "accepted");
      expect(updated.status).toBe("accepted");
      expect(updated.reviewedAt).toBeTruthy();
    });
  });

  describe("updateSolutionMetadata", () => {
    it("updates enrichment fields", () => {
      const created = createSolution(instance.db, {
        title: "Original title",
        content: "Content",
        contentHash: "hash-meta-1",
      });

      const updated = updateSolutionMetadata(instance.db, created.id, {
        title: "Updated title",
        module: "scanner",
        problemType: "performance",
        symptoms: "slow scan",
        rootCause: "N+1 queries",
        severity: "high",
      });

      expect(updated.title).toBe("Updated title");
      expect(updated.module).toBe("scanner");
      expect(updated.problemType).toBe("performance");
      expect(updated.symptoms).toBe("slow scan");
      expect(updated.rootCause).toBe("N+1 queries");
      expect(updated.severity).toBe("high");
    });
  });

  describe("solutionExistsForHash", () => {
    it("returns true for existing hash, false for new hash", () => {
      createSolution(instance.db, {
        title: "Dedup test",
        content: "Content",
        contentHash: "hash-dedup-exists",
      });

      expect(solutionExistsForHash(instance.db, "hash-dedup-exists")).toBe(true);
      expect(solutionExistsForHash(instance.db, "hash-dedup-new")).toBe(false);
    });
  });

  describe("getRelevantSolutions", () => {
    it("returns only accepted solutions ordered by referenceCount DESC", () => {
      // Create solutions with different statuses
      const s1 = createSolution(instance.db, {
        title: "Accepted high refs",
        content: "C1",
        contentHash: "hash-rel-1",
        projectSlug: "mission-control",
      });
      const s2 = createSolution(instance.db, {
        title: "Accepted low refs",
        content: "C2",
        contentHash: "hash-rel-2",
        projectSlug: "mission-control",
      });
      createSolution(instance.db, {
        title: "Candidate (should not appear)",
        content: "C3",
        contentHash: "hash-rel-3",
        projectSlug: "mission-control",
      });

      // Accept the first two
      updateSolutionStatus(instance.db, s1.id, "accepted");
      updateSolutionStatus(instance.db, s2.id, "accepted");

      // Add references to s1 to make it ranked higher
      recordSolutionReference(instance.db, s1.id, "sess-1", "startup_banner");
      recordSolutionReference(instance.db, s1.id, "sess-2", "mcp_query");

      const relevant = getRelevantSolutions(instance.db, "mission-control");
      expect(relevant).toHaveLength(2);
      expect(relevant[0]!.title).toBe("Accepted high refs");
      expect(relevant[0]!.referenceCount).toBe(2);
      expect(relevant[1]!.title).toBe("Accepted low refs");
    });
  });

  describe("recordSolutionReference", () => {
    it("inserts reference and increments solution referenceCount", () => {
      const solution = createSolution(instance.db, {
        title: "Ref test",
        content: "Content",
        contentHash: "hash-ref-1",
      });
      expect(solution.referenceCount).toBe(0);

      recordSolutionReference(instance.db, solution.id, "sess-abc", "startup_banner");

      const updated = getSolution(instance.db, solution.id);
      expect(updated.referenceCount).toBe(1);

      recordSolutionReference(instance.db, solution.id, "sess-def", "search_result");
      const updated2 = getSolution(instance.db, solution.id);
      expect(updated2.referenceCount).toBe(2);
    });
  });

  describe("getCompoundScore", () => {
    it("returns correct shape with zero values initially", () => {
      const score = getCompoundScore(instance.db);
      expect(score.totalSolutions).toBe(0);
      expect(score.acceptedSolutions).toBe(0);
      expect(score.referencedSolutions).toBe(0);
      expect(score.totalReferences).toBe(0);
      expect(score.reuseRate).toBe(0);
      expect(score.weeklyTrend).toEqual([]);
    });

    it("returns correct reuseRate after creating accepted solutions with references", () => {
      // Create 3 accepted solutions
      const s1 = createSolution(instance.db, {
        title: "S1",
        content: "C1",
        contentHash: "hash-score-1",
      });
      const s2 = createSolution(instance.db, {
        title: "S2",
        content: "C2",
        contentHash: "hash-score-2",
      });
      const s3 = createSolution(instance.db, {
        title: "S3",
        content: "C3",
        contentHash: "hash-score-3",
      });

      updateSolutionStatus(instance.db, s1.id, "accepted");
      updateSolutionStatus(instance.db, s2.id, "accepted");
      updateSolutionStatus(instance.db, s3.id, "accepted");

      // Add references to 2 of 3
      recordSolutionReference(instance.db, s1.id, "sess-1", "startup_banner");
      recordSolutionReference(instance.db, s2.id, "sess-2", "mcp_query");
      recordSolutionReference(instance.db, s2.id, "sess-3", "search_result");

      const score = getCompoundScore(instance.db);
      expect(score.totalSolutions).toBe(3);
      expect(score.acceptedSolutions).toBe(3);
      expect(score.referencedSolutions).toBe(2);
      expect(score.totalReferences).toBe(3); // 1 + 2
      expect(score.reuseRate).toBeCloseTo(2 / 3, 5);
    });
  });
});
