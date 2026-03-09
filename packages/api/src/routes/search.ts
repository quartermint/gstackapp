import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { searchQuerySchema } from "@mission-control/shared";
import { searchUnified } from "../db/queries/search.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Create search route handlers wired to a specific database instance.
 */
export function createSearchRoutes(getInstance: () => DatabaseInstance) {
  return new Hono().get(
    "/search",
    zValidator("query", searchQuerySchema),
    (c) => {
      const { q, limit } = c.req.valid("query");
      const results = searchUnified(getInstance().sqlite, q, { limit });
      return c.json({ results, query: q });
    }
  );
}
