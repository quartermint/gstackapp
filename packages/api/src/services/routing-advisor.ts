/**
 * Routing advisor service — historical tier-vs-outcome analysis with
 * AI-enhanced or rule-based routing suggestions.
 *
 * Per D-08/D-09: Suggestions are informational only, never restrict model choice.
 * Uses intelligence cache with 30min TTL.
 */

import { z } from "zod";
import { sql } from "drizzle-orm";
import { generateText, Output } from "ai";
import { getLmStudioStatus, createLmStudioProvider } from "./lm-studio.js";
import {
  getFromCache,
  writeToCache,
  acquireGenerationLock,
  releaseGenerationLock,
} from "./intelligence-cache.js";
import { sessions, commits } from "../db/schema.js";
import type { DrizzleDb } from "../db/index.js";
import type { BurnRate } from "@mission-control/shared";

const DEFAULT_LM_STUDIO_URL = "http://100.x.x.x:1234";

// ── Zod Schema (D-03 constrained generation) ────────────────

export const routingSuggestionSchema = z.object({
  suggestedTier: z
    .enum(["opus", "sonnet", "local"])
    .describe("Recommended model tier"),
  reason: z
    .string()
    .describe("1-2 sentence explanation for the suggestion"),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe("How confident the suggestion is"),
  historicalContext: z
    .string()
    .nullable()
    .describe("What historical data informed this suggestion"),
});

export type IntelligentRoutingSuggestion = z.infer<
  typeof routingSuggestionSchema
>;

// ── Tier Stats Types ─────────────────────────────────────────

export interface TierStats {
  count: number;
  avgDurationMinutes: number;
  avgCommitCount: number;
  avgFilesCount: number;
}

export type TierStatsMap = Record<"opus" | "sonnet" | "local", TierStats>;

// ── Tier Stats Computation ───────────────────────────────────

const EMPTY_STATS: TierStats = {
  count: 0,
  avgDurationMinutes: 0,
  avgCommitCount: 0,
  avgFilesCount: 0,
};

/**
 * Query last 20 completed sessions for a project and compute per-tier stats.
 * Duration from startedAt/endedAt, file count from filesJson, commit count from commits table.
 */
export function computeTierStats(
  db: DrizzleDb,
  projectSlug: string
): TierStatsMap {
  // Fetch last 20 completed sessions for this project
  const rows = db
    .select({
      id: sessions.id,
      tier: sessions.tier,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      filesJson: sessions.filesJson,
    })
    .from(sessions)
    .where(
      sql`${sessions.projectSlug} = ${projectSlug} AND ${sessions.status} = 'completed' AND ${sessions.endedAt} IS NOT NULL`
    )
    .orderBy(sql`${sessions.startedAt} DESC`)
    .limit(20)
    .all();

  if (rows.length === 0) {
    return { opus: { ...EMPTY_STATS }, sonnet: { ...EMPTY_STATS }, local: { ...EMPTY_STATS } };
  }

  // Accumulate per-tier
  const accum: Record<
    string,
    { totalDuration: number; totalFiles: number; totalCommits: number; count: number }
  > = {
    opus: { totalDuration: 0, totalFiles: 0, totalCommits: 0, count: 0 },
    sonnet: { totalDuration: 0, totalFiles: 0, totalCommits: 0, count: 0 },
    local: { totalDuration: 0, totalFiles: 0, totalCommits: 0, count: 0 },
  };

  for (const row of rows) {
    const tier = row.tier as "opus" | "sonnet" | "local";
    if (!(tier in accum)) continue;

    const bucket = accum[tier]!;
    bucket.count++;

    // Duration
    if (row.endedAt && row.startedAt) {
      const durationMs = row.endedAt.getTime() - row.startedAt.getTime();
      bucket.totalDuration += durationMs / 60_000;
    }

    // Files
    if (row.filesJson) {
      try {
        const files = JSON.parse(row.filesJson) as string[];
        bucket.totalFiles += files.length;
      } catch {
        // ignore malformed JSON
      }
    }

    // Commits: count in session time range
    if (row.startedAt && row.endedAt) {
      const startIso = row.startedAt.toISOString();
      const endIso = row.endedAt.toISOString();
      const commitResult = db
        .select({ count: sql<number>`count(*)` })
        .from(commits)
        .where(
          sql`${commits.projectSlug} = ${projectSlug}
              AND ${commits.authorDate} >= ${startIso}
              AND ${commits.authorDate} <= ${endIso}`
        )
        .get();
      bucket.totalCommits += commitResult?.count ?? 0;
    }
  }

  const toStats = (key: string): TierStats => {
    const b = accum[key]!;
    if (b.count === 0) return { ...EMPTY_STATS };
    return {
      count: b.count,
      avgDurationMinutes: Math.round((b.totalDuration / b.count) * 10) / 10,
      avgCommitCount: Math.round((b.totalCommits / b.count) * 10) / 10,
      avgFilesCount: Math.round((b.totalFiles / b.count) * 10) / 10,
    };
  };

  return {
    opus: toStats("opus"),
    sonnet: toStats("sonnet"),
    local: toStats("local"),
  };
}

// ── Rule-Based Suggestion (Fallback) ─────────────────────────

/**
 * Generate a rule-based routing suggestion from tier stats.
 * Used when LM Studio is unavailable.
 */
export function buildRuleBasedSuggestion(
  tierStats: TierStatsMap,
  burnRate: BurnRate,
  localAvailable: boolean
): IntelligentRoutingSuggestion | null {
  const opus = tierStats.opus;
  const sonnet = tierStats.sonnet;

  // Rule A: Opus sessions are lightweight -> suggest sonnet
  if (
    opus.count >= 3 &&
    opus.avgDurationMinutes < 10 &&
    opus.avgFilesCount < 3
  ) {
    return {
      suggestedTier: "sonnet",
      reason:
        "Recent opus sessions were lightweight. Consider sonnet for simple tasks.",
      confidence: "low",
      historicalContext: `${opus.count} opus sessions averaged ${opus.avgDurationMinutes}min, ${opus.avgFilesCount} files.`,
    };
  }

  // Rule B: Sonnet sessions are complex -> suggest opus
  if (
    sonnet.count >= 3 &&
    sonnet.avgDurationMinutes > 30 &&
    sonnet.avgFilesCount > 10
  ) {
    return {
      suggestedTier: "opus",
      reason:
        "Recent sonnet sessions were complex. Consider opus for better results.",
      confidence: "low",
      historicalContext: `${sonnet.count} sonnet sessions averaged ${sonnet.avgDurationMinutes}min, ${sonnet.avgFilesCount} files.`,
    };
  }

  // Rule C: Local available and tasks are simple
  if (localAvailable) {
    // Compute average across all tiers that have data
    const allTiers = [opus, sonnet, tierStats.local].filter(
      (t) => t.count > 0
    );
    if (allTiers.length > 0) {
      const avgFiles =
        allTiers.reduce((sum, t) => sum + t.avgFilesCount, 0) /
        allTiers.length;
      if (avgFiles < 5) {
        return {
          suggestedTier: "local",
          reason: "LM Studio available for simple tasks.",
          confidence: "low",
          historicalContext: `Average file count across tiers: ${Math.round(avgFiles * 10) / 10}.`,
        };
      }
    }
  }

  // Rule D: Hot burn rate -> suggest downgrade
  if (burnRate === "hot" && opus.count > 0) {
    return {
      suggestedTier: localAvailable ? "local" : "sonnet",
      reason: `Burn rate is hot. Consider using ${localAvailable ? "local" : "sonnet"} to conserve Opus sessions.`,
      confidence: "low",
      historicalContext: `Burn rate: ${burnRate}.`,
    };
  }

  // No strong signal
  return null;
}

// ── AI-Enhanced Suggestion ───────────────────────────────────

/**
 * Generate an AI-enhanced routing suggestion via LM Studio.
 * Falls back to rule-based on error.
 */
async function generateAIRoutingSuggestion(
  tierStats: TierStatsMap,
  burnRate: BurnRate,
  localAvailable: boolean,
  lmStudioUrl: string = DEFAULT_LM_STUDIO_URL
): Promise<IntelligentRoutingSuggestion | null> {
  const status = getLmStudioStatus();
  if (status.health !== "ready") {
    return buildRuleBasedSuggestion(tierStats, burnRate, localAvailable);
  }

  try {
    const provider = createLmStudioProvider(lmStudioUrl);

    const statsText = (["opus", "sonnet", "local"] as const)
      .map(
        (t) =>
          `${t}: ${tierStats[t].count} sessions, avg ${tierStats[t].avgDurationMinutes}min, ${tierStats[t].avgFilesCount} files, ${tierStats[t].avgCommitCount} commits`
      )
      .join("\n");

    const { output } = await generateText({
      model: provider("qwen3-coder"),
      output: Output.object({ schema: routingSuggestionSchema }),
      system:
        "You are a model routing advisor for Mission Control. Based on historical session statistics, suggest the optimal model tier. Your suggestion is advisory only — never restrict model choice.",
      prompt: `Analyze these session statistics and suggest a model tier:

${statsText}

Current burn rate: ${burnRate}
LM Studio available: ${localAvailable}

Suggest the best tier for the next session.`,
    });

    if (!output) {
      return buildRuleBasedSuggestion(tierStats, burnRate, localAvailable);
    }

    return output;
  } catch {
    return buildRuleBasedSuggestion(tierStats, burnRate, localAvailable);
  }
}

// ── Cache-First Orchestrator ─────────────────────────────────

/**
 * Get a routing suggestion for a project.
 * Cache-first with 30min TTL. Per D-09, advisory only.
 */
export function getRoutingSuggestion(
  db: DrizzleDb,
  projectSlug: string
): IntelligentRoutingSuggestion | null {
  // 1. Check cache
  const cached = getFromCache<IntelligentRoutingSuggestion>(
    db,
    projectSlug,
    "routing_suggestion"
  );
  if (cached) return cached;

  // 2. Compute tier stats
  const tierStats = computeTierStats(db, projectSlug);

  // 3. Build rule-based suggestion (sync — AI path is async, handled separately)
  const suggestion = buildRuleBasedSuggestion(tierStats, "moderate", getLmStudioStatus().health === "ready");

  if (suggestion) {
    // 4. Write to cache
    const inputHash = JSON.stringify(tierStats);
    writeToCache(db, projectSlug, "routing_suggestion", suggestion, inputHash);
  }

  // 5. Trigger async AI enrichment if LM Studio is available (fire-and-forget)
  if (getLmStudioStatus().health === "ready" && acquireGenerationLock(projectSlug, "routing_suggestion")) {
    void generateAIRoutingSuggestion(
      tierStats,
      "moderate",
      true
    ).then((aiSuggestion) => {
      if (aiSuggestion) {
        const inputHash = JSON.stringify(tierStats);
        writeToCache(db, projectSlug, "routing_suggestion", aiSuggestion, inputHash);
      }
      releaseGenerationLock(projectSlug, "routing_suggestion");
    }).catch(() => {
      releaseGenerationLock(projectSlug, "routing_suggestion");
    });
  }

  return suggestion;
}
