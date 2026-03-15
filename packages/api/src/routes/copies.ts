import { Hono } from "hono";
import { getAllCopies, getCopiesByProject } from "../db/queries/copies.js";
import type { DatabaseInstance } from "../db/index.js";

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes = 2 scan cycles

/**
 * Enrich copy records with isStale flag.
 * A copy is stale when its lastCheckedAt is more than 10 minutes old.
 */
function addIsStale(
  copies: Array<{ lastCheckedAt: string; [key: string]: unknown }>
) {
  const now = Date.now();
  return copies.map((c) => ({
    ...c,
    isStale: now - new Date(c.lastCheckedAt).getTime() > STALE_THRESHOLD_MS,
  }));
}

/**
 * Multi-copy listing endpoints.
 *
 * GET /copies          — All project copy records with isStale
 * GET /copies/:slug    — Copies for one project
 */
export function createCopyRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .get("/copies", (c) => {
      const copies = getAllCopies(getInstance().db);
      const enriched = addIsStale(copies);
      return c.json({ copies: enriched, total: enriched.length });
    })
    .get("/copies/:slug", (c) => {
      const slug = c.req.param("slug");
      const copies = getCopiesByProject(getInstance().db, slug);
      const enriched = addIsStale(copies);
      return c.json({ copies: enriched, projectSlug: slug });
    });
}
