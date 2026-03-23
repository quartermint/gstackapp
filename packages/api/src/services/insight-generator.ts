/**
 * Insight generator service — 4 pattern detectors that analyze MC data
 * and create insights in the insights table. All rule-based (no LLM).
 *
 * Detectors:
 *   1. Stale captures (>7d without project assignment)
 *   2. Activity gaps (captures exist but no recent commits)
 *   3. Session patterns (peak hour, avg duration)
 *   4. Cross-project shared term overlaps
 *
 * Runs on daemon schedule, never on API request.
 * Content-hash dedup prevents duplicate insights per day.
 */

import { sql } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { captures, commits, sessions, projectKnowledge } from "../db/schema.js";
import { createInsight } from "../db/queries/insights.js";
import { computeContentHash } from "./embedding.js";

// ── Constants (per CONTEXT.md decisions) ─────────────────────

const STALE_CAPTURE_DAYS = 7;          // D-04: 7 days without project assignment
const MIN_CAPTURES_FOR_GAP = 3;         // D-05: minimum captures to detect gap
const MIN_DAYS_NO_COMMIT = 7;           // D-05: days without commit for gap
const MIN_SESSIONS_FOR_PATTERN = 10;    // D-06 / Research Pitfall 6: minimum sessions
const MIN_SHARED_TERMS = 3;             // D-07: minimum overlapping terms
const MAX_CROSS_PROJECT_PAIRS = 5;      // Research Pitfall 4: cap insight count

// Common stop words to filter from cross-project term analysis
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "it", "in", "on", "at", "to", "for",
  "of", "with", "and", "or", "not", "but", "this", "that", "from",
  "was", "were", "are", "been", "be", "have", "has", "had", "do",
  "does", "did", "will", "would", "could", "should", "may", "can",
  "just", "also", "some", "more", "than", "then", "when", "what",
  "which", "who", "how", "where", "why", "very", "much", "such",
  "only", "into", "over", "after", "before", "between", "through",
  "about", "each", "all", "any", "both", "few", "most", "other",
  "same", "them", "they", "their", "there", "here", "these", "those",
  "test", "file", "work", "working", "using", "used", "make",
]);

// ── Helper: today's ISO date string ──────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Helper: format hour as 10am/2pm/12pm/12am style ─────────

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

// ── 1. Stale Capture Insights (PROACT-02, D-04) ────────────

/**
 * Count captures older than 7 days without project assignment
 * and not archived. Create a single insight if any exist.
 * Returns 0 or 1 (number of insights created).
 */
export function generateStaleCaptureInsights(db: DrizzleDb): number {
  const cutoffEpoch = Math.floor(
    (Date.now() - STALE_CAPTURE_DAYS * 24 * 60 * 60 * 1000) / 1000
  );

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(captures)
    .where(
      sql`${captures.createdAt} < ${cutoffEpoch} AND ${captures.projectId} IS NULL AND ${captures.status} != 'archived'`
    )
    .get();

  const count = result?.count ?? 0;
  if (count === 0) return 0;

  const today = todayIso();
  const contentHash = computeContentHash(`stale_capture:${count}:${today}`);

  const insight = createInsight(db, {
    type: "stale_capture",
    title: `${count} captures need triage`,
    body: `You have ${count} capture(s) older than 7 days without a project assignment. Review and assign or archive them.`,
    contentHash,
  });

  return insight ? 1 : 0;
}

// ── 2. Activity Gap Detection (PROACT-03, D-05) ────────────

/**
 * Find projects with captures in last 7 days but no recent commits.
 * Creates one insight per project with an activity gap.
 * Returns the number of insights created.
 */
export function detectActivityGaps(db: DrizzleDb): number {
  const sevenDaysAgoEpoch = Math.floor(
    (Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000
  );

  // Get projects with >= MIN_CAPTURES_FOR_GAP recent captures
  const projectCaptures = db
    .select({
      projectId: captures.projectId,
      cnt: sql<number>`count(*)`,
    })
    .from(captures)
    .where(
      sql`${captures.createdAt} >= ${sevenDaysAgoEpoch} AND ${captures.projectId} IS NOT NULL`
    )
    .groupBy(captures.projectId)
    .all();

  let created = 0;
  const today = todayIso();

  for (const row of projectCaptures) {
    const projectId = row.projectId as string;
    const captureCount = row.cnt;

    if (captureCount < MIN_CAPTURES_FOR_GAP) continue;

    // Check latest commit for this project
    const latestCommit = db
      .select({ authorDate: commits.authorDate })
      .from(commits)
      .where(sql`${commits.projectSlug} = ${projectId}`)
      .orderBy(sql`${commits.authorDate} DESC`)
      .limit(1)
      .get();

    let daysSinceCommit: number;

    if (!latestCommit) {
      // No commits at all — treat as infinite gap
      daysSinceCommit = Infinity;
    } else {
      const commitDate = new Date(latestCommit.authorDate);
      daysSinceCommit = Math.floor(
        (Date.now() - commitDate.getTime()) / (24 * 60 * 60 * 1000)
      );
    }

    if (daysSinceCommit < MIN_DAYS_NO_COMMIT) continue;

    const contentHash = computeContentHash(
      `activity_gap:${projectId}:${captureCount}:${daysSinceCommit === Infinity ? "never" : daysSinceCommit}:${today}`
    );

    const daysLabel = daysSinceCommit === Infinity
      ? "no commits found"
      : `${daysSinceCommit} days since last commit`;

    const insight = createInsight(db, {
      type: "activity_gap",
      title: `${projectId} has ${captureCount} captures but ${daysLabel}`,
      body: `You've captured ${captureCount} thought(s) about ${projectId} in the last 7 days, but there's been no commit activity. Consider starting a session.`,
      projectSlug: projectId,
      contentHash,
    });

    if (insight) created++;
  }

  return created;
}

// ── 3. Session Pattern Detection (PROACT-04, D-06) ─────────

/**
 * Analyze completed sessions to find peak productive hour and
 * average session duration. Requires MIN_SESSIONS_FOR_PATTERN
 * completed sessions.
 * Returns 0 or 1.
 */
export function detectSessionPatterns(db: DrizzleDb): number {
  const completedSessions = db
    .select({
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(
      sql`${sessions.status} = 'completed' AND ${sessions.endedAt} IS NOT NULL`
    )
    .orderBy(sql`${sessions.startedAt} DESC`)
    .limit(50)
    .all();

  if (completedSessions.length < MIN_SESSIONS_FOR_PATTERN) return 0;

  // Build hour distribution
  const hourMap = new Map<number, { count: number; totalDurationMin: number }>();

  for (const session of completedSessions) {
    const startDate = session.startedAt instanceof Date
      ? session.startedAt
      : new Date((session.startedAt as unknown as number) * 1000);
    const endDate = session.endedAt instanceof Date
      ? session.endedAt!
      : new Date((session.endedAt as unknown as number) * 1000);

    const hour = startDate.getHours();
    const durationMin = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 60_000));

    const existing = hourMap.get(hour) ?? { count: 0, totalDurationMin: 0 };
    existing.count++;
    existing.totalDurationMin += durationMin;
    hourMap.set(hour, existing);
  }

  // Find peak hour
  let peakHour = 0;
  let peakCount = 0;

  for (const [hour, data] of hourMap.entries()) {
    if (data.count > peakCount) {
      peakCount = data.count;
      peakHour = hour;
    }
  }

  const peakData = hourMap.get(peakHour)!;
  const avgDuration = Math.round(peakData.totalDurationMin / peakData.count);

  const today = todayIso();
  const contentHash = computeContentHash(
    `session_pattern:${peakHour}:${avgDuration}:${today}`
  );

  const hourStr = formatHour(peakHour);

  const insight = createInsight(db, {
    type: "session_pattern",
    title: `Most productive sessions start after ${hourStr} and last ${avgDuration}min`,
    body: `Based on your last ${completedSessions.length} sessions, ${peakCount} started at ${hourStr} with an average duration of ${avgDuration} minutes.`,
    metadata: JSON.stringify({
      peakHour,
      peakCount,
      avgDuration,
      totalSessions: completedSessions.length,
    }),
    contentHash,
  });

  return insight ? 1 : 0;
}

// ── 4. Cross-Project Pattern Detection (PROACT-05, D-07) ───

/**
 * Extract significant terms from text: lowercase, split, filter
 * stop words and short words, return frequency map.
 */
function buildTermFrequency(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  const words = text.toLowerCase().split(/[\s,.;:!?()[\]{}"'`/\\|@#$%^&*+=<>~_-]+/);

  for (const word of words) {
    if (word.length < 4) continue;
    if (STOP_WORDS.has(word)) continue;
    // Filter pure numbers
    if (/^\d+$/.test(word)) continue;

    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  return freq;
}

/**
 * Detect overlapping terms between projects' captures and knowledge.
 * Creates insight when 2 projects share >= MIN_SHARED_TERMS terms.
 * Returns the number of insights created.
 */
export function detectCrossProjectPatterns(db: DrizzleDb): number {
  const thirtyDaysAgoEpoch = Math.floor(
    (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
  );

  // Get recent captures grouped by project
  const recentCaptures = db
    .select({
      projectId: captures.projectId,
      rawContent: captures.rawContent,
    })
    .from(captures)
    .where(
      sql`${captures.createdAt} >= ${thirtyDaysAgoEpoch} AND ${captures.projectId} IS NOT NULL`
    )
    .all();

  // Build per-project content: captures + knowledge
  const projectContent = new Map<string, string>();

  for (const cap of recentCaptures) {
    const slug = cap.projectId as string;
    const existing = projectContent.get(slug) ?? "";
    projectContent.set(slug, existing + " " + cap.rawContent);
  }

  // Add knowledge content
  const allKnowledge = db
    .select({
      projectSlug: projectKnowledge.projectSlug,
      content: projectKnowledge.content,
    })
    .from(projectKnowledge)
    .all();

  for (const k of allKnowledge) {
    if (!projectContent.has(k.projectSlug)) {
      // Only include projects that have recent captures
      continue;
    }
    const existing = projectContent.get(k.projectSlug) ?? "";
    projectContent.set(k.projectSlug, existing + " " + k.content);
  }

  // Build term frequency per project
  const projectTerms = new Map<string, Map<string, number>>();
  for (const [slug, content] of projectContent.entries()) {
    projectTerms.set(slug, buildTermFrequency(content));
  }

  const slugs = [...projectTerms.keys()].sort();
  let created = 0;
  const today = todayIso();

  // Check each pair
  for (let i = 0; i < slugs.length && created < MAX_CROSS_PROJECT_PAIRS; i++) {
    for (let j = i + 1; j < slugs.length && created < MAX_CROSS_PROJECT_PAIRS; j++) {
      const slugA = slugs[i]!;
      const slugB = slugs[j]!;
      const termsA = projectTerms.get(slugA)!;
      const termsB = projectTerms.get(slugB)!;

      // Find shared terms where both have >= 2 occurrences
      const sharedTerms: string[] = [];
      for (const [term, countA] of termsA.entries()) {
        if (countA >= 2) {
          const countB = termsB.get(term) ?? 0;
          if (countB >= 2) {
            sharedTerms.push(term);
          }
        }
      }

      if (sharedTerms.length < MIN_SHARED_TERMS) continue;

      sharedTerms.sort();
      const top3 = sharedTerms.slice(0, 3).join(", ");

      const contentHash = computeContentHash(
        `cross_project:${slugA}:${slugB}:${sharedTerms.join(",")}:${today}`
      );

      const evidence = sharedTerms.slice(0, 5).map((term) => {
        return `both reference "${term}"`;
      });

      const insight = createInsight(db, {
        type: "cross_project",
        title: `${slugA} and ${slugB} share patterns: ${top3}`,
        body: `These projects share ${sharedTerms.length} common terms in recent captures and knowledge: ${evidence.join("; ")}.`,
        metadata: JSON.stringify({
          projects: [slugA, slugB],
          sharedTerms,
          evidence,
        }),
        contentHash,
      });

      if (insight) created++;
    }
  }

  return created;
}

// ── Orchestrator ────────────────────────────────────────────

/**
 * Run all 4 insight detectors sequentially.
 * Called by the intelligence daemon on a schedule.
 * Returns total number of insights created.
 */
export function generateAllInsights(db: DrizzleDb): number {
  let total = 0;

  total += generateStaleCaptureInsights(db);
  total += detectActivityGaps(db);
  total += detectSessionPatterns(db);
  total += detectCrossProjectPatterns(db);

  if (total > 0) {
    console.log(`[insight-generator] Created ${total} new insight(s)`);
  }

  return total;
}
