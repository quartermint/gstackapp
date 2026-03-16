import { sql } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { sessions } from "../db/schema.js";
import type { BudgetThresholds } from "../lib/config.js";
import type { BurnRate, WeeklyBudget } from "@mission-control/shared";

// ── Tier keyword mapping for routing suggestions ─────────────────

const TIER_KEYWORDS: Record<string, string[]> = {
  opus: ["architecture", "design", "complex", "plan", "security audit"],
  sonnet: ["test", "fix", "refactor", "update", "bug", "lint", "format"],
  local: ["scaffold", "boilerplate", "template", "generate", "stub"],
};

// ── Week Start Calculation ───────────────────────────────────────

/**
 * Walk backward from `now` until `d.getDay() === resetDay`, then set time to 00:00:00.000 UTC.
 * If `now` is already on `resetDay`, returns that day at midnight.
 */
export function getWeekStart(now: Date, resetDay: number): Date {
  const d = new Date(now.getTime());
  // Walk backward until we land on resetDay
  while (d.getUTCDay() !== resetDay) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  // Set to midnight UTC
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ── Weekly Budget Calculation ────────────────────────────────────

/**
 * Compute weekly session counts by tier from the sessions table.
 * Returns a WeeklyBudget shape with burn rate classification and isEstimated: true.
 *
 * NOTE: sessions.startedAt is `integer mode:timestamp` storing epoch SECONDS.
 * We must divide JS milliseconds by 1000 for comparison.
 */
export function getWeeklyBudget(
  db: DrizzleDb,
  thresholds: BudgetThresholds,
  now?: Date
): WeeklyBudget {
  const currentTime = now ?? new Date();
  const weekStart = getWeekStart(currentTime, thresholds.weekResetDay);
  const weekStartEpochSec = Math.floor(weekStart.getTime() / 1000);

  const rows = db
    .select({
      tier: sessions.tier,
      count: sql<number>`count(*)`,
    })
    .from(sessions)
    .where(sql`${sessions.startedAt} >= ${weekStartEpochSec}`)
    .groupBy(sessions.tier)
    .all();

  // Accumulate counts per tier
  const counts = { opus: 0, sonnet: 0, local: 0, unknown: 0 };
  for (const row of rows) {
    const tier = row.tier as keyof typeof counts;
    if (tier in counts) {
      counts[tier] = row.count;
    }
  }

  // Classify burn rate
  let burnRate: BurnRate;
  if (counts.opus >= thresholds.weeklyOpusHot) {
    burnRate = "hot";
  } else if (counts.opus >= thresholds.weeklyOpusModerate) {
    burnRate = "moderate";
  } else {
    burnRate = "low";
  }

  return {
    weekStart: weekStart.toISOString(),
    ...counts,
    burnRate,
    isEstimated: true as const,
  };
}

// ── Tier Routing Suggestion ──────────────────────────────────────

export interface RoutingSuggestion {
  suggestedTier: "opus" | "sonnet" | "local";
  reason: string;
  localAvailable: boolean;
}

/**
 * Suggest a model tier based on task description keywords and current burn rate.
 * Returns null when burnRate is "low" (no suggestion needed).
 * Never auto-restricts -- suggestions are advisory only.
 * Does NOT suggest "local" when localAvailable is false.
 */
export function suggestTier(
  taskDescription: string | null,
  burnRate: BurnRate,
  localAvailable: boolean
): RoutingSuggestion | null {
  // No suggestion when burn rate is low
  if (burnRate === "low") {
    return null;
  }

  const desc = (taskDescription ?? "").toLowerCase();

  // Find matching tier from keywords
  let matchedTier: string | null = null;
  for (const [tier, keywords] of Object.entries(TIER_KEYWORDS)) {
    if (keywords.some((kw) => desc.includes(kw))) {
      matchedTier = tier;
      break;
    }
  }

  // If matched tier is "local" and local is unavailable, skip the match
  if (matchedTier === "local" && !localAvailable) {
    matchedTier = null;
  }

  // If burn rate is hot and matched tier is opus, suggest downgrade
  if (burnRate === "hot" && matchedTier === "opus") {
    const downgrade = localAvailable ? "local" : "sonnet";
    return {
      suggestedTier: downgrade,
      reason: `Burn rate is hot. Consider using ${downgrade} tier to conserve Opus sessions.`,
      localAvailable,
    };
  }

  // If we matched a non-opus tier, suggest it
  if (matchedTier && matchedTier !== "opus") {
    return {
      suggestedTier: matchedTier as "sonnet" | "local",
      reason: `Task matches ${matchedTier} tier keywords. Using ${matchedTier} to conserve budget.`,
      localAvailable,
    };
  }

  // Hot burn rate with no keyword match -- suggest generic downgrade
  if (burnRate === "hot") {
    return {
      suggestedTier: "sonnet",
      reason: "Burn rate is hot. Consider using Sonnet to conserve Opus sessions.",
      localAvailable,
    };
  }

  // Moderate burn rate, matched opus or no match -- no suggestion
  return null;
}
