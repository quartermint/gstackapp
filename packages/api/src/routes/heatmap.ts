import { Hono } from "hono";
import { getHeatmapData } from "../db/queries/commits.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Create heatmap route handlers wired to a specific database instance.
 * Returns commit intensity data aggregated by project and day.
 */
export function createHeatmapRoutes(getInstance: () => DatabaseInstance) {
  return new Hono().get("/heatmap", (c) => {
    const weeksParam = c.req.query("weeks");
    const weeks = weeksParam
      ? Math.min(Math.max(1, parseInt(weeksParam, 10) || 12), 52)
      : 12;

    const heatmap = getHeatmapData(getInstance().db, weeks);
    return c.json({ heatmap });
  });
}
