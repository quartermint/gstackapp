import { Hono } from "hono";
import { getNarrative } from "../services/narrative-generator.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Intelligence API routes.
 *
 * GET /intelligence/:slug/narrative — Get AI-generated project narrative
 */
export function createIntelligenceRoutes(
  getInstance: () => DatabaseInstance
) {
  return new Hono()
    .get("/intelligence/:slug/narrative", (c) => {
      const slug = c.req.param("slug");

      const narrative = getNarrative(getInstance().db, slug);
      return c.json({ narrative });
    });
}
