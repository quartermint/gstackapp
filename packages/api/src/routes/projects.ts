import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { projectListQuerySchema } from "@mission-control/shared";
import { listProjects } from "../db/queries/projects.js";
import {
  getProjectWithScanData,
  getCachedScanData,
  scanAllProjects,
} from "../services/project-scanner.js";
import { getActiveFindings } from "../db/queries/health.js";
import { getAllCopies } from "../db/queries/copies.js";
import { computeHealthScore } from "../services/git-health.js";
import { AppError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";
import type { MCConfig } from "../lib/config.js";

/**
 * Create project route handlers wired to a specific database instance.
 * Config is optional -- refresh endpoint is a no-op without it.
 */
export function createProjectRoutes(
  getInstance: () => DatabaseInstance,
  getConfig?: () => MCConfig | null
) {
  return new Hono()
    .get(
      "/projects",
      zValidator("query", projectListQuerySchema),
      (c) => {
        try {
          const query = c.req.valid("query");
          const dbInstance = getInstance();
          const dbProjects = listProjects(dbInstance.db, {
            host: query.host,
          });

          // Batch fetch health data (single query each, not per-project)
          const allFindings = getActiveFindings(dbInstance.db);
          const allCopies = getAllCopies(dbInstance.db);

          // Group findings by projectSlug
          const findingsByProject = new Map<string, typeof allFindings>();
          for (const f of allFindings) {
            const group = findingsByProject.get(f.projectSlug) ?? [];
            group.push(f);
            findingsByProject.set(f.projectSlug, group);
          }

          // Count copies per project
          const copyCountByProject = new Map<string, number>();
          for (const copy of allCopies) {
            copyCountByProject.set(
              copy.projectSlug,
              (copyCountByProject.get(copy.projectSlug) ?? 0) + 1
            );
          }

          // Merge cached scan data and health enrichment into each project
          const projectsWithScanData = dbProjects.map((project) => {
            const scanData = getCachedScanData(project.slug);
            const findings = findingsByProject.get(project.slug) ?? [];
            return {
              ...project,
              branch: scanData?.branch ?? null,
              dirty: scanData?.dirty ?? null,
              dirtyFiles: scanData?.dirtyFiles ?? [],
              lastCommitHash: scanData?.commits[0]?.hash ?? null,
              lastCommitMessage: scanData?.commits[0]?.message ?? null,
              lastCommitTime: scanData?.commits[0]?.relativeTime ?? null,
              lastCommitDate: scanData?.commits[0]?.date ?? null,
              healthScore:
                findings.length > 0
                  ? computeHealthScore(
                      findings.map((f) => ({
                        projectSlug: f.projectSlug,
                        checkType: f.checkType as "unpushed_commits",
                        severity: f.severity as "critical",
                        detail: f.detail,
                        metadata: f.metadata,
                      }))
                    )
                  : null,
              riskLevel:
                findings.length === 0
                  ? "healthy"
                  : findings.some((f) => f.severity === "critical")
                    ? "critical"
                    : findings.some((f) => f.severity === "warning")
                      ? "warning"
                      : "healthy",
              copyCount: copyCountByProject.get(project.slug) ?? 0,
            };
          });

          return c.json({ projects: projectsWithScanData });
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 500
            );
          }
          throw e;
        }
      }
    )
    .get("/projects/:slug", (c) => {
      try {
        const slug = c.req.param("slug");
        const project = getProjectWithScanData(getInstance().db, slug);
        return c.json({ project });
      } catch (e) {
        if (e instanceof AppError) {
          return c.json(
            { error: { code: e.code, message: e.message } },
            e.status as 404
          );
        }
        throw e;
      }
    })
    .post("/projects/refresh", (c) => {
      const config = getConfig?.();
      if (config) {
        // Trigger scan asynchronously -- don't await
        scanAllProjects(config, getInstance().db).catch((err) =>
          console.error("Refresh scan failed:", err)
        );
      }
      return c.json({ message: "Scan initiated" }, 202);
    });
}
