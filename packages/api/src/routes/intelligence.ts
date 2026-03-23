import { Hono } from "hono";
import { getNarrative } from "../services/narrative-generator.js";
import { getDigest } from "../services/digest-generator.js";
import {
  getActiveInsights,
  dismissInsight,
  snoozeInsight,
  getInsightById,
} from "../db/queries/insights.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Intelligence API routes.
 *
 * GET /intelligence/digest — Get cached daily digest
 * GET /intelligence/insights — Get active insights (not dismissed, not snoozed)
 * POST /intelligence/insights/:id/dismiss — Dismiss an insight
 * POST /intelligence/insights/:id/snooze — Snooze an insight
 * GET /intelligence/:slug/narrative — Get AI-generated project narrative
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
    .get("/intelligence/insights", (c) => {
      const db = getInstance().db;
      const type = c.req.query("type");
      const insights = getActiveInsights(db, type ? { type } : undefined);
      return c.json({ insights });
    })
    .post("/intelligence/insights/:id/dismiss", async (c) => {
      const db = getInstance().db;
      const id = c.req.param("id");

      const insight = getInsightById(db, id);
      if (!insight) {
        return c.json({ error: { code: "NOT_FOUND", message: "Insight not found" } }, 404);
      }

      dismissInsight(db, id);

      return c.json({ ok: true });
    })
    .post("/intelligence/insights/:id/snooze", async (c) => {
      const db = getInstance().db;
      const id = c.req.param("id");

      const insight = getInsightById(db, id);
      if (!insight) {
        return c.json({ error: { code: "NOT_FOUND", message: "Insight not found" } }, 404);
      }

      const body = await c.req.json<{ hours?: number }>();
      const hours = body.hours ?? 24;

      snoozeInsight(db, id, hours);

      return c.json({ ok: true });
    })
    .get("/intelligence/:slug/narrative", (c) => {
      const slug = c.req.param("slug");

      const narrative = getNarrative(getInstance().db, slug);
      return c.json({ narrative });
    });
}
