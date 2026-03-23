import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getKnowledge,
  getAllKnowledge,
  searchKnowledge,
} from "../db/queries/knowledge.js";
import { getActiveFindings } from "../db/queries/health.js";
import {
  getRelevantSolutions,
  recordSolutionReference,
} from "../db/queries/solutions.js";
import { resolveProjectFromCwd } from "../services/session-service.js";
import type { DatabaseInstance } from "../db/index.js";
import type { MCConfig } from "../lib/config.js";

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
export function createKnowledgeRoutes(
  getInstance: () => DatabaseInstance,
  getConfig: () => MCConfig | null = () => null
) {
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
    .get("/knowledge/digest", (c) => {
      const cwd = c.req.query("cwd");
      if (!cwd) {
        return c.json(
          {
            error: {
              code: "BAD_REQUEST",
              message: "cwd query parameter required",
            },
          },
          400
        );
      }

      const config = getConfig();
      if (!config) {
        return c.json({
          relatedProjects: [],
          violations: 0,
          staleKnowledge: false,
        });
      }

      // Resolve project slug from cwd
      const slug = resolveProjectFromCwd(cwd, config);
      if (!slug) {
        return c.json({
          relatedProjects: [],
          violations: 0,
          staleKnowledge: false,
        });
      }

      // Get dependsOn from config
      const projectEntry = config.projects.find((p) => p.slug === slug);
      const relatedProjects = projectEntry?.dependsOn ?? [];

      // Get convention violations from health findings
      const findings = getActiveFindings(getInstance().db, slug);
      const violations = findings.filter(
        (f) => f.checkType === "convention_violation"
      ).length;

      // Get staleness
      const knowledge = getKnowledge(getInstance().db, slug);
      const stalenessScore = knowledge
        ? computeStalenessScore(
            knowledge.lastModified,
            knowledge.commitsSinceUpdate
          )
        : null;
      const staleKnowledge = stalenessScore !== null && stalenessScore < 50;

      // Fetch relevant solutions for startup banner (COMP-03)
      const relevantSolutions = getRelevantSolutions(getInstance().db, slug, 3);
      const learnings = relevantSolutions.map((s) => ({
        id: s.id,
        title: s.title,
        problemType: s.problemType,
        severity: s.severity,
        snippet: s.content.slice(0, 200),
      }));

      return c.json({
        slug,
        relatedProjects,
        violations,
        staleKnowledge,
        stalenessScore,
        learnings,
      });
    })
    .post(
      "/knowledge/digest/record-reference",
      zValidator(
        "json",
        z.object({
          solutionId: z.string().min(1),
          sessionId: z.string().min(1),
        })
      ),
      (c) => {
        const { solutionId, sessionId } = c.req.valid("json");
        recordSolutionReference(
          getInstance().db,
          solutionId,
          sessionId,
          "startup_banner"
        );
        return c.json({ ok: true });
      }
    )
    .get("/knowledge/search", (c) => {
      const q = c.req.query("q");
      if (!q || q.length < 2) {
        return c.json({ results: [], total: 0 });
      }
      const results = searchKnowledge(getInstance().sqlite, q);
      const enriched = results.map((r) => ({
        projectSlug: r.projectSlug,
        snippet: r.snippet,
        fileSize: r.fileSize,
        stalenessScore: computeStalenessScore(
          r.lastModified,
          r.commitsSinceUpdate
        ),
      }));
      return c.json({ results: enriched, total: enriched.length });
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
