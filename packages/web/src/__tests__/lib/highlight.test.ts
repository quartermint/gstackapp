import { describe, it, expect } from "vitest";
import {
  computeChangedSlugs,
  sortWithChangedFirst,
} from "../../lib/highlight.js";
import type { ProjectItem } from "../../lib/grouping.js";

function makeProject(
  slug: string,
  lastCommitDate: string | null
): ProjectItem {
  return {
    slug,
    name: slug,
    tagline: null,
    path: `/test/${slug}`,
    host: "local" as const,
    branch: "main",
    dirty: false,
    dirtyFiles: [],
    lastCommitHash: lastCommitDate ? "abc123" : null,
    lastCommitMessage: lastCommitDate ? "test commit" : null,
    lastCommitTime: lastCommitDate ? "2 days ago" : null,
    lastCommitDate,
    lastScannedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    healthScore: null,
    riskLevel: "unmonitored",
    copyCount: 0,
    dependsOn: [],
  };
}

describe("computeChangedSlugs", () => {
  it("returns empty Set when lastVisitAt is null (first visit)", () => {
    const projects = [
      makeProject("alpha", "2026-03-20T10:00:00Z"),
      makeProject("beta", "2026-03-19T10:00:00Z"),
    ];
    const result = computeChangedSlugs(projects, null);
    expect(result.size).toBe(0);
  });

  it("returns slugs where lastCommitDate > lastVisitAt", () => {
    const projects = [
      makeProject("alpha", "2026-03-20T12:00:00Z"), // after visit
      makeProject("beta", "2026-03-20T14:00:00Z"),  // after visit
      makeProject("gamma", "2026-03-19T08:00:00Z"), // before visit
    ];
    const result = computeChangedSlugs(projects, "2026-03-20T10:00:00Z");
    expect(result).toEqual(new Set(["alpha", "beta"]));
  });

  it("excludes projects with lastCommitDate before lastVisitAt", () => {
    const projects = [
      makeProject("old-project", "2026-03-15T10:00:00Z"),
      makeProject("ancient", "2026-01-01T00:00:00Z"),
    ];
    const result = computeChangedSlugs(projects, "2026-03-20T10:00:00Z");
    expect(result.size).toBe(0);
  });

  it("excludes projects with null lastCommitDate", () => {
    const projects = [
      makeProject("no-commits", null),
      makeProject("also-none", null),
      makeProject("has-commit", "2026-03-21T10:00:00Z"),
    ];
    const result = computeChangedSlugs(projects, "2026-03-20T10:00:00Z");
    expect(result).toEqual(new Set(["has-commit"]));
  });
});

describe("sortWithChangedFirst", () => {
  it("puts changed projects before unchanged, preserves recency within each group", () => {
    const projects = [
      makeProject("unchanged-recent", "2026-03-21T12:00:00Z"),
      makeProject("changed-old", "2026-03-20T14:00:00Z"),
      makeProject("changed-recent", "2026-03-21T10:00:00Z"),
      makeProject("unchanged-old", "2026-03-19T10:00:00Z"),
    ];
    const changedSlugs = new Set(["changed-old", "changed-recent"]);
    const result = sortWithChangedFirst(projects, changedSlugs);

    // Changed first (most recent first within changed)
    expect(result.map((p) => p.slug)).toEqual([
      "changed-recent",
      "changed-old",
      "unchanged-recent",
      "unchanged-old",
    ]);
  });

  it("returns original order when changedSlugs is empty", () => {
    const projects = [
      makeProject("a", "2026-03-21T12:00:00Z"),
      makeProject("b", "2026-03-20T10:00:00Z"),
      makeProject("c", "2026-03-19T10:00:00Z"),
    ];
    const result = sortWithChangedFirst(projects, new Set());
    expect(result).toBe(projects); // Same reference — no copy
  });
});
