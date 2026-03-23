/**
 * Intelligence tool calling via structured output (not native function calling).
 *
 * Per DAEMON-05 and RESEARCH.md: Qwen3-Coder has unreliable native function
 * calling (GitHub issue #475). Instead, the LLM returns a JSON object describing
 * which tool to call, and MC executes it.
 *
 * Uses z.discriminatedUnion for type-safe tool dispatch.
 */

import { z } from "zod";
import { sql } from "drizzle-orm";
import { projects, commits, captures, projectKnowledge } from "../db/schema.js";
import { searchUnified } from "../db/queries/search.js";
import type { DrizzleDb } from "../db/index.js";
import type Database from "better-sqlite3";

// ── Available Tools Registry ──────────────────────────────────

export const AVAILABLE_TOOLS = {
  search: {
    description:
      "Search across all MC content (captures, commits, knowledge, solutions)",
    parameters: z.object({ query: z.string() }),
  },
  project_lookup: {
    description:
      "Get current status and recent activity for a project",
    parameters: z.object({ slug: z.string() }),
  },
  capture_stats: {
    description:
      "Get capture statistics for a project over a time range",
    parameters: z.object({
      slug: z.string(),
      days: z.number().default(7),
    }),
  },
  knowledge_query: {
    description:
      "Query aggregated CLAUDE.md knowledge for a project",
    parameters: z.object({ slug: z.string() }),
  },
} as const;

// ── Discriminated Union Schema ────────────────────────────────

export const toolCallSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("search"),
    args: z.object({ query: z.string() }),
  }),
  z.object({
    tool: z.literal("project_lookup"),
    args: z.object({ slug: z.string() }),
  }),
  z.object({
    tool: z.literal("capture_stats"),
    args: z.object({
      slug: z.string(),
      days: z.number().default(7),
    }),
  }),
  z.object({
    tool: z.literal("knowledge_query"),
    args: z.object({ slug: z.string() }),
  }),
]);

export type ToolCall = z.infer<typeof toolCallSchema>;

// ── Tool Execution ────────────────────────────────────────────

/**
 * Execute a parsed tool call against the database.
 * Returns structured results. Wraps each in try/catch, returns { error } on failure.
 */
export async function executeToolCall(
  toolCall: ToolCall,
  db: DrizzleDb,
  sqlite?: Database.Database
): Promise<unknown> {
  try {
    switch (toolCall.tool) {
      case "search":
        return executeSearch(toolCall.args, db, sqlite);
      case "project_lookup":
        return executeProjectLookup(toolCall.args, db);
      case "capture_stats":
        return executeCaptureStats(toolCall.args, db);
      case "knowledge_query":
        return executeKnowledgeQuery(toolCall.args, db);
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Unknown error executing tool",
    };
  }
}

// ── Individual Tool Implementations ───────────────────────────

function executeSearch(
  args: { query: string },
  _db: DrizzleDb,
  sqlite?: Database.Database
): { results: unknown[] } {
  if (!sqlite) {
    return { results: [] };
  }

  try {
    const results = searchUnified(sqlite, args.query, { limit: 10 });
    return {
      results: results.map((r) => ({
        snippet: r.snippet,
        sourceType: r.sourceType,
        projectSlug: r.projectSlug,
        rank: r.rank,
      })),
    };
  } catch {
    return { results: [] };
  }
}

function executeProjectLookup(
  args: { slug: string },
  db: DrizzleDb
): {
  project: unknown;
  recentCommits: unknown[];
} {
  const project = db
    .select()
    .from(projects)
    .where(sql`${projects.slug} = ${args.slug}`)
    .get() ?? null;

  const recentCommits = db
    .select({
      hash: commits.hash,
      message: commits.message,
      authorDate: commits.authorDate,
    })
    .from(commits)
    .where(sql`${commits.projectSlug} = ${args.slug}`)
    .orderBy(sql`${commits.authorDate} DESC`)
    .limit(5)
    .all();

  return { project, recentCommits };
}

function executeCaptureStats(
  args: { slug: string; days: number },
  db: DrizzleDb
): { count: number; slug: string; days: number } {
  const since = new Date(Date.now() - args.days * 24 * 60 * 60_000);
  const sinceEpochSec = Math.floor(since.getTime() / 1000);

  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(captures)
    .where(
      sql`${captures.projectId} = ${args.slug} AND ${captures.createdAt} >= ${sinceEpochSec}`
    )
    .get();

  return {
    count: row?.count ?? 0,
    slug: args.slug,
    days: args.days,
  };
}

function executeKnowledgeQuery(
  args: { slug: string },
  db: DrizzleDb
): { knowledge: unknown } {
  const knowledge = db
    .select({
      projectSlug: projectKnowledge.projectSlug,
      content: projectKnowledge.content,
      fileSize: projectKnowledge.fileSize,
      lastModified: projectKnowledge.lastModified,
      commitsSinceUpdate: projectKnowledge.commitsSinceUpdate,
    })
    .from(projectKnowledge)
    .where(sql`${projectKnowledge.projectSlug} = ${args.slug}`)
    .get() ?? null;

  return { knowledge };
}
