/**
 * Daily digest generator — generates a morning intelligence digest
 * with overnight activity, stale captures, and action items.
 *
 * Per D-06: Generated at 6am via cron schedule, cached with 12h TTL.
 * Per D-07: Cache TTL is 12 hours.
 * Per D-03: Uses JSON schema constrained generation.
 */

import { z } from "zod";
import { sql } from "drizzle-orm";
import { generateText, Output } from "ai";
import cron from "node-cron";
import { getLmStudioStatus, createLmStudioProvider } from "./lm-studio.js";
import { getContextBudget, truncateContext } from "./context-adapter.js";
import {
  getFromCache,
  writeToCache,
  acquireGenerationLock,
  releaseGenerationLock,
} from "./intelligence-cache.js";
import { getActiveFindings } from "../db/queries/health.js";
import { sessions, commits, captures } from "../db/schema.js";
import type { DrizzleDb } from "../db/index.js";

const DEFAULT_LM_STUDIO_URL = "http://100.123.8.125:1234";

// ── Zod Schemas (D-03 constrained generation) ───────────────

const digestSectionSchema = z.object({
  title: z.string().describe("Section heading"),
  items: z.array(z.string()).describe("Bullet points for this section"),
  priority: z
    .enum(["high", "medium", "low"])
    .describe("Section importance"),
});

export const digestSchema = z.object({
  summary: z
    .string()
    .describe("1-2 sentence executive summary of overnight activity"),
  sections: z
    .array(digestSectionSchema)
    .describe(
      "Organized sections: stale captures, dependency drift, activity, sessions"
    ),
  actionItems: z
    .array(z.string())
    .describe("Suggested actions for today, sorted by priority"),
  projectHighlights: z
    .array(
      z.object({
        slug: z.string(),
        activity: z
          .string()
          .describe("One-line summary of project overnight activity"),
      })
    )
    .describe("Per-project activity summaries"),
  generatedAt: z.string().describe("ISO timestamp of generation"),
});

export type DailyDigest = z.infer<typeof digestSchema>;

// ── Data Gathering ───────────────────────────────────────────

interface DigestData {
  commits: Array<{
    projectSlug: string;
    hash: string;
    message: string;
    authorDate: string;
  }>;
  captures: Array<{
    id: string;
    rawContent: string;
    createdAt: Date;
    projectId: string | null;
  }>;
  sessions: Array<{
    id: string;
    tier: string;
    projectSlug: string | null;
    startedAt: Date;
    endedAt: Date | null;
  }>;
  findings: Array<{
    projectSlug: string;
    checkType: string;
    severity: string;
    detail: string;
  }>;
}

/**
 * Query data since the given timestamp for digest generation.
 * Collects commits, captures, sessions, and active health findings.
 */
export function gatherDigestData(db: DrizzleDb, since: Date): DigestData {
  const sinceIso = since.toISOString();
  const sinceEpochSec = Math.floor(since.getTime() / 1000);

  // Commits since `since` (authorDate is ISO string)
  const recentCommits = db
    .select({
      projectSlug: commits.projectSlug,
      hash: commits.hash,
      message: commits.message,
      authorDate: commits.authorDate,
    })
    .from(commits)
    .where(sql`${commits.authorDate} >= ${sinceIso}`)
    .orderBy(sql`${commits.authorDate} DESC`)
    .limit(100)
    .all();

  // Captures since `since` (createdAt is integer timestamp)
  const recentCaptures = db
    .select({
      id: captures.id,
      rawContent: captures.rawContent,
      createdAt: captures.createdAt,
      projectId: captures.projectId,
    })
    .from(captures)
    .where(sql`${captures.createdAt} >= ${sinceEpochSec}`)
    .orderBy(sql`${captures.createdAt} DESC`)
    .limit(50)
    .all();

  // Sessions completed since `since` (startedAt is integer timestamp)
  const recentSessions = db
    .select({
      id: sessions.id,
      tier: sessions.tier,
      projectSlug: sessions.projectSlug,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(
      sql`${sessions.status} = 'completed' AND ${sessions.endedAt} >= ${sinceEpochSec}`
    )
    .orderBy(sql`${sessions.endedAt} DESC`)
    .limit(50)
    .all();

  // Active health findings (unresolved)
  const activeFindings = getActiveFindings(db).map((f) => ({
    projectSlug: f.projectSlug,
    checkType: f.checkType,
    severity: f.severity,
    detail: f.detail,
  }));

  return {
    commits: recentCommits,
    captures: recentCaptures,
    sessions: recentSessions,
    findings: activeFindings,
  };
}

// ── Prompt Builder ───────────────────────────────────────────

function buildDigestPrompt(data: DigestData, tokenBudget: number): string {
  const sections: string[] = [];

  // Commits by project
  if (data.commits.length > 0) {
    const byProject = new Map<string, string[]>();
    for (const c of data.commits) {
      const arr = byProject.get(c.projectSlug) ?? [];
      arr.push(`- ${c.hash.slice(0, 7)} ${c.message}`);
      byProject.set(c.projectSlug, arr);
    }
    const commitLines: string[] = [];
    for (const [slug, msgs] of byProject) {
      commitLines.push(`### ${slug}`);
      commitLines.push(...msgs);
    }
    const commitText = `## Commits (${data.commits.length})\n${commitLines.join("\n")}`;
    sections.push(truncateContext(commitText, Math.floor(tokenBudget * 0.4)));
  }

  // Captures
  if (data.captures.length > 0) {
    const captureLines = data.captures.map(
      (c) =>
        `- [${c.projectId ?? "unassigned"}] ${c.rawContent.slice(0, 100)}`
    );
    const captureText = `## Captures (${data.captures.length})\n${captureLines.join("\n")}`;
    sections.push(truncateContext(captureText, Math.floor(tokenBudget * 0.3)));
  }

  // Sessions
  if (data.sessions.length > 0) {
    const sessionLines = data.sessions.map((s) => {
      const durationMin = s.endedAt
        ? Math.round(
            (s.endedAt.getTime() - s.startedAt.getTime()) / 60_000
          )
        : 0;
      return `- ${s.tier} session on ${s.projectSlug ?? "unknown"} (${durationMin}min)`;
    });
    const sessionText = `## Sessions (${data.sessions.length})\n${sessionLines.join("\n")}`;
    sections.push(
      truncateContext(sessionText, Math.floor(tokenBudget * 0.15))
    );
  }

  // Active findings
  if (data.findings.length > 0) {
    const findingLines = data.findings.map(
      (f) => `- [${f.severity}] ${f.projectSlug}: ${f.detail}`
    );
    const findingText = `## Active Findings (${data.findings.length})\n${findingLines.join("\n")}`;
    sections.push(
      truncateContext(findingText, Math.floor(tokenBudget * 0.15))
    );
  }

  return sections.join("\n\n");
}

// ── Digest Generation ────────────────────────────────────────

/**
 * Generate a daily digest from overnight data via LM Studio.
 * Returns null when LM Studio is unavailable (graceful degradation).
 */
export async function generateDailyDigest(
  db: DrizzleDb,
  lmStudioUrl: string = DEFAULT_LM_STUDIO_URL
): Promise<DailyDigest | null> {
  // Check LM Studio health
  if (getLmStudioStatus().health !== "ready") {
    return null;
  }

  try {
    // Gather overnight data (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const data = gatherDigestData(db, since);

    // Get context budget from LM Studio model
    const status = getLmStudioStatus();
    const tokenBudget = getContextBudget(status.modelId);

    // Build prompt
    const contextText = buildDigestPrompt(data, tokenBudget);

    const provider = createLmStudioProvider(lmStudioUrl);

    const { output } = await generateText({
      model: provider("qwen3-coder"),
      output: Output.object({ schema: digestSchema }),
      system:
        "You are generating a daily intelligence digest for Mission Control. Prioritize actionable items: stale captures first, then dependency drift, then activity summary. Be concise.",
      prompt: `Generate a daily digest from this overnight data:\n\n${contextText}\n\nCurrent time: ${new Date().toISOString()}`,
    });

    if (!output) return null;

    return output;
  } catch {
    return null;
  }
}

// ── Cache-First Accessor ─────────────────────────────────────

/**
 * Get the cached daily digest.
 * Returns cached digest or null if expired/missing.
 */
export function getDigest(db: DrizzleDb): DailyDigest | null {
  return getFromCache<DailyDigest>(db, null, "digest");
}

// ── Cron Scheduling ──────────────────────────────────────────

/**
 * Schedule daily digest generation with node-cron.
 * Default: 6am daily per D-06.
 * On trigger: generates digest, writes to cache with 12h TTL (per D-07).
 * Returns a cleanup object with stop() method.
 */
export function scheduleDigestGeneration(
  db: DrizzleDb,
  cronExpression: string = "0 6 * * *"
): { stop: () => void } {
  const task = cron.schedule(cronExpression, () => {
    // Only generate if no lock is held (prevent duplicate concurrent runs)
    if (!acquireGenerationLock(null, "digest")) {
      return;
    }

    void generateDailyDigest(db)
      .then((digest) => {
        if (digest) {
          const inputHash = new Date().toISOString().slice(0, 10); // date-based hash
          writeToCache(db, null, "digest", digest, inputHash);
        }
        releaseGenerationLock(null, "digest");
      })
      .catch(() => {
        releaseGenerationLock(null, "digest");
      });
  });

  return {
    stop: () => task.stop(),
  };
}
