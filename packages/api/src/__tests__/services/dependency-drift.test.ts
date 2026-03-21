import { describe, it, expect } from "vitest";
import {
  type DependencyPair,
  checkDependencyDrift,
  escalateDependencyDriftSeverity,
} from "../../services/git-health.js";

// ── checkDependencyDrift ──────────────────────────────────────────

describe("checkDependencyDrift", () => {
  it("returns empty array when pairs list is empty", () => {
    const heads = new Map<string, string | null>();
    const prev = new Map<string, string | null>();
    expect(checkDependencyDrift([], heads, prev)).toEqual([]);
  });

  it("returns empty array when dependency has no head commit", () => {
    const pairs: DependencyPair[] = [
      { dependentSlug: "app", dependencySlug: "lib" },
    ];
    const heads = new Map<string, string | null>([
      ["app", "aaa1111"],
      ["lib", null],
    ]);
    const prev = new Map<string, string | null>([
      ["lib", "bbb2222"],
    ]);
    expect(checkDependencyDrift(pairs, heads, prev)).toEqual([]);
  });

  it("returns empty array when dependent has no head commit", () => {
    const pairs: DependencyPair[] = [
      { dependentSlug: "app", dependencySlug: "lib" },
    ];
    const heads = new Map<string, string | null>([
      ["app", null],
      ["lib", "bbb2222"],
    ]);
    const prev = new Map<string, string | null>([
      ["lib", "bbb1111"],
    ]);
    expect(checkDependencyDrift(pairs, heads, prev)).toEqual([]);
  });

  it("returns empty array when dependency head unchanged from previous (no drift)", () => {
    const pairs: DependencyPair[] = [
      { dependentSlug: "app", dependencySlug: "lib" },
    ];
    const heads = new Map<string, string | null>([
      ["app", "aaa1111"],
      ["lib", "bbb2222"],
    ]);
    const prev = new Map<string, string | null>([
      ["lib", "bbb2222"],
    ]);
    expect(checkDependencyDrift(pairs, heads, prev)).toEqual([]);
  });

  it("returns finding when dependency head changed and differs from previous", () => {
    const pairs: DependencyPair[] = [
      { dependentSlug: "app", dependencySlug: "lib" },
    ];
    const heads = new Map<string, string | null>([
      ["app", "aaa1111"],
      ["lib", "ccc3333"],
    ]);
    const prev = new Map<string, string | null>([
      ["lib", "bbb2222"],
    ]);
    const result = checkDependencyDrift(pairs, heads, prev);
    expect(result).toHaveLength(1);
    expect(result[0]!.checkType).toBe("dependency_impact");
    expect(result[0]!.severity).toBe("info");
    expect(result[0]!.projectSlug).toBe("app");
  });

  it("finding metadata contains dependencySlug, dependencyHead, dependentHead, type", () => {
    const pairs: DependencyPair[] = [
      { dependentSlug: "app", dependencySlug: "lib" },
    ];
    const heads = new Map<string, string | null>([
      ["app", "aaa1111"],
      ["lib", "ccc3333"],
    ]);
    const prev = new Map<string, string | null>([
      ["lib", "bbb2222"],
    ]);
    const result = checkDependencyDrift(pairs, heads, prev);
    expect(result[0]!.metadata).toEqual({
      dependencySlug: "lib",
      dependencyHead: "ccc3333",
      dependentHead: "aaa1111",
      type: "dependency_drift",
    });
  });

  it("finding detail contains dependency slug and truncated head", () => {
    const pairs: DependencyPair[] = [
      { dependentSlug: "app", dependencySlug: "lib" },
    ];
    const heads = new Map<string, string | null>([
      ["app", "aaa1111"],
      ["lib", "ccc3333abcdef"],
    ]);
    const prev = new Map<string, string | null>([
      ["lib", "bbb2222"],
    ]);
    const result = checkDependencyDrift(pairs, heads, prev);
    expect(result[0]!.detail).toContain("lib");
    expect(result[0]!.detail).toContain("ccc3333");
  });

  it("returns empty array when previous head is null (first scan baseline)", () => {
    const pairs: DependencyPair[] = [
      { dependentSlug: "app", dependencySlug: "lib" },
    ];
    const heads = new Map<string, string | null>([
      ["app", "aaa1111"],
      ["lib", "ccc3333"],
    ]);
    const prev = new Map<string, string | null>();
    expect(checkDependencyDrift(pairs, heads, prev)).toEqual([]);
  });

  it("returns empty array when previous head exists as null value (first scan baseline)", () => {
    const pairs: DependencyPair[] = [
      { dependentSlug: "app", dependencySlug: "lib" },
    ];
    const heads = new Map<string, string | null>([
      ["app", "aaa1111"],
      ["lib", "ccc3333"],
    ]);
    const prev = new Map<string, string | null>([
      ["lib", null],
    ]);
    expect(checkDependencyDrift(pairs, heads, prev)).toEqual([]);
  });

  it("handles multiple pairs independently", () => {
    const pairs: DependencyPair[] = [
      { dependentSlug: "app", dependencySlug: "lib-a" },
      { dependentSlug: "app", dependencySlug: "lib-b" },
      { dependentSlug: "service", dependencySlug: "lib-a" },
    ];
    const heads = new Map<string, string | null>([
      ["app", "aaa1111"],
      ["service", "sss1111"],
      ["lib-a", "new-a-hash"],
      ["lib-b", "same-b-hash"],
    ]);
    const prev = new Map<string, string | null>([
      ["lib-a", "old-a-hash"],
      ["lib-b", "same-b-hash"],
    ]);
    const result = checkDependencyDrift(pairs, heads, prev);
    // lib-a changed -> 2 findings (app depends on it, service depends on it)
    // lib-b unchanged -> 0 findings
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.projectSlug).sort()).toEqual(["app", "service"]);
  });
});

// ── escalateDependencyDriftSeverity ───────────────────────────────

describe("escalateDependencyDriftSeverity", () => {
  it("returns info for age < 24 hours", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(
      now.getTime() - 12 * 60 * 60 * 1000
    ).toISOString();
    expect(escalateDependencyDriftSeverity(detectedAt, now)).toBe("info");
  });

  it("returns info for age of exactly 23 hours", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(
      now.getTime() - 23 * 60 * 60 * 1000
    ).toISOString();
    expect(escalateDependencyDriftSeverity(detectedAt, now)).toBe("info");
  });

  it("returns warning for age >= 24 hours but < 168 hours", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    ).toISOString();
    expect(escalateDependencyDriftSeverity(detectedAt, now)).toBe("warning");
  });

  it("returns warning for age of 100 hours", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(
      now.getTime() - 100 * 60 * 60 * 1000
    ).toISOString();
    expect(escalateDependencyDriftSeverity(detectedAt, now)).toBe("warning");
  });

  it("returns critical for age >= 168 hours (7 days)", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(
      now.getTime() - 168 * 60 * 60 * 1000
    ).toISOString();
    expect(escalateDependencyDriftSeverity(detectedAt, now)).toBe("critical");
  });

  it("returns critical for age of 30 days", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(escalateDependencyDriftSeverity(detectedAt, now)).toBe("critical");
  });

  it("returns info for invalid date string", () => {
    expect(escalateDependencyDriftSeverity("invalid")).toBe("info");
  });

  it("accepts optional now parameter for deterministic testing", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const detectedAt = new Date(
      now.getTime() - 48 * 60 * 60 * 1000
    ).toISOString();
    // Without explicit now, uses system clock — but with explicit, uses provided
    expect(escalateDependencyDriftSeverity(detectedAt, now)).toBe("warning");
  });
});
