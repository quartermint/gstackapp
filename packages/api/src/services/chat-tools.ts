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

import { tool } from "ai";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import type { DatabaseInstance } from "../db/index.js";
import { listProjects as dbListProjects, getProject } from "../db/queries/projects.js";
import { listCaptures, createCapture as dbCreateCapture } from "../db/queries/captures.js";
import { searchUnified } from "../db/queries/search.js";
import { getActiveFindings } from "../db/queries/health.js";
import { sessions, captures, projects } from "../db/schema.js";

/**
 * Create AI SDK tool definitions for chat.
 * Each tool wraps MC query functions and returns structured data.
 *
 * @param dbInstance - Database instance (db + sqlite)
 * @param userId - Resolved user ID for capture attribution
 */
export function createChatTools(dbInstance: DatabaseInstance, userId: string) {
  const { db, sqlite } = dbInstance;

  return {
    listProjects: tool({
      description: "List all tracked projects with status and health",
      parameters: z.object({}),
      execute: async () => {
        try {
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
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to list projects" };
        }
      },
    }),

    getProjectStatus: tool({
      description: "Get detailed status for a specific project including health findings",
      parameters: z.object({ slug: z.string() }),
      execute: async ({ slug }) => {
        try {
          // Direct query to avoid getProject's notFound throw
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
            findings,
            healthSummary: {
              total: findings.length,
              critical: findings.filter((f) => f.severity === "critical").length,
              warning: findings.filter((f) => f.severity === "warning").length,
              info: findings.filter((f) => f.severity === "info").length,
            },
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to get project status" };
        }
      },
    }),

    getRecentCaptures: tool({
      description: "Get recent captures, optionally filtered by project",
      parameters: z.object({
        projectSlug: z.string().optional(),
        limit: z.number().default(10),
      }),
      execute: async ({ projectSlug, limit }) => {
        try {
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
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to get captures" };
        }
      },
    }),

    getImessageExtracts: tool({
      description: "Get iMessage conversation extracts captured by MC",
      parameters: z.object({
        limit: z.number().default(20),
      }),
      execute: async ({ limit }) => {
        try {
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
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to get iMessage extracts" };
        }
      },
    }),

    searchMC: tool({
      description: "Search across all MC content (captures, commits, knowledge, solutions)",
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        try {
          const results = searchUnified(sqlite, query, { limit: 10 });
          return {
            results: results.map((r) => ({
              snippet: r.snippet,
              sourceType: r.sourceType,
              projectSlug: r.projectSlug,
              rank: r.rank,
            })),
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to search" };
        }
      },
    }),

    createCapture: tool({
      description: "Create a capture on Ryan's behalf (e.g., 'remember this', 'add to backlog')",
      parameters: z.object({
        content: z.string(),
        projectSlug: z.string().optional(),
      }),
      execute: async ({ content, projectSlug }) => {
        try {
          const capture = dbCreateCapture(db, {
            rawContent: content,
            projectId: projectSlug,
            userId,
            sourceType: "bella",
          });
          return {
            capture: {
              id: capture.id,
              rawContent: capture.rawContent,
              projectId: capture.projectId,
              userId: capture.userId,
              sourceType: capture.sourceType,
              createdAt: capture.createdAt.toISOString(),
            },
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to create capture" };
        }
      },
    }),

    getRecentSessions: tool({
      description: "Get recent Claude Code sessions with project and status info",
      parameters: z.object({
        limit: z.number().default(5),
      }),
      execute: async ({ limit }) => {
        try {
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
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Failed to get sessions" };
        }
      },
    }),
  };
}
