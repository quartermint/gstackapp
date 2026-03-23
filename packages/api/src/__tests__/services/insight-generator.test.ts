import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { captures, commits, sessions, projectKnowledge, insights } from "../../db/schema.js";

// Mock event-bus (insights query layer emits events)
vi.mock("../../services/event-bus.js", () => ({
  eventBus: { emit: vi.fn() },
}));

import {
  generateStaleCaptureInsights,
  detectActivityGaps,
  detectSessionPatterns,
  detectCrossProjectPatterns,
  generateAllInsights,
} from "../../services/insight-generator.js";

// ── Helpers ──────────────────────────────────────────────────

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function seedCapture(
  instance: DatabaseInstance,
  overrides: {
    id?: string;
    rawContent?: string;
    projectId?: string | null;
    status?: string;
    createdAt?: Date;
  } = {}
) {
  const now = new Date();
  instance.db
    .insert(captures)
    .values({
      id: overrides.id ?? `cap-${Math.random().toString(36).slice(2, 8)}`,
      rawContent: overrides.rawContent ?? "test capture content",
      type: "text",
      status: (overrides.status as "raw") ?? "raw",
      projectId: overrides.projectId ?? null,
      createdAt: overrides.createdAt ?? now,
      updatedAt: now,
    })
    .run();
}

function seedCommit(
  instance: DatabaseInstance,
  overrides: {
    projectSlug: string;
    authorDate?: string;
    hash?: string;
    message?: string;
  }
) {
  const id = `commit-${Math.random().toString(36).slice(2, 8)}`;
  instance.db
    .insert(commits)
    .values({
      id,
      hash: overrides.hash ?? id,
      message: overrides.message ?? "test commit",
      projectSlug: overrides.projectSlug,
      authorDate: overrides.authorDate ?? new Date().toISOString(),
      createdAt: new Date(),
    })
    .run();
}

function seedSession(
  instance: DatabaseInstance,
  overrides: {
    startedAt: Date;
    endedAt?: Date;
    status?: string;
    projectSlug?: string;
  }
) {
  const id = `session-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  instance.db
    .insert(sessions)
    .values({
      id,
      source: "claude-code",
      tier: "opus",
      cwd: "/test",
      status: (overrides.status as "completed") ?? "completed",
      projectSlug: overrides.projectSlug ?? null,
      startedAt: overrides.startedAt,
      endedAt: overrides.endedAt ?? new Date(overrides.startedAt.getTime() + 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function seedKnowledge(
  instance: DatabaseInstance,
  slug: string,
  content: string
) {
  const now = new Date().toISOString();
  instance.db
    .insert(projectKnowledge)
    .values({
      projectSlug: slug,
      content,
      contentHash: `hash-${slug}`,
      fileSize: content.length,
      lastModified: now,
      lastScannedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

// ── Tests ────────────────────────────────────────────────────

describe("insight-generator", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    // Clear all relevant tables
    instance.db.delete(insights).run();
    instance.db.delete(captures).run();
    instance.db.delete(commits).run();
    instance.db.delete(sessions).run();
    instance.db.delete(projectKnowledge).run();
  });

  // ── generateStaleCaptureInsights ──────────────────────────

  describe("generateStaleCaptureInsights", () => {
    it("creates insight when captures >7d old without project assignment exist", () => {
      // Seed 3 captures older than 7 days, no project
      seedCapture(instance, { id: "old-1", createdAt: daysAgo(10) });
      seedCapture(instance, { id: "old-2", createdAt: daysAgo(8) });
      seedCapture(instance, { id: "old-3", createdAt: daysAgo(14) });

      const count = generateStaleCaptureInsights(instance.db);
      expect(count).toBe(1);

      const active = instance.db.select().from(insights).all();
      expect(active).toHaveLength(1);
      expect(active[0]!.type).toBe("stale_capture");
      expect(active[0]!.title).toContain("3");
      expect(active[0]!.title).toContain("captures");
    });

    it("does NOT create insight when no stale captures exist", () => {
      // Only recent captures
      seedCapture(instance, { id: "recent-1", createdAt: daysAgo(2) });
      seedCapture(instance, { id: "recent-2", createdAt: daysAgo(5) });

      const count = generateStaleCaptureInsights(instance.db);
      expect(count).toBe(0);

      const all = instance.db.select().from(insights).all();
      expect(all).toHaveLength(0);
    });

    it("excludes captures that have a project assignment", () => {
      seedCapture(instance, { id: "assigned", createdAt: daysAgo(10), projectId: "mission-control" });

      const count = generateStaleCaptureInsights(instance.db);
      expect(count).toBe(0);
    });

    it("excludes archived captures", () => {
      seedCapture(instance, { id: "archived-1", createdAt: daysAgo(10), status: "archived" });

      const count = generateStaleCaptureInsights(instance.db);
      expect(count).toBe(0);
    });

    it("deduplicates same-day calls (content-hash dedup)", () => {
      seedCapture(instance, { id: "stale-1", createdAt: daysAgo(10) });

      const first = generateStaleCaptureInsights(instance.db);
      expect(first).toBe(1);

      const second = generateStaleCaptureInsights(instance.db);
      expect(second).toBe(0);

      const all = instance.db.select().from(insights).all();
      expect(all).toHaveLength(1);
    });
  });

  // ── detectActivityGaps ────────────────────────────────────

  describe("detectActivityGaps", () => {
    it("creates insight when project has >=3 captures in 7d but no commits in 7d", () => {
      const slug = "test-project";
      // 3 captures in last 7 days with project assignment
      seedCapture(instance, { id: "gap-1", projectId: slug, createdAt: daysAgo(1) });
      seedCapture(instance, { id: "gap-2", projectId: slug, createdAt: daysAgo(2) });
      seedCapture(instance, { id: "gap-3", projectId: slug, createdAt: daysAgo(3) });

      // Last commit was 10 days ago
      seedCommit(instance, { projectSlug: slug, authorDate: daysAgo(10).toISOString() });

      const count = detectActivityGaps(instance.db);
      expect(count).toBe(1);

      const active = instance.db.select().from(insights).all();
      expect(active).toHaveLength(1);
      expect(active[0]!.type).toBe("activity_gap");
      expect(active[0]!.projectSlug).toBe(slug);
    });

    it("does NOT create insight when project has recent commits", () => {
      const slug = "active-project";
      seedCapture(instance, { id: "ac-1", projectId: slug, createdAt: daysAgo(1) });
      seedCapture(instance, { id: "ac-2", projectId: slug, createdAt: daysAgo(2) });
      seedCapture(instance, { id: "ac-3", projectId: slug, createdAt: daysAgo(3) });

      // Recent commit
      seedCommit(instance, { projectSlug: slug, authorDate: daysAgo(1).toISOString() });

      const count = detectActivityGaps(instance.db);
      expect(count).toBe(0);
    });

    it("does NOT create insight when project has <3 captures", () => {
      const slug = "few-captures";
      seedCapture(instance, { id: "fc-1", projectId: slug, createdAt: daysAgo(1) });
      seedCapture(instance, { id: "fc-2", projectId: slug, createdAt: daysAgo(2) });

      // Old commit
      seedCommit(instance, { projectSlug: slug, authorDate: daysAgo(10).toISOString() });

      const count = detectActivityGaps(instance.db);
      expect(count).toBe(0);
    });

    it("creates insight when project has no commits at all", () => {
      const slug = "no-commits";
      seedCapture(instance, { id: "nc-1", projectId: slug, createdAt: daysAgo(1) });
      seedCapture(instance, { id: "nc-2", projectId: slug, createdAt: daysAgo(2) });
      seedCapture(instance, { id: "nc-3", projectId: slug, createdAt: daysAgo(3) });

      const count = detectActivityGaps(instance.db);
      expect(count).toBe(1);
    });
  });

  // ── detectSessionPatterns ─────────────────────────────────

  describe("detectSessionPatterns", () => {
    it("creates insight with peak hour and avg duration when >=10 completed sessions exist", () => {
      // Seed 10 sessions, most at 10am hour
      for (let i = 0; i < 7; i++) {
        const start = new Date(2026, 2, 20, 10, 0, 0);
        start.setDate(start.getDate() - i);
        seedSession(instance, {
          startedAt: start,
          endedAt: new Date(start.getTime() + 90 * 60_000), // 90 min each
        });
      }
      // 3 sessions at 3pm
      for (let i = 0; i < 3; i++) {
        const start = new Date(2026, 2, 20, 15, 0, 0);
        start.setDate(start.getDate() - i);
        seedSession(instance, {
          startedAt: start,
          endedAt: new Date(start.getTime() + 60 * 60_000), // 60 min each
        });
      }

      const count = detectSessionPatterns(instance.db);
      expect(count).toBe(1);

      const active = instance.db.select().from(insights).all();
      expect(active).toHaveLength(1);
      expect(active[0]!.type).toBe("session_pattern");
      expect(active[0]!.title).toContain("10am");
    });

    it("does NOT create insight when <10 sessions exist", () => {
      // Only 5 sessions
      for (let i = 0; i < 5; i++) {
        const start = new Date(2026, 2, 20, 10, 0, 0);
        start.setDate(start.getDate() - i);
        seedSession(instance, {
          startedAt: start,
          endedAt: new Date(start.getTime() + 60 * 60_000),
        });
      }

      const count = detectSessionPatterns(instance.db);
      expect(count).toBe(0);

      const all = instance.db.select().from(insights).all();
      expect(all).toHaveLength(0);
    });

    it("excludes non-completed sessions from analysis", () => {
      // 10 active (non-completed) sessions
      for (let i = 0; i < 10; i++) {
        const start = new Date(2026, 2, 20, 10, 0, 0);
        start.setDate(start.getDate() - i);
        seedSession(instance, {
          startedAt: start,
          endedAt: new Date(start.getTime() + 60 * 60_000),
          status: "active",
        });
      }

      const count = detectSessionPatterns(instance.db);
      expect(count).toBe(0);
    });
  });

  // ── detectCrossProjectPatterns ────────────────────────────

  describe("detectCrossProjectPatterns", () => {
    it("creates insight when 2 projects share >=3 overlapping terms in captures", () => {
      const slugA = "project-alpha";
      const slugB = "project-beta";

      // Captures with shared terms: "typescript", "drizzle", "sqlite", "migration"
      seedCapture(instance, {
        id: "cross-a1",
        projectId: slugA,
        rawContent: "Working on typescript drizzle sqlite migration schema",
        createdAt: daysAgo(2),
      });
      seedCapture(instance, {
        id: "cross-a2",
        projectId: slugA,
        rawContent: "Fix typescript drizzle query performance sqlite migration",
        createdAt: daysAgo(3),
      });
      seedCapture(instance, {
        id: "cross-b1",
        projectId: slugB,
        rawContent: "Setup typescript drizzle with sqlite for migration testing",
        createdAt: daysAgo(1),
      });
      seedCapture(instance, {
        id: "cross-b2",
        projectId: slugB,
        rawContent: "Testing typescript drizzle sqlite integration migration patterns",
        createdAt: daysAgo(4),
      });

      const count = detectCrossProjectPatterns(instance.db);
      expect(count).toBe(1);

      const active = instance.db.select().from(insights).all();
      expect(active).toHaveLength(1);
      expect(active[0]!.type).toBe("cross_project");
      expect(active[0]!.title).toContain(slugA);
      expect(active[0]!.title).toContain(slugB);

      // Metadata should contain evidence
      const meta = JSON.parse(active[0]!.metadata!);
      expect(meta.projects).toContain(slugA);
      expect(meta.projects).toContain(slugB);
      expect(meta.sharedTerms.length).toBeGreaterThanOrEqual(3);
    });

    it("does NOT create insight when projects have no overlapping terms", () => {
      const slugA = "project-one";
      const slugB = "project-two";

      seedCapture(instance, {
        id: "nooverlap-a1",
        projectId: slugA,
        rawContent: "Building react components with tailwind styling",
        createdAt: daysAgo(2),
      });
      seedCapture(instance, {
        id: "nooverlap-a2",
        projectId: slugA,
        rawContent: "React hooks custom tailwind widgets frontend",
        createdAt: daysAgo(3),
      });
      seedCapture(instance, {
        id: "nooverlap-b1",
        projectId: slugB,
        rawContent: "Python flask server configuration backend setup",
        createdAt: daysAgo(1),
      });
      seedCapture(instance, {
        id: "nooverlap-b2",
        projectId: slugB,
        rawContent: "Flask deployment docker container backend",
        createdAt: daysAgo(4),
      });

      const count = detectCrossProjectPatterns(instance.db);
      expect(count).toBe(0);
    });

    it("includes projectKnowledge content in term analysis", () => {
      const slugA = "knowledge-a";
      const slugB = "knowledge-b";

      // Knowledge content has shared terms (typescript, drizzle, sqlite, migration)
      seedKnowledge(instance, slugA, "TypeScript drizzle sqlite migration TypeScript drizzle sqlite migration");
      seedKnowledge(instance, slugB, "TypeScript drizzle sqlite migration TypeScript drizzle sqlite migration");

      // Captures also reference shared terms so each term has >= 2 occurrences total
      seedCapture(instance, {
        id: "know-a1",
        projectId: slugA,
        rawContent: "typescript drizzle sqlite migration setup",
        createdAt: daysAgo(1),
      });
      seedCapture(instance, {
        id: "know-b1",
        projectId: slugB,
        rawContent: "typescript drizzle sqlite migration testing",
        createdAt: daysAgo(1),
      });

      const count = detectCrossProjectPatterns(instance.db);
      expect(count).toBe(1);
    });
  });

  // ── generateAllInsights ───────────────────────────────────

  describe("generateAllInsights", () => {
    it("calls all 4 detectors and returns total count", () => {
      // Seed data for stale captures
      seedCapture(instance, { id: "all-stale-1", createdAt: daysAgo(10) });

      // Seed data for activity gap
      const slug = "gap-project";
      seedCapture(instance, { id: "all-gap-1", projectId: slug, createdAt: daysAgo(1) });
      seedCapture(instance, { id: "all-gap-2", projectId: slug, createdAt: daysAgo(2) });
      seedCapture(instance, { id: "all-gap-3", projectId: slug, createdAt: daysAgo(3) });
      seedCommit(instance, { projectSlug: slug, authorDate: daysAgo(10).toISOString() });

      const total = generateAllInsights(instance.db);
      // At least stale capture + activity gap
      expect(total).toBeGreaterThanOrEqual(2);

      const all = instance.db.select().from(insights).all();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });
});
