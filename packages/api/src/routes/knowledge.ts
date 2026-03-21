import { Hono } from "hono";
import { getKnowledge, getAllKnowledge } from "../db/queries/knowledge.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Staleness score: 0-100 (100=fresh, 0=very stale).
 * Age weight 60%, commits weight 40%.
 * Linear decay over 90 days and 50 commits.
 */
function computeStalenessScore(
  lastModified: string,
  commitsSinceUpdate: number
): number {
  const now = new Date();
  const modified = new Date(lastModified);
  if (isNaN(modified.getTime())) return 0;

  const ageDays =
    (now.getTime() - modified.getTime()) / (24 * 60 * 60 * 1000);
  const ageScore = Math.max(0, Math.min(100, 100 - (ageDays / 90) * 100));
  const commitScore = Math.max(
    0,
    Math.min(100, 100 - (commitsSinceUpdate / 50) * 100)
  );

  return Math.round(ageScore * 0.6 + commitScore * 0.4);
}

/**
 * Knowledge API routes.
 *
 * GET /knowledge          - List all knowledge records (without content) with stalenessScore
 * GET /knowledge/:slug    - Get full knowledge record with content and stalenessScore
 */
export function createKnowledgeRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .get("/knowledge", (c) => {
      const rows = getAllKnowledge(getInstance().db);
      const knowledge = rows.map((r) => ({
        ...r,
        stalenessScore: computeStalenessScore(
          r.lastModified,
          r.commitsSinceUpdate
        ),
      }));
      return c.json({ knowledge, total: knowledge.length });
    })
    .get("/knowledge/:slug", (c) => {
      const slug = c.req.param("slug");
      const row = getKnowledge(getInstance().db, slug);
      if (!row) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: `No knowledge found for project: ${slug}`,
            },
          },
          404
        );
      }
      return c.json({
        ...row,
        stalenessScore: computeStalenessScore(
          row.lastModified,
          row.commitsSinceUpdate
        ),
      });
    });
}
