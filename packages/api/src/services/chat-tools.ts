/**
 * Chat tools for Bella's conversational interface.
 *
 * AI SDK tool definitions wrapping MC database queries. Each tool
 * provides structured access to MC data (projects, captures, sessions,
 * health findings, search) for LM Studio to call during chat.
 *
 * Pattern: RAG via tool calling (RESEARCH Pattern 1). The LLM decides
 * which tools to call based on the user's question, MC executes them,
 * and the LLM synthesizes a grounded response.
 */

import { zodSchema } from "ai";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import type { DatabaseInstance, DrizzleDb } from "../db/index.js";
import { listProjects as dbListProjects } from "../db/queries/projects.js";
import { listCaptures, createCapture as dbCreateCapture } from "../db/queries/captures.js";
import { hybridSearch } from "./hybrid-search.js";
import { getActiveFindings } from "../db/queries/health.js";
import { sessions, captures, projects } from "../db/schema.js";
import type Database from "better-sqlite3";

// ── Tool implementations (pure functions) ──────────────────────

function listProjectsImpl(db: DrizzleDb) {
  const allProjects = dbListProjects(db);
  return {
    projects: allProjects.map((p) => ({
      slug: p.slug,
      name: p.name,
      host: p.host,
      tagline: p.tagline,
      lastScannedAt: p.lastScannedAt?.toISOString() ?? null,
    })),
  };
}

function getProjectStatusImpl(db: DrizzleDb, slug: string) {
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .get();

  if (!project) {
    return { error: `Project '${slug}' not found` };
  }

  const findings = getActiveFindings(db, slug);
  return {
    project: {
      slug: project.slug,
      name: project.name,
      host: project.host,
      tagline: project.tagline,
      lastScannedAt: project.lastScannedAt?.toISOString() ?? null,
    },
    findings: findings.map((f) => ({
      id: f.id,
      projectSlug: f.projectSlug,
      checkType: f.checkType,
      severity: f.severity,
      detail: f.detail,
      detectedAt: f.detectedAt,
    })),
    healthSummary: {
      total: findings.length,
      critical: findings.filter((f) => f.severity === "critical").length,
      warning: findings.filter((f) => f.severity === "warning").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
  };
}

function getRecentCapturesImpl(
  db: DrizzleDb,
  projectSlug: string | undefined,
  limit: number
) {
  const result = listCaptures(db, {
    projectId: projectSlug,
    limit,
    offset: 0,
  });
  return {
    captures: result.captures.map((c) => ({
      id: c.id,
      rawContent: c.rawContent,
      projectId: c.projectId,
      sourceType: c.sourceType,
      userId: c.userId,
      createdAt: c.createdAt.toISOString(),
    })),
    total: result.total,
  };
}

function getImessageExtractsImpl(db: DrizzleDb, limit: number) {
  const rows = db
    .select()
    .from(captures)
    .where(eq(captures.sourceType, "imessage"))
    .orderBy(desc(captures.createdAt))
    .limit(limit)
    .all();

  return {
    captures: rows.map((c) => ({
      id: c.id,
      rawContent: c.rawContent,
      projectId: c.projectId,
      sourceType: c.sourceType,
      userId: c.userId,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

async function searchMCImpl(sqlite: Database.Database, db: DrizzleDb, query: string) {
  const response = await hybridSearch(sqlite, db, query, { limit: 10 });
  return {
    searchMode: response.searchMode,
    query: response.rewrittenQuery ?? query,
    results: response.results.map((r) => ({
      snippet: r.snippet,
      sourceType: r.sourceType,
      projectSlug: r.projectSlug,
      rank: r.rank,
      projectContext: r.projectContext ?? null,
    })),
  };
}

function createCaptureImpl(
  db: DrizzleDb,
  content: string,
  projectSlug: string | undefined,
  userId: string
) {
  const newCapture = dbCreateCapture(db, {
    rawContent: content,
    type: "text",
    projectId: projectSlug,
    userId,
    sourceType: "bella",
  });
  return {
    capture: {
      id: newCapture.id,
      rawContent: newCapture.rawContent,
      projectId: newCapture.projectId,
      userId: newCapture.userId,
      sourceType: newCapture.sourceType,
      createdAt: newCapture.createdAt.toISOString(),
    },
  };
}

function getRecentSessionsImpl(db: DrizzleDb, limit: number) {
  const rows = db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .all();

  return {
    sessions: rows.map((s) => ({
      id: s.id,
      source: s.source,
      projectSlug: s.projectSlug,
      status: s.status,
      tier: s.tier,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
    })),
  };
}

// ── Safe wrapper ───────────────────────────────────────────────

function safeExecute<T>(fn: () => T): T | { error: string } {
  try {
    return fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Tool factory ───────────────────────────────────────────────

/**
 * Create AI SDK tool definitions for chat.
 * Each tool wraps MC query functions and returns structured data.
 *
 * Uses zodSchema() for inputSchema to avoid tool() overload resolution
 * issues in AI SDK v6 with TypeScript strict mode.
 *
 * @param dbInstance - Database instance (db + sqlite)
 * @param userId - Resolved user ID for capture attribution
 */
export function createChatTools(dbInstance: DatabaseInstance, userId: string) {
  const { db, sqlite } = dbInstance;

  return {
    listProjects: {
      description: "List all tracked projects with status and health",
      inputSchema: zodSchema(z.object({})),
      execute: async () => safeExecute(() => listProjectsImpl(db)),
    },

    getProjectStatus: {
      description: "Get detailed status for a specific project including health findings",
      inputSchema: zodSchema(z.object({ slug: z.string() })),
      execute: async (args: { slug: string }) =>
        safeExecute(() => getProjectStatusImpl(db, args.slug)),
    },

    getRecentCaptures: {
      description: "Get recent captures, optionally filtered by project",
      inputSchema: zodSchema(z.object({
        projectSlug: z.string().optional(),
        limit: z.number().default(10),
      })),
      execute: async (args: { projectSlug?: string; limit: number }) =>
        safeExecute(() => getRecentCapturesImpl(db, args.projectSlug, args.limit)),
    },

    getImessageExtracts: {
      description: "Get iMessage conversation extracts captured by MC",
      inputSchema: zodSchema(z.object({
        limit: z.number().default(20),
      })),
      execute: async (args: { limit: number }) =>
        safeExecute(() => getImessageExtractsImpl(db, args.limit)),
    },

    searchMC: {
      description: "Search across all MC content (captures, commits, knowledge, solutions)",
      inputSchema: zodSchema(z.object({ query: z.string() })),
      execute: async (args: { query: string }) => {
        try {
          return await searchMCImpl(sqlite, db, args.query);
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Unknown error" };
        }
      },
    },

    createCapture: {
      description: "Create a capture on Ryan's behalf (e.g., 'remember this', 'add to backlog')",
      inputSchema: zodSchema(z.object({
        content: z.string(),
        projectSlug: z.string().optional(),
      })),
      execute: async (args: { content: string; projectSlug?: string }) =>
        safeExecute(() => createCaptureImpl(db, args.content, args.projectSlug, userId)),
    },

    getRecentSessions: {
      description: "Get recent Claude Code sessions with project and status info",
      inputSchema: zodSchema(z.object({
        limit: z.number().default(5),
      })),
      execute: async (args: { limit: number }) =>
        safeExecute(() => getRecentSessionsImpl(db, args.limit)),
    },
  };
}
