import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { projectSlugSchema, projectListQuerySchema } from "@mission-control/shared";
import { listProjects } from "../db/queries/projects.js";
import {
  getProjectWithScanData,
  getCachedScanData,
  scanAllProjects,
} from "../services/project-scanner.js";
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
          const dbProjects = listProjects(getInstance().db, {
            host: query.host,
          });

          // Merge cached scan data into each project
          const projectsWithScanData = dbProjects.map((project) => {
            const scanData = getCachedScanData(project.slug);
            return {
              ...project,
              branch: scanData?.branch ?? null,
              dirty: scanData?.dirty ?? null,
              dirtyFiles: scanData?.dirtyFiles ?? [],
              lastCommitHash: scanData?.commits[0]?.hash ?? null,
              lastCommitMessage: scanData?.commits[0]?.message ?? null,
              lastCommitTime: scanData?.commits[0]?.relativeTime ?? null,
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
