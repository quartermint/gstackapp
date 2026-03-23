import { generateText, Output } from "ai";
import { z } from "zod";
import { getLmStudioStatus, createLmStudioProvider } from "./lm-studio.js";
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
 * Schema for query expansion output from LM Studio.
 */
const queryExpansionSchema = z.object({
  lexVariants: z
    .array(z.string())
    .describe(
      "2-3 keyword-optimized search terms for FTS5 text matching"
    ),
  vecVariants: z
    .array(z.string())
    .describe(
      "2-3 semantically rich rephrased queries for vector similarity search"
    ),
  projectFilter: z
    .string()
    .nullable()
    .describe("Project slug to filter by, or null"),
  typeFilter: z
    .enum(["capture", "commit", "project", "knowledge"])
    .nullable()
    .describe("Source type filter, or null"),
  dateFilter: z
    .object({
      after: z.string().nullable(),
      before: z.string().nullable(),
    })
    .nullable()
    .describe("Date range, or null"),
  reasoning: z
    .string()
    .describe("Brief explanation of the expansion"),
});

/**
 * Filters extracted from an AI-rewritten query.
 */
export interface SearchFilters {
  project: string | null;
  type: "capture" | "commit" | "project" | "knowledge" | null;
  dateAfter: string | null;
  dateBefore: string | null;
}

/**
 * Result from processSearchQuery -- the main orchestrator export.
 */
export interface ProcessedQuery {
  ftsQuery: string;
  filters: SearchFilters | null;
  rewritten: boolean;
  reasoning?: string;
  /** Keyword-optimized FTS5 query variants for hybrid search */
  lexVariants?: string[];
  /** Semantically rich query variants for vector similarity search */
  vecVariants?: string[];
}

/**
 * Query expansion result from LM Studio.
 */
export interface QueryExpansion {
  lexVariants: string[];
  vecVariants: string[];
  filters: SearchFilters | null;
  reasoning: string;
}

const DEFAULT_LM_STUDIO_URL = "http://100.x.x.x:1234";

/**
 * Expand a search query into typed lex (keyword) and vec (semantic) variants
 * using LM Studio's local LLM. Returns null on any failure.
 *
 * Per D-11: Uses Qwen3-Coder-30B via LM Studio for query expansion.
 */
export async function expandQuery(
  rawQuery: string,
  projects: Array<{ slug: string; name: string; tagline: string | null }>,
  lmStudioUrl: string = DEFAULT_LM_STUDIO_URL
): Promise<QueryExpansion | null> {
  try {
    const provider = createLmStudioProvider(lmStudioUrl);
    const projectContext = projects
      .map(
        (p) =>
          `- ${p.slug}: ${p.name}${p.tagline ? ` (${p.tagline})` : ""}`
      )
      .join("\n");

    const { output } = await generateText({
      model: provider("qwen3-coder"),
      output: Output.object({ schema: queryExpansionSchema }),
      prompt: `You are a search query expander for Mission Control, a personal project management system. It tracks projects, captures (thoughts/notes), commits, and CLAUDE.md knowledge files.

Given a query, generate:
1. lexVariants: 2-3 keyword-optimized search terms (important words only, no stop words, for FTS5 text search)
2. vecVariants: 2-3 semantically rich rephrased queries (for vector similarity search, capture intent and meaning)
3. projectFilter: project slug if query references a specific project, else null
4. typeFilter: source type if query targets one type, else null
5. dateFilter: date range if temporal reference, else null

Available projects:
${projectContext}

Query: "${rawQuery}"`,
    });

    if (!output) return null;

    return {
      lexVariants: output.lexVariants,
      vecVariants: output.vecVariants,
      filters: {
        project: output.projectFilter,
        type: output.typeFilter,
        dateAfter: output.dateFilter?.after ?? null,
        dateBefore: output.dateFilter?.before ?? null,
      },
      reasoning: output.reasoning,
    };
  } catch {
    return null;
  }
}

/**
 * Main orchestrator for search query processing.
 *
 * Routes queries through the appropriate path:
 * - Short keywords: direct FTS5 (fast path)
 * - Natural language when LM Studio not ready: FTS5 fallback (per D-05)
 * - Natural language when LM Studio ready: query expansion + filters
 * - Expansion error: FTS5 fallback (graceful degradation)
 */
export async function processSearchQuery(
  rawQuery: string,
  projects: Array<{ slug: string; name: string; tagline: string | null }>
): Promise<ProcessedQuery> {
  // Fast path: short keywords or LM Studio not ready
  if (!needsAIRewrite(rawQuery) || getLmStudioStatus().health !== "ready") {
    return {
      ftsQuery: sanitizeFtsQuery(rawQuery),
      filters: null,
      rewritten: false,
    };
  }

  try {
    const expansion = await expandQuery(rawQuery, projects);

    if (!expansion) {
      return {
        ftsQuery: sanitizeFtsQuery(rawQuery),
        filters: null,
        rewritten: false,
      };
    }

    // Use first lex variant as the primary FTS query, fall back to raw query
    const primaryFtsQuery = expansion.lexVariants[0] ?? rawQuery;

    return {
      ftsQuery: sanitizeFtsQuery(primaryFtsQuery),
      filters: expansion.filters,
      rewritten: true,
      reasoning: expansion.reasoning,
      lexVariants: expansion.lexVariants,
      vecVariants: expansion.vecVariants,
    };
  } catch {
    // Graceful fallback on any error
    return {
      ftsQuery: sanitizeFtsQuery(rawQuery),
      filters: null,
      rewritten: false,
    };
  }
}
