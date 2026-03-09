import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { isAIAvailable } from "./ai-categorizer.js";
import { sanitizeFtsQuery } from "../db/queries/search.js";

/**
 * Regex patterns for detecting natural language queries
 * that benefit from AI rewriting.
 */
const QUESTION_WORDS =
  /^(what|when|where|who|how|why|which|find|show|get)\b/i;
const QUESTION_PATTERNS =
  /\?$|did i|was i|about the|related to|working on|thinking about/i;

/**
 * Determine whether a query should be routed through the AI rewriter.
 * Short keyword queries (1-2 words without question indicators) go directly
 * to FTS5. Longer or question-like queries are rewritten by AI.
 */
export function needsAIRewrite(query: string): boolean {
  const trimmed = query.trim();
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);

  // 1-2 words without question word or pattern -> fast path
  if (words.length <= 2) {
    if (QUESTION_WORDS.test(trimmed)) return true;
    if (QUESTION_PATTERNS.test(trimmed)) return true;
    return false;
  }

  // Question word at start -> AI rewrite
  if (QUESTION_WORDS.test(trimmed)) return true;

  // Question pattern anywhere -> AI rewrite
  if (QUESTION_PATTERNS.test(trimmed)) return true;

  // 3+ words -> AI rewrite (likely a natural language phrase)
  return true;
}

/**
 * Schema for the AI query rewrite output.
 */
const queryRewriteSchema = z.object({
  ftsQuery: z
    .string()
    .describe("Optimized FTS5 search terms extracted from the query"),
  projectFilter: z
    .string()
    .nullable()
    .describe("Project slug to filter by, or null if no project match"),
  typeFilter: z
    .enum(["capture", "commit", "project"])
    .nullable()
    .describe("Source type to filter by, or null for all types"),
  dateFilter: z
    .object({
      after: z.string().nullable(),
      before: z.string().nullable(),
    })
    .nullable()
    .describe("Date range filter, or null for no date constraint"),
  reasoning: z
    .string()
    .describe("Brief explanation of the query rewrite decision"),
});

export type QueryRewriteResult = z.infer<typeof queryRewriteSchema>;

/**
 * Filters extracted from an AI-rewritten query.
 */
export interface SearchFilters {
  project: string | null;
  type: "capture" | "commit" | "project" | null;
  dateAfter: string | null;
  dateBefore: string | null;
}

/**
 * Result from processSearchQuery — the main orchestrator export.
 */
export interface ProcessedQuery {
  ftsQuery: string;
  filters: SearchFilters | null;
  rewritten: boolean;
  reasoning?: string;
}

/**
 * Use AI to rewrite a natural language query into optimized FTS5 search terms
 * and structured filters.
 */
export async function rewriteQuery(
  naturalLanguageQuery: string,
  projects: Array<{ slug: string; name: string; tagline: string | null }>
): Promise<QueryRewriteResult | null> {
  const projectContext = projects
    .map((p) => `- ${p.slug}: ${p.name}${p.tagline ? ` (${p.tagline})` : ""}`)
    .join("\n");

  const modelId = process.env["AI_MODEL"] ?? "gemini-3-flash-preview";

  const { output } = await generateText({
    model: google(modelId),
    output: Output.object({ schema: queryRewriteSchema }),
    prompt: `You are a search query optimizer for a personal project management system called Mission Control. It tracks projects, captures (raw thoughts/notes), and git commits.

Given a natural language question, extract:
1. Key FTS5 search terms (important keywords only, no stop words)
2. Project filter (match to a project slug if the query references a specific project)
3. Type filter (capture, commit, or project — only if query clearly targets one type)
4. Date range (only if query mentions time like "last week", "yesterday", etc.)

Available projects:
${projectContext}

User query: "${naturalLanguageQuery}"

Return optimized search terms and any applicable filters.`,
  });

  return output ?? null;
}

/**
 * Main orchestrator for search query processing.
 *
 * Routes queries through the appropriate path:
 * - Short keywords: direct FTS5 (fast path)
 * - Natural language when AI unavailable: FTS5 fallback
 * - Natural language when AI available: AI rewrite + filters
 * - AI error: FTS5 fallback (graceful degradation)
 */
export async function processSearchQuery(
  rawQuery: string,
  projects: Array<{ slug: string; name: string; tagline: string | null }>
): Promise<ProcessedQuery> {
  // Fast path: short keywords or AI unavailable
  if (!needsAIRewrite(rawQuery) || !isAIAvailable()) {
    return {
      ftsQuery: sanitizeFtsQuery(rawQuery),
      filters: null,
      rewritten: false,
    };
  }

  try {
    const result = await rewriteQuery(rawQuery, projects);

    if (!result) {
      return {
        ftsQuery: sanitizeFtsQuery(rawQuery),
        filters: null,
        rewritten: false,
      };
    }

    const filters: SearchFilters = {
      project: result.projectFilter,
      type: result.typeFilter,
      dateAfter: result.dateFilter?.after ?? null,
      dateBefore: result.dateFilter?.before ?? null,
    };

    return {
      ftsQuery: sanitizeFtsQuery(result.ftsQuery),
      filters,
      rewritten: true,
      reasoning: result.reasoning,
    };
  } catch {
    // Graceful fallback on any AI error
    return {
      ftsQuery: sanitizeFtsQuery(rawQuery),
      filters: null,
      rewritten: false,
    };
  }
}
