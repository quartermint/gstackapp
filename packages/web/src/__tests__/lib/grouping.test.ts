import { describe, it, expect } from "vitest";
import {
  groupProjectsByActivity,
  type ProjectItem,
} from "../../lib/grouping.js";

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

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("groupProjectsByActivity", () => {
  it("places project with commit 2 days ago in active group", () => {
    const projects = [makeProject("recent", daysAgo(2))];
    const groups = groupProjectsByActivity(projects);
    expect(groups.active).toHaveLength(1);
    expect(groups.active[0]!.slug).toBe("recent");
    expect(groups.idle).toHaveLength(0);
    expect(groups.stale).toHaveLength(0);
  });

  it("places project with commit 15 days ago in idle group", () => {
    const projects = [makeProject("idle-project", daysAgo(15))];
    const groups = groupProjectsByActivity(projects);
    expect(groups.active).toHaveLength(0);
    expect(groups.idle).toHaveLength(1);
    expect(groups.idle[0]!.slug).toBe("idle-project");
    expect(groups.stale).toHaveLength(0);
  });

  it("places project with commit 45 days ago in stale group", () => {
    const projects = [makeProject("old-project", daysAgo(45))];
    const groups = groupProjectsByActivity(projects);
    expect(groups.active).toHaveLength(0);
    expect(groups.idle).toHaveLength(0);
    expect(groups.stale).toHaveLength(1);
    expect(groups.stale[0]!.slug).toBe("old-project");
  });

  it("places project with null lastCommitDate in stale group", () => {
    const projects = [makeProject("no-commits", null)];
    const groups = groupProjectsByActivity(projects);
    expect(groups.stale).toHaveLength(1);
    expect(groups.stale[0]!.slug).toBe("no-commits");
  });

  it("sorts projects by most recent commit within each group", () => {
    const projects = [
      makeProject("older-active", daysAgo(6)),
      makeProject("newer-active", daysAgo(1)),
      makeProject("oldest-active", daysAgo(5)),
    ];
    const groups = groupProjectsByActivity(projects);
    expect(groups.active).toHaveLength(3);
    expect(groups.active[0]!.slug).toBe("newer-active");
    expect(groups.active[1]!.slug).toBe("oldest-active");
    expect(groups.active[2]!.slug).toBe("older-active");
  });

  it("returns empty groups for empty array", () => {
    const groups = groupProjectsByActivity([]);
    expect(groups.active).toEqual([]);
    expect(groups.idle).toEqual([]);
    expect(groups.stale).toEqual([]);
  });

  it("correctly classifies projects at threshold boundaries", () => {
    const projects = [
      makeProject("within-active", daysAgo(6)),
      makeProject("within-idle", daysAgo(29)),
    ];
    const groups = groupProjectsByActivity(projects);
    // 6 days ago = safely active
    expect(groups.active).toHaveLength(1);
    expect(groups.active[0]!.slug).toBe("within-active");
    // 29 days ago = safely idle
    expect(groups.idle).toHaveLength(1);
    expect(groups.idle[0]!.slug).toBe("within-idle");
  });
});
