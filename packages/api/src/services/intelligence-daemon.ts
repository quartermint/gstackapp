/**
 * Intelligence daemon orchestrator — ties together narrative generation,
 * daily digest scheduling, and cache cleanup.
 *
 * Starts on server boot with 5s delay (inside existing setTimeout block).
 * Generates narratives for the 5 most recently active projects on first boot.
 * Schedules:
 *   - Daily digest via cron (default 6am)
 *   - Narrative refresh on interval (default 30min)
 *   - Cache cleanup on interval (default 1h)
 *   - Insight generation on interval (default 30min)
 *
 * Returns a stop() function for graceful shutdown.
 */

import { sql } from "drizzle-orm";
import { scheduleDigestGeneration } from "./digest-generator.js";
import { generateDailyDigest, getDigest } from "./digest-generator.js";
import { generateProjectNarrative } from "./narrative-generator.js";
import { getFromCache, purgeExpiredCache, writeToCache } from "./intelligence-cache.js";
import { getLmStudioStatus } from "./lm-studio.js";
import { computeContentHash } from "./embedding.js";
import { generateAllInsights } from "./insight-generator.js";
import { eventBus } from "./event-bus.js";
import { projects } from "../db/schema.js";
import type { DrizzleDb } from "../db/index.js";
import type { ProjectNarrative } from "./narrative-generator.js";

// ── Config ──────────────────────────────────────────────────

export interface IntelligenceDaemonConfig {
  /** Cron expression for daily digest. Default: '0 6 * * *' */
  digestCron?: string;
  /** Narrative refresh interval in ms. Default: 30 * 60_000 (30 min) */
  narrativeRefreshIntervalMs?: number;
  /** Cache cleanup interval in ms. Default: 60 * 60_000 (1 hour) */
  cacheCleanupIntervalMs?: number;
  /** Number of most-active projects for initial generation. Default: 5 */
  initialNarrativeCount?: number;
  /** Insight generation interval in ms. Default: 30 * 60_000 (30 min) */
  insightGenerationIntervalMs?: number;
}

const DEFAULTS: Required<IntelligenceDaemonConfig> = {
  digestCron: "0 6 * * *",
  narrativeRefreshIntervalMs: 30 * 60_000,
  cacheCleanupIntervalMs: 60 * 60_000,
  initialNarrativeCount: 5,
  insightGenerationIntervalMs: 30 * 60_000,
};

// ── Daemon Orchestrator ─────────────────────────────────────

/**
 * Start the intelligence daemon. Orchestrates:
 *   1. Daily digest scheduling via node-cron
 *   2. Narrative refresh on interval
 *   3. Cache cleanup on interval
 *   4. Initial narrative + insight generation for active projects (5s delay)
 *   5. Insight generation on interval
 *
 * Returns { stop } for graceful shutdown.
 */
export function startIntelligenceDaemon(
  db: DrizzleDb,
  config?: IntelligenceDaemonConfig
): { stop: () => void } {
  const cfg = { ...DEFAULTS, ...config };

  // 1. Schedule daily digest via cron
  const digestJob = scheduleDigestGeneration(db, cfg.digestCron);

  // 2. Narrative refresh interval: check top N projects and regenerate stale narratives
  const narrativeTimer = setInterval(() => {
    void refreshStaleNarratives(db, cfg.initialNarrativeCount);
  }, cfg.narrativeRefreshIntervalMs);

  // 3. Cache cleanup interval
  const cleanupTimer = setInterval(() => {
    purgeExpiredCache(db);
  }, cfg.cacheCleanupIntervalMs);

  // 4. Initial generation pass (5s delay per RESEARCH.md Pitfall 6)
  const initTimer = setTimeout(() => {
    void runInitialGeneration(db, cfg.initialNarrativeCount);
  }, 5_000);

  // 5. Insight generation interval
  const insightTimer = setInterval(() => {
    void generateAllInsights(db);
  }, cfg.insightGenerationIntervalMs);

  return {
    stop: () => {
      digestJob.stop();
      clearInterval(narrativeTimer);
      clearInterval(cleanupTimer);
      clearTimeout(initTimer);
      clearInterval(insightTimer);
    },
  };
}

// ── Internal Helpers ────────────────────────────────────────

/**
 * Query top N projects by recent activity (lastScannedAt DESC)
 * and regenerate stale narratives.
 */
async function refreshStaleNarratives(
  db: DrizzleDb,
  count: number
): Promise<void> {
  const status = getLmStudioStatus();
  if (status.health !== "ready") return;

  const activeProjects = db
    .select({ slug: projects.slug })
    .from(projects)
    .orderBy(sql`${projects.lastScannedAt} DESC NULLS LAST`)
    .limit(count)
    .all();

  // Sequential to avoid LM Studio overload
  for (const { slug } of activeProjects) {
    const cached = getFromCache<ProjectNarrative>(db, slug, "narrative");
    if (!cached) {
      await generateAndCacheNarrative(db, slug);
    }
  }
}

/**
 * Run initial narrative generation for the most active projects.
 * Sequential, not parallel, to avoid LM Studio overload.
 */
async function runInitialGeneration(
  db: DrizzleDb,
  count: number
): Promise<void> {
  const status = getLmStudioStatus();
  if (status.health !== "ready") return;

  const activeProjects = db
    .select({ slug: projects.slug })
    .from(projects)
    .orderBy(sql`${projects.lastScannedAt} DESC NULLS LAST`)
    .limit(count)
    .all();

  for (const { slug } of activeProjects) {
    await generateAndCacheNarrative(db, slug);
  }

  // Generate initial insights (rule-based, no LM Studio dependency)
  void generateAllInsights(db);

  // Generate initial digest if cache is empty
  const existingDigest = getDigest(db);
  if (!existingDigest) {
    const digest = await generateDailyDigest(db);
    if (digest) {
      const inputHash = new Date().toISOString().slice(0, 10);
      writeToCache(db, null, "digest", digest, inputHash);
    }
  }
}

/**
 * Generate a narrative for a project and write to cache.
 */
async function generateAndCacheNarrative(
  db: DrizzleDb,
  slug: string
): Promise<void> {
  try {
    const result = await generateProjectNarrative(db, slug);
    if (result) {
      const inputHash = computeContentHash(JSON.stringify({ slug, t: Date.now() }));
      const status = getLmStudioStatus();
      writeToCache(db, slug, "narrative", result, inputHash, status.modelId ?? undefined);
      eventBus.emit("mc:event", {
        type: "intelligence:narrative_generated",
        id: slug,
      });
    }
  } catch {
    // Generation failure is non-fatal
  }
}
