import { generateText, Output } from "ai";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getLmStudioStatus, createLmStudioProvider } from "./lm-studio.js";
import { commits } from "../db/schema.js";
import type { DrizzleDb } from "../db/index.js";

const DEFAULT_LM_STUDIO_URL = "http://100.123.8.125:1234";

// ── Types ──────────────────────────────────────────────────────

export interface SessionSignal {
  durationMinutes: number;
  filesCount: number;
  commitCount: number;
  projectSlug: string | null;
}

/**
 * Minimal session shape needed by the extractor.
 * Avoids coupling to the full Drizzle session row type.
 */
export interface SessionInput {
  id: string;
  projectSlug: string | null;
  filesJson: string | null;
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * Structured metadata extracted from a session via LM Studio.
 */
export interface SolutionMetadata {
  title: string;
  problemType: string;
  symptoms: string;
  rootCause: string;
  tags: string[];
  severity: string;
  module: string | null;
}

// ── Zod schema for LM Studio extraction ───────────────────────

const solutionExtractionSchema = z.object({
  title: z.string().describe("One-line description of what was solved"),
  problemType: z
    .enum([
      "bug_fix",
      "architecture",
      "performance",
      "integration",
      "configuration",
      "testing",
      "deployment",
    ])
    .describe("Category of problem solved"),
  symptoms: z
    .string()
    .describe("What went wrong or what needed to change"),
  rootCause: z.string().describe("Why it happened"),
  tags: z.array(z.string()).describe("Keywords for searchability"),
  severity: z
    .enum(["low", "medium", "high", "critical"])
    .describe("How impactful the issue was"),
  module: z
    .string()
    .nullable()
    .describe("Primary module/directory affected"),
});

// ── Session Significance Heuristic (D-04) ─────────────────────

/**
 * Determine whether a session is significant enough to generate
 * a solution candidate. Per D-04: Claude's discretion on heuristic.
 *
 * A session is "significant" when it demonstrates problem-solving work,
 * not just routine operations.
 */
export function isSignificantSession(signal: SessionSignal): boolean {
  // Skip sessions with no project context (can't compound without project)
  if (!signal.projectSlug) return false;

  // Gate 1: Duration -- skip trivial sessions (<5 min)
  if (signal.durationMinutes < 5) return false;

  // Gate 2: Evidence of work -- need either commits or file touches
  if (signal.filesCount < 3 && signal.commitCount === 0) return false;

  // Gate 3: Meaningful work threshold
  // Any session with commits has produced artifacts worth documenting
  if (signal.commitCount >= 1) return true;

  // Long sessions (>30 min) with file activity are likely problem-solving
  if (signal.durationMinutes >= 30 && signal.filesCount >= 5) return true;

  // Many files touched (>10) suggests significant refactoring/fixing
  if (signal.filesCount >= 10) return true;

  return false;
}

// ── Session Signal Builder ────────────────────────────────────

/**
 * Build a SessionSignal from session data and DB queries.
 * Extracts duration, file count, and commit count.
 */
export function buildSessionSignal(
  db: DrizzleDb,
  session: SessionInput
): SessionSignal {
  // Duration: endedAt - startedAt in minutes
  const endTime = session.endedAt ?? new Date();
  const durationMinutes =
    (endTime.getTime() - session.startedAt.getTime()) / 60_000;

  // Files: parse filesJson array
  let filesCount = 0;
  if (session.filesJson) {
    try {
      const files = JSON.parse(session.filesJson) as string[];
      filesCount = files.length;
    } catch {
      filesCount = 0;
    }
  }

  // Commits: count commits for project in session time range
  // authorDate is stored as ISO string, startedAt/endedAt are Date objects
  let commitCount = 0;
  if (session.projectSlug) {
    const startIso = session.startedAt.toISOString();
    const endIso = endTime.toISOString();

    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(commits)
      .where(
        sql`${commits.projectSlug} = ${session.projectSlug}
            AND ${commits.authorDate} >= ${startIso}
            AND ${commits.authorDate} <= ${endIso}`
      )
      .get();

    commitCount = result?.count ?? 0;
  }

  return {
    durationMinutes,
    filesCount,
    commitCount,
    projectSlug: session.projectSlug,
  };
}

// ── Content Builder ───────────────────────────────────────────

/**
 * Build readable content from commit messages and file list.
 * This becomes the solution `content` field for search indexing.
 */
export function buildSolutionContent(
  sessionCommits: Array<{ message: string }>,
  files: string[],
  session: {
    projectSlug: string | null;
    startedAt: Date;
    endedAt: Date | null;
  }
): string {
  const endTime = session.endedAt ?? new Date();
  const durationMinutes = Math.round(
    (endTime.getTime() - session.startedAt.getTime()) / 60_000
  );

  const commitSection =
    sessionCommits.length > 0
      ? sessionCommits.map((c) => `- ${c.message}`).join("\n")
      : "No commits";

  const filesSection =
    files.length > 0
      ? files.map((f) => `- ${f}`).join("\n")
      : "No files tracked";

  return `## Session Summary

**Project:** ${session.projectSlug ?? "unknown"}
**Duration:** ${durationMinutes} minutes
**Files:** ${files.length}

## Commits

${commitSection}

## Files Modified

${filesSection}`;
}

// ── Title Builder ─────────────────────────────────────────────

/**
 * Extract a title from commit messages.
 * - If 1 commit: use its message (trim to 100 chars)
 * - If multiple: use the first commit message (trim to 100 chars)
 * - If no commits: "Session work on {projectSlug}"
 */
export function buildTitle(
  sessionCommits: Array<{ message: string }>,
  projectSlug: string | null
): string {
  if (sessionCommits.length === 0) {
    return projectSlug ? `Session work on ${projectSlug}` : "Session work";
  }

  const msg = sessionCommits[0]!.message;
  return msg.length > 100 ? msg.slice(0, 100) : msg;
}

// ── LM Studio Enrichment ──────────────────────────────────────

/**
 * Extract structured metadata from session content via LM Studio.
 * Returns null when LM Studio is unavailable (graceful degradation per D-05).
 */
export async function extractSolutionMetadata(
  content: string,
  projectSlug: string | null
): Promise<SolutionMetadata | null> {
  // Check LM Studio health -- don't block on unavailable
  if (getLmStudioStatus().health !== "ready") {
    return null;
  }

  try {
    const provider = createLmStudioProvider(DEFAULT_LM_STUDIO_URL);

    const { output } = await generateText({
      model: provider("qwen3-coder"),
      output: Output.object({ schema: solutionExtractionSchema }),
      system:
        "You are analyzing a Claude Code session summary to extract structured solution metadata. Identify what problem was solved, what caused it, and how it was fixed.",
      prompt: `Analyze this session from project "${projectSlug ?? "unknown"}" and extract structured metadata:

${content}`,
    });

    if (!output) return null;

    return {
      title: output.title,
      problemType: output.problemType,
      symptoms: output.symptoms,
      rootCause: output.rootCause,
      tags: output.tags,
      severity: output.severity,
      module: output.module,
    };
  } catch {
    // Extraction failure is ok -- candidate still exists with basic info
    return null;
  }
}

// Re-export computeContentHash for convenience
export { computeContentHash } from "./embedding.js";
