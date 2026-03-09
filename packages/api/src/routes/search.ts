import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { searchQuerySchema } from "@mission-control/shared";
import { searchUnified } from "../db/queries/search.js";
import { processSearchQuery } from "../services/ai-query-rewriter.js";
import { listProjects } from "../db/queries/projects.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Create search route handlers wired to a specific database instance.
 * Integrates AI query rewriting for natural language queries with
 * graceful fallback to keyword FTS5 search.
 */
export function createSearchRoutes(getInstance: () => DatabaseInstance) {
  return new Hono().get(
    "/search",
    zValidator("query", searchQuerySchema),
    async (c) => {
      const { q, limit } = c.req.valid("query");
      const { db, sqlite } = getInstance();

      // Get projects list for AI rewriter context
      const projects = listProjects(db).map((p) => ({
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
      }));

      // Process query: AI rewrite for natural language, direct FTS5 for keywords
      const processed = await processSearchQuery(q, projects);

      // Execute unified search with rewritten query and extracted filters
      const results = searchUnified(sqlite, processed.ftsQuery, {
        limit,
        sourceType: processed.filters?.type ?? undefined,
        projectSlug: processed.filters?.project ?? undefined,
        dateAfter: processed.filters?.dateAfter ?? undefined,
        dateBefore: processed.filters?.dateBefore ?? undefined,
      });

      // Add id field to results (sourceId serves as the result id)
      const resultsWithId = results.map((r) => ({
        id: r.sourceId,
        ...r,
      }));

      return c.json({
        results: resultsWithId,
        query: q,
        rewrittenQuery:
          processed.rewritten ? processed.ftsQuery : null,
        filters: processed.filters,
      });
    }
  );
}
