import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { searchQuerySchema } from "@mission-control/shared";
import { hybridSearch } from "../services/hybrid-search.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Create search route handlers wired to a specific database instance.
 * Uses hybrid BM25 + vector search with Reciprocal Rank Fusion.
 * Falls back to BM25-only when LM Studio embeddings unavailable.
 */
export function createSearchRoutes(getInstance: () => DatabaseInstance) {
  return new Hono().get(
    "/search",
    zValidator("query", searchQuerySchema),
    async (c) => {
      const { q, limit } = c.req.valid("query");
      const { db, sqlite } = getInstance();

      // Hybrid search: BM25 + vector with RRF fusion
      const response = await hybridSearch(sqlite, db, q, { limit });

      return c.json({
        results: response.results,
        query: q,
        rewrittenQuery: response.rewrittenQuery,
        filters: response.filters,
        searchMode: response.searchMode,
      });
    }
  );
}
