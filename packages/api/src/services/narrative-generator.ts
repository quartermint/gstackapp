import { generateText, Output } from "ai";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getLmStudioStatus, createLmStudioProvider } from "./lm-studio.js";
import {
  getFromCache,
  writeToCache,
  acquireGenerationLock,
  releaseGenerationLock,
} from "./intelligence-cache.js";
import {
  buildNarrativeContext,
  getContextBudget,
  type NarrativeContextData,
} from "./context-adapter.js";
import { computeContentHash } from "./embedding.js";
import { eventBus } from "./event-bus.js";
import { commits, captures, sessions, projects } from "../db/schema.js";
import type { DrizzleDb } from "../db/index.js";

const DEFAULT_LM_STUDIO_URL = "http://100.x.x.x:1234";

// ── Zod schema for narrative output (D-03 constrained generation) ──

export const narrativeSchema = z.object({
  summary: z
    .string()
    .describe(
      "2-3 sentence TV-recap style narrative of recent project activity"
    ),
  highlights: z
    .array(z.string())
    .describe("3-5 key events: commits, captures, session outcomes"),
  openThreads: z
    .array(z.string())
    .describe(
      "Unfinished work: dirty tree, pending captures, active sessions"
    ),
  suggestedFocus: z
    .string()
    .nullable()
    .describe("Recommended next action based on project state"),
});

export type ProjectNarrative = z.infer<typeof narrativeSchema>;

// ── Project data gathering ──────────────────────────────────────

/**
 * Gather project context data (commits, captures, sessions, git state)
 * for building the narrative prompt.
 */
function gatherProjectData(db: DrizzleDb, slug: string): NarrativeContextData {
  // Last 10 commits
  const recentCommits = db
    .select({
      hash: commits.hash,
      message: commits.message,
      date: commits.authorDate,
    })
    .from(commits)
    .where(sql`${commits.projectSlug} = ${slug}`)
    .orderBy(sql`${commits.authorDate} DESC`)
    .limit(10)
    .all();

  // Last 5 captures
  const recentCaptures = db
    .select({
      content: captures.rawContent,
      createdAt: captures.createdAt,
    })
    .from(captures)
    .where(sql`${captures.projectId} = ${slug}`)
    .orderBy(sql`${captures.createdAt} DESC`)
    .limit(5)
    .all()
    .map((c) => ({
      content: c.content,
      createdAt: c.createdAt.toISOString(),
    }));

  // Last 3 sessions
  const recentSessions = db
    .select({
      id: sessions.id,
      source: sessions.source,
      startedAt: sessions.startedAt,
    })
    .from(sessions)
    .where(sql`${sessions.projectSlug} = ${slug}`)
    .orderBy(sql`${sessions.startedAt} DESC`)
    .limit(3)
    .all()
    .map((s) => ({
      id: s.id,
      source: s.source,
      startedAt: s.startedAt.toISOString(),
    }));

  // Git state from projects table
  const project = db
    .select()
    .from(projects)
    .where(sql`${projects.slug} = ${slug}`)
    .get();

  const gitState = project
    ? `Project: ${project.name}, Host: ${project.host}`
    : `Project: ${slug}`;

  return {
    commits: recentCommits,
    captures: recentCaptures,
    sessions: recentSessions,
    gitState,
  };
}

// ── LM Studio generation ────────────────────────────────────────

/**
 * Generate a project narrative via LM Studio.
 * Returns null when LM Studio is unavailable (graceful degradation per D-05).
 */
export async function generateProjectNarrative(
  db: DrizzleDb,
  slug: string,
  lmStudioUrl: string = DEFAULT_LM_STUDIO_URL
): Promise<ProjectNarrative | null> {
  // Check LM Studio health -- don't block on unavailable
  const status = getLmStudioStatus();
  if (status.health !== "ready") {
    return null;
  }

  try {
    const data = gatherProjectData(db, slug);
    const tokenBudget = getContextBudget(status.modelId);
    const context = buildNarrativeContext(data, tokenBudget);

    const provider = createLmStudioProvider(lmStudioUrl);

    const { output } = await generateText({
      model: provider("qwen3-coder"),
      output: Output.object({ schema: narrativeSchema }),
      system:
        "You are a project context restoration assistant for Mission Control. Write like a TV recap narrator. Be specific about what happened. Never make up details.",
      prompt: `Generate a "Previously on..." narrative for this project:\n\n${context}`,
    });

    if (!output) return null;

    return {
      summary: output.summary,
      highlights: output.highlights,
      openThreads: output.openThreads,
      suggestedFocus: output.suggestedFocus,
    };
  } catch {
    // Generation failure is ok -- return null for graceful degradation
    return null;
  }
}

// ── Cache-first serving ─────────────────────────────────────────

/**
 * Get narrative for a project, serving from cache first.
 * Never blocks -- if cache is expired/missing, triggers async regeneration
 * and returns stale data or null.
 */
export function getNarrative(
  db: DrizzleDb,
  slug: string
): ProjectNarrative | null {
  const cached = getFromCache<ProjectNarrative>(db, slug, "narrative");

  if (cached) {
    return cached;
  }

  // Cache miss -- trigger async regeneration (non-blocking)
  queueMicrotask(() => void regenerateNarrative(db, slug));

  return null;
}

// ── Async regeneration ──────────────────────────────────────────

/**
 * Regenerate a narrative in the background.
 * Uses generation lock to prevent duplicate concurrent LLM calls.
 */
async function regenerateNarrative(
  db: DrizzleDb,
  slug: string
): Promise<void> {
  // Acquire lock -- return early if already generating
  if (!acquireGenerationLock(slug, "narrative")) {
    return;
  }

  try {
    const result = await generateProjectNarrative(db, slug);

    if (result) {
      // Compute input hash from the context data for cache invalidation
      const data = gatherProjectData(db, slug);
      const contextStr = JSON.stringify(data);
      const inputHash = computeContentHash(contextStr);

      const status = getLmStudioStatus();
      writeToCache(
        db,
        slug,
        "narrative",
        result,
        inputHash,
        status.modelId ?? undefined
      );

      eventBus.emit("mc:event", {
        type: "intelligence:narrative_generated",
        id: slug,
      });
    }
  } finally {
    releaseGenerationLock(slug, "narrative");
  }
}
