import type Database from "better-sqlite3";
import {
  searchUnified,
  type UnifiedSearchResult,
  type SearchOptions,
  type SearchSourceType,
} from "../db/queries/search.js";
import { searchByVector, type VectorSearchResult } from "../db/queries/embeddings.js";
import { generateEmbedding, isEmbeddingAvailable } from "./embedding.js";
import { processSearchQuery, type SearchFilters } from "./ai-query-rewriter.js";
import { listProjects } from "../db/queries/projects.js";
import type { DrizzleDb } from "../db/index.js";

/**
 * RRF (Reciprocal Rank Fusion) parameters.
 * k=60 is the standard constant that prevents high-ranked items from dominating.
 * BM25 gets 2x weight (original query relevance), vector gets 1x weight.
 */
const RRF_K = 60;
const BM25_WEIGHT = 2.0;
const VECTOR_WEIGHT = 1.0;

export interface HybridSearchResult {
  id: string;
  content: string;
  snippet: string;
  sourceType: SearchSourceType;
  sourceId: string;
  projectSlug: string | null;
  rank: number;
  createdAt: string;
  bm25Score: number | null;
  vectorScore: number | null;
  fusedScore: number | null;
  projectContext?: string;
}

export interface HybridSearchOptions {
  limit?: number;
  sourceType?: SearchSourceType;
  projectSlug?: string;
  dateAfter?: string;
  dateBefore?: string;
}

export interface HybridSearchResponse {
  results: HybridSearchResult[];
  searchMode: "hybrid" | "bm25-only";
  filters: SearchFilters | null;
  rewrittenQuery: string | null;
}

/**
 * Compute RRF score for a single result at a given rank position.
 * score = weight / (k + rank + 1)
 */
export function rrfScore(rank: number, weight: number, k: number = RRF_K): number {
  return weight / (k + rank + 1);
}

/**
 * Fuse BM25 and vector results using Reciprocal Rank Fusion.
 *
 * Each result gets a fused score = sum of its RRF scores across result lists.
 * BM25 results get 2x weight, vector results get 1x weight.
 * Results are deduped by sourceId and sorted by fused score descending.
 */
export function fuseResults(
  bm25Results: UnifiedSearchResult[],
  vectorResults: VectorSearchResult[],
  allBm25: Map<string, UnifiedSearchResult>
): HybridSearchResult[] {
  // Map: sourceId -> accumulated scores + metadata
  const scoreMap = new Map<
    string,
    {
      bm25Rank: number | null;
      vectorRank: number | null;
      bm25Score: number;
      vectorScore: number;
      fusedScore: number;
      result: UnifiedSearchResult | null;
      vectorResult: VectorSearchResult | null;
    }
  >();

  // Process BM25 results (rank = position in result list, 0-indexed)
  for (let i = 0; i < bm25Results.length; i++) {
    const r = bm25Results[i]!;
    const score = rrfScore(i, BM25_WEIGHT);
    scoreMap.set(r.sourceId, {
      bm25Rank: i,
      vectorRank: null,
      bm25Score: score,
      vectorScore: 0,
      fusedScore: score,
      result: r,
      vectorResult: null,
    });
  }

  // Process vector results
  for (let i = 0; i < vectorResults.length; i++) {
    const vr = vectorResults[i]!;
    const score = rrfScore(i, VECTOR_WEIGHT);
    const existing = scoreMap.get(vr.sourceId);

    if (existing) {
      // Result appears in both lists — add vector score
      existing.vectorRank = i;
      existing.vectorScore = score;
      existing.fusedScore += score;
      existing.vectorResult = vr;
    } else {
      // Vector-only result — need to look up FTS metadata
      const bm25Meta = allBm25.get(vr.sourceId);
      scoreMap.set(vr.sourceId, {
        bm25Rank: null,
        vectorRank: i,
        bm25Score: 0,
        vectorScore: score,
        fusedScore: score,
        result: bm25Meta ?? null,
        vectorResult: vr,
      });
    }
  }

  // Sort by fused score descending and build output
  const sorted = Array.from(scoreMap.entries()).sort(
    (a, b) => b[1].fusedScore - a[1].fusedScore
  );

  return sorted.map(([sourceId, entry]) => {
    const r = entry.result;
    return {
      id: sourceId,
      content: r?.content ?? "",
      snippet: r?.snippet ?? "",
      sourceType: (r?.sourceType ?? entry.vectorResult?.sourceType ?? "capture") as SearchSourceType,
      sourceId,
      projectSlug: r?.projectSlug ?? null,
      rank: 0, // Will be set by position in sorted array
      createdAt: r?.createdAt ?? "",
      bm25Score: entry.bm25Score > 0 ? entry.bm25Score : null,
      vectorScore: entry.vectorScore > 0 ? entry.vectorScore : null,
      fusedScore: entry.fusedScore,
    };
  });
}

/**
 * Hybrid search orchestrator.
 *
 * Pipeline:
 * 1. Process query (AI rewrite for natural language, or direct FTS5)
 * 2. Run BM25 search via FTS5
 * 3. If embeddings available: run vector search via sqlite-vec
 * 4. Fuse results via RRF (or return BM25-only)
 *
 * Falls back to BM25-only when LM Studio is unavailable.
 */
export async function hybridSearch(
  sqlite: Database.Database,
  db: DrizzleDb,
  rawQuery: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const { limit = 20, sourceType, projectSlug, dateAfter, dateBefore } = options;

  // 1. Process query with AI rewriter
  const projects = listProjects(db).map((p) => ({
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
  }));

  const processed = await processSearchQuery(rawQuery, projects);

  // Merge explicit options with AI-extracted filters
  const searchOpts: SearchOptions = {
    limit: limit * 2, // Fetch more for fusion pool
    sourceType: sourceType ?? (processed.filters?.type as SearchSourceType | undefined) ?? undefined,
    projectSlug: projectSlug ?? processed.filters?.project ?? undefined,
    dateAfter: dateAfter ?? processed.filters?.dateAfter ?? undefined,
    dateBefore: dateBefore ?? processed.filters?.dateBefore ?? undefined,
  };

  // 2. BM25 search
  const bm25Results = searchUnified(sqlite, processed.ftsQuery, searchOpts);

  // Build lookup map for enriching vector-only results
  const bm25Map = new Map<string, UnifiedSearchResult>();
  for (const r of bm25Results) {
    bm25Map.set(r.sourceId, r);
  }

  // 3. Vector search (if available)
  const canDoVector = isEmbeddingAvailable();
  let vectorResults: VectorSearchResult[] = [];

  if (canDoVector) {
    const queryEmbedding = await generateEmbedding(rawQuery);
    if (queryEmbedding) {
      vectorResults = searchByVector(sqlite, queryEmbedding, limit * 2);
    }
  }

  // 4. Fuse or return BM25-only
  let results: HybridSearchResult[];
  let searchMode: "hybrid" | "bm25-only";

  if (vectorResults.length > 0) {
    const fused = fuseResults(bm25Results, vectorResults, bm25Map);
    results = fused.slice(0, limit);
    searchMode = "hybrid";
  } else {
    // BM25-only fallback
    results = bm25Results.slice(0, limit).map((r) => ({
      id: r.sourceId,
      content: r.content,
      snippet: r.snippet,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      projectSlug: r.projectSlug,
      rank: r.rank,
      createdAt: r.createdAt,
      bm25Score: null,
      vectorScore: null,
      fusedScore: null,
    }));
    searchMode = "bm25-only";
  }

  // 5. Context annotations (D-06): add project tagline + CLAUDE.md excerpt
  const contextCache = new Map<string, string>();
  for (const result of results) {
    if (!result.projectSlug) continue;
    if (contextCache.has(result.projectSlug)) {
      result.projectContext = contextCache.get(result.projectSlug);
      continue;
    }
    try {
      const ctx = sqlite
        .prepare(
          `SELECT p.tagline, pk.content FROM projects p
           LEFT JOIN project_knowledge pk ON pk.project_slug = p.slug
           WHERE p.slug = ?`
        )
        .get(result.projectSlug) as
        | { tagline: string | null; content: string | null }
        | undefined;
      if (ctx) {
        const excerpt = ctx.content
          ? ctx.content.slice(0, 200).split("\n").slice(0, 3).join(" ")
          : "";
        const contextStr = ctx.tagline
          ? `${ctx.tagline}${excerpt ? " -- " + excerpt : ""}`
          : excerpt;
        if (contextStr) {
          contextCache.set(result.projectSlug, contextStr);
          result.projectContext = contextStr;
        }
      }
    } catch {
      // Context annotation is best-effort, never break search
    }
  }

  return {
    results,
    searchMode,
    filters: processed.filters,
    rewrittenQuery: processed.rewritten ? processed.ftsQuery : null,
  };
}
