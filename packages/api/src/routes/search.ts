import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { searchQuerySchema } from "@mission-control/shared";
import { hybridSearch } from "../services/hybrid-search.js";
import { rerankResults } from "../services/reranker.js";
import type { DatabaseInstance } from "../db/index.js";
import type { MCConfig } from "../lib/config.js";

/**
 * Create search route handlers wired to a specific database instance.
 * Uses hybrid BM25 + vector search with Reciprocal Rank Fusion.
 * Optional cross-encoder reranking via LM Studio (D-08).
 * Falls back to BM25-only when LM Studio embeddings unavailable.
 */
export function createSearchRoutes(
  getInstance: () => DatabaseInstance,
  getConfig?: () => MCConfig | null
) {
  return new Hono().get(
    "/search",
    zValidator("query", searchQuerySchema),
    async (c) => {
      const { q, limit } = c.req.valid("query");
      const { db, sqlite } = getInstance();
      const config = getConfig?.();
      const lmStudioUrl =
        config?.lmStudio?.url ?? "http://100.123.8.125:1234";

      // Hybrid search: BM25 + vector with RRF fusion + context annotations
      const response = await hybridSearch(sqlite, db, q, { limit });

      // Optional reranking (D-08): cross-encoder reranking of top candidates
      const candidates = response.results.map((r) => ({
        id: r.sourceId,
        content: r.content,
        rrfScore: r.fusedScore ?? r.rank,
      }));
      const reranked = await rerankResults(q, candidates, lmStudioUrl);

      // Map reranked order + scores back to results
      const rerankedMap = new Map(
        reranked.map((r, i) => [r.id, { index: i, finalScore: r.finalScore }])
      );
      const sortedResults = [...response.results].sort((a, b) => {
        const aInfo = rerankedMap.get(a.sourceId);
        const bInfo = rerankedMap.get(b.sourceId);
        return (aInfo?.index ?? 0) - (bInfo?.index ?? 0);
      });

      // Build response with score field (fused or reranked) + backward-compat rank
      const resultsWithScore = sortedResults.map((r) => ({
        id: r.id,
        content: r.content,
        snippet: r.snippet,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        projectSlug: r.projectSlug,
        score: rerankedMap.get(r.sourceId)?.finalScore ?? r.fusedScore ?? r.rank,
        rank: rerankedMap.get(r.sourceId)?.finalScore ?? r.fusedScore ?? r.rank,
        createdAt: r.createdAt,
        projectContext: r.projectContext,
        bm25Score: r.bm25Score,
        vectorScore: r.vectorScore,
        fusedScore: r.fusedScore,
      }));

      return c.json({
        results: resultsWithScore,
        query: q,
        rewrittenQuery: response.rewrittenQuery,
        filters: response.filters,
        searchMode: response.searchMode,
      });
    }
  );
}
