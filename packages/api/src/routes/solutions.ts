import { Hono } from "hono";
import {
  createSolutionSchema,
  updateSolutionStatusSchema,
  updateSolutionMetadataSchema,
  listSolutionsQuerySchema,
} from "@mission-control/shared";
import {
  createSolution,
  getSolution,
  listSolutions,
  updateSolutionStatus,
  updateSolutionMetadata,
  getRelevantSolutions,
  getCompoundScore,
  solutionExistsForHash,
} from "../db/queries/solutions.js";
import { resolveProjectFromCwd } from "../services/session-service.js";
import { indexSolution } from "../db/queries/search.js";
import { eventBus } from "../services/event-bus.js";
import { validationError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";
import type { MCConfig } from "../lib/config.js";

/**
 * Solution API routes.
 *
 * GET    /solutions                - List solutions with filtering
 * GET    /solutions/compound-score - Get compound score metrics
 * GET    /solutions/relevant       - Get relevant solutions for a project (via cwd)
 * GET    /solutions/:id            - Get a single solution
 * POST   /solutions                - Create a new solution
 * PATCH  /solutions/:id/status     - Update solution status
 * PATCH  /solutions/:id/metadata   - Update solution metadata
 */
export function createSolutionRoutes(
  getInstance: () => DatabaseInstance,
  getConfig: () => MCConfig | null = () => null
) {
  return new Hono()
    .get("/solutions", (c) => {
      const raw = {
        projectSlug: c.req.query("projectSlug"),
        status: c.req.query("status"),
        problemType: c.req.query("problemType"),
        limit: c.req.query("limit"),
        offset: c.req.query("offset"),
      };

      const parsed = listSolutionsQuerySchema.safeParse(raw);
      if (!parsed.success) {
        throw validationError(parsed.error.message);
      }

      const result = listSolutions(getInstance().db, parsed.data);
      return c.json(result);
    })
    .get("/solutions/compound-score", (c) => {
      const score = getCompoundScore(getInstance().db);
      return c.json(score);
    })
    .get("/solutions/relevant", (c) => {
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
        return c.json({ solutions: [] });
      }

      const slug = resolveProjectFromCwd(cwd, config);
      if (!slug) {
        return c.json({ solutions: [] });
      }

      const relevant = getRelevantSolutions(getInstance().db, slug, 3);
      return c.json({ solutions: relevant });
    })
    .get("/solutions/:id", (c) => {
      const id = c.req.param("id");
      const solution = getSolution(getInstance().db, id);
      return c.json({ solution });
    })
    .post("/solutions", async (c) => {
      const body = await c.req.json();
      const parsed = createSolutionSchema.safeParse(body);
      if (!parsed.success) {
        throw validationError(parsed.error.message);
      }

      // Check for duplicate contentHash
      if (solutionExistsForHash(getInstance().db, parsed.data.contentHash)) {
        return c.json(
          {
            error: {
              code: "CONFLICT",
              message: `Solution with contentHash ${parsed.data.contentHash} already exists`,
            },
          },
          409
        );
      }

      const solution = createSolution(getInstance().db, parsed.data);
      return c.json({ solution }, 201);
    })
    .patch("/solutions/:id/status", async (c) => {
      const id = c.req.param("id");
      const body = await c.req.json();
      const parsed = updateSolutionStatusSchema.safeParse(body);
      if (!parsed.success) {
        throw validationError(parsed.error.message);
      }

      const solution = updateSolutionStatus(
        getInstance().db,
        id,
        parsed.data.status
      );

      // Index in FTS5 search when accepted, emit SSE event
      if (parsed.data.status === "accepted") {
        try {
          indexSolution(getInstance().sqlite, {
            id,
            content: solution.content,
            projectSlug: solution.projectSlug,
            createdAt: solution.createdAt,
          });
        } catch {
          // Indexing is best-effort -- don't fail the status update
        }
        eventBus.emit("mc:event", { type: "solution:accepted", id });
      }

      return c.json({ solution });
    })
    .patch("/solutions/:id/metadata", async (c) => {
      const id = c.req.param("id");
      const body = await c.req.json();
      const parsed = updateSolutionMetadataSchema.safeParse(body);
      if (!parsed.success) {
        throw validationError(parsed.error.message);
      }

      const solution = updateSolutionMetadata(
        getInstance().db,
        id,
        parsed.data
      );
      return c.json({ solution });
    });
}
