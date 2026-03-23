import { Hono } from "hono";
import { getNarrative } from "../services/narrative-generator.js";
import { getDigest } from "../services/digest-generator.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Intelligence API routes.
 *
 * GET /intelligence/:slug/narrative — Get AI-generated project narrative
 * GET /intelligence/digest — Get cached daily digest
 */
export function createIntelligenceRoutes(
  getInstance: () => DatabaseInstance
) {
  return new Hono()
    .get("/intelligence/digest", (c) => {
      const db = getInstance().db;
      const digest = getDigest(db);
      return c.json({ digest });
    })
    .get("/intelligence/:slug/narrative", (c) => {
      const slug = c.req.param("slug");

      const narrative = getNarrative(getInstance().db, slug);
      return c.json({ narrative });
    });
}
