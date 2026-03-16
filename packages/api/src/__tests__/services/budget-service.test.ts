import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import { createSession } from "../../db/queries/sessions.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { BudgetThresholds } from "../../lib/config.js";

let getWeekStart: typeof import("../../services/budget-service.js").getWeekStart;
let getWeeklyBudget: typeof import("../../services/budget-service.js").getWeeklyBudget;
let suggestTier: typeof import("../../services/budget-service.js").suggestTier;

// Load module at top level
beforeAll(async () => {
  const mod = await import("../../services/budget-service.js");
  getWeekStart = mod.getWeekStart;
  getWeeklyBudget = mod.getWeeklyBudget;
  suggestTier = mod.suggestTier;
});

// ── getWeekStart ──────────────────────────────────────────────────

describe("getWeekStart", () => {
  it("returns previous Friday midnight from a Wednesday", () => {
    // Wed Mar 12, 2026
    const wed = new Date("2026-03-12T14:00:00Z");
    const result = getWeekStart(wed, 5); // 5 = Friday
    expect(result.getUTCDay()).toBe(5);
    expect(result.getTime()).toBeLessThan(wed.getTime());
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });

  it("returns that Friday midnight when today is Friday", () => {
    // Fri Mar 13, 2026
    const fri = new Date("2026-03-13T14:00:00Z");
    const result = getWeekStart(fri, 5);
    expect(result.getUTCDay()).toBe(5);
    expect(result.getUTCDate()).toBe(13);
    expect(result.getUTCHours()).toBe(0);
  });
});

// ── getWeeklyBudget ───────────────────────────────────────────────

describe("getWeeklyBudget", () => {
  let instance: DatabaseInstance;
  const thresholds: BudgetThresholds = {
    weeklyOpusHot: 20,
    weeklyOpusModerate: 10,
    weekResetDay: 5, // Friday
  };

  beforeAll(() => {
    instance = createTestDb();
    // Create sessions with known tiers within the current week
    const inWeek = new Date("2026-03-14T10:00:00Z");
    const epochSec = Math.floor(inWeek.getTime() / 1000);

    // Insert sessions directly via SQL for exact control
    for (let i = 0; i < 5; i++) {
      createSession(instance.db, {
        sessionId: `budget-opus-${i}`,
        source: "claude-code",
        model: "claude-opus-4-20250514",
        cwd: "/tmp/test",
      });
      // Manually set startedAt to be within the week
      instance.sqlite
        .prepare(`UPDATE sessions SET started_at = ? WHERE id = ?`)
        .run(epochSec, `budget-opus-${i}`);
    }
    for (let i = 0; i < 3; i++) {
      createSession(instance.db, {
        sessionId: `budget-sonnet-${i}`,
        source: "claude-code",
        model: "claude-sonnet-4-20250514",
        cwd: "/tmp/test",
      });
      instance.sqlite
        .prepare(`UPDATE sessions SET started_at = ? WHERE id = ?`)
        .run(epochSec, `budget-sonnet-${i}`);
    }
    for (let i = 0; i < 2; i++) {
      createSession(instance.db, {
        sessionId: `budget-local-${i}`,
        source: "aider",
        model: "qwen3-coder-30b",
        cwd: "/tmp/test",
      });
      instance.sqlite
        .prepare(`UPDATE sessions SET started_at = ? WHERE id = ?`)
        .run(epochSec, `budget-local-${i}`);
    }
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("returns counts per tier from sessions since weekStart", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const budget = getWeeklyBudget(instance.db, thresholds, now);
    expect(budget.opus).toBe(5);
    expect(budget.sonnet).toBe(3);
    expect(budget.local).toBe(2);
    expect(budget.unknown).toBe(0);
  });

  it("returns burnRate low when opus < moderate threshold", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const budget = getWeeklyBudget(instance.db, thresholds, now);
    // 5 opus < 10 moderate threshold
    expect(budget.burnRate).toBe("low");
  });

  it("returns burnRate moderate when opus >= moderate and < hot threshold", () => {
    // Add more opus sessions to get to 10+
    for (let i = 5; i < 12; i++) {
      createSession(instance.db, {
        sessionId: `budget-opus-extra-${i}`,
        source: "claude-code",
        model: "claude-opus-4-20250514",
        cwd: "/tmp/test",
      });
      const epochSec = Math.floor(
        new Date("2026-03-14T10:00:00Z").getTime() / 1000
      );
      instance.sqlite
        .prepare(`UPDATE sessions SET started_at = ? WHERE id = ?`)
        .run(epochSec, `budget-opus-extra-${i}`);
    }

    const now = new Date("2026-03-14T12:00:00Z");
    const budget = getWeeklyBudget(instance.db, thresholds, now);
    // 5 + 7 = 12 opus, >= 10 moderate, < 20 hot
    expect(budget.burnRate).toBe("moderate");
  });

  it("returns burnRate hot when opus >= hot threshold", () => {
    // Add enough to reach 20+
    for (let i = 12; i < 20; i++) {
      createSession(instance.db, {
        sessionId: `budget-opus-hot-${i}`,
        source: "claude-code",
        model: "claude-opus-4-20250514",
        cwd: "/tmp/test",
      });
      const epochSec = Math.floor(
        new Date("2026-03-14T10:00:00Z").getTime() / 1000
      );
      instance.sqlite
        .prepare(`UPDATE sessions SET started_at = ? WHERE id = ?`)
        .run(epochSec, `budget-opus-hot-${i}`);
    }

    const now = new Date("2026-03-14T12:00:00Z");
    const budget = getWeeklyBudget(instance.db, thresholds, now);
    // 5 + 7 + 8 = 20 opus, >= 20 hot
    expect(budget.burnRate).toBe("hot");
  });

  it("always returns isEstimated: true", () => {
    const now = new Date("2026-03-14T12:00:00Z");
    const budget = getWeeklyBudget(instance.db, thresholds, now);
    expect(budget.isEstimated).toBe(true);
  });
});

// ── suggestTier ───────────────────────────────────────────────────

describe("suggestTier", () => {
  it("returns null when burnRate is low", () => {
    const result = suggestTier("architecture review", "low", true);
    expect(result).toBeNull();
  });

  it("matches architecture keyword to opus, then suggests downgrade when hot", () => {
    const result = suggestTier("architecture review", "hot", true);
    expect(result).not.toBeNull();
    expect(result!.suggestedTier).not.toBe("opus");
    expect(result!.reason).toBeTruthy();
    expect(result!.localAvailable).toBe(true);
  });

  it("matches test keyword to sonnet", () => {
    const result = suggestTier("write tests for auth", "moderate", true);
    expect(result).not.toBeNull();
    expect(result!.suggestedTier).toBe("sonnet");
  });

  it("matches scaffold keyword to local when localAvailable=true", () => {
    const result = suggestTier("scaffold new service", "moderate", true);
    expect(result).not.toBeNull();
    expect(result!.suggestedTier).toBe("local");
  });

  it("does NOT suggest local when localAvailable=false", () => {
    const result = suggestTier("scaffold new service", "moderate", false);
    // Should either be null or suggest a non-local tier
    if (result !== null) {
      expect(result.suggestedTier).not.toBe("local");
    }
  });

  it("returns generic downgrade suggestion when hot and no keyword match", () => {
    const result = suggestTier("do something random", "hot", true);
    expect(result).not.toBeNull();
    expect(result!.suggestedTier).toBe("sonnet");
    expect(result!.reason).toBeTruthy();
  });
});
