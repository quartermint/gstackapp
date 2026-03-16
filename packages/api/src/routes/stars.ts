import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  listStarsQuerySchema,
  updateStarIntentSchema,
  starIdSchema,
} from "@mission-control/shared";
import {
  getStar,
  listStars,
  updateStarIntent,
} from "../db/queries/stars.js";
import { syncStars } from "../services/star-service.js";
import { eventBus } from "../services/event-bus.js";
import { AppError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";
import type { MCConfig } from "../lib/config.js";

/**
 * Create star route handlers wired to a specific database instance.
 */
export function createStarRoutes(
  getInstance: () => DatabaseInstance,
  getConfig: () => MCConfig | null
) {
  return new Hono()
    .get(
      "/stars",
      zValidator("query", listStarsQuerySchema),
      (c) => {
        try {
          const query = c.req.valid("query");
          const result = listStars(getInstance().db, query);
          return c.json(result);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.status as 400);
          }
          throw e;
        }
      }
    )
    .get(
      "/stars/:githubId",
      zValidator("param", starIdSchema),
      (c) => {
        try {
          const { githubId } = c.req.valid("param");
          const star = getStar(getInstance().db, githubId);
          return c.json({ star });
        } catch (e) {
          if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.status as 404);
          }
          throw e;
        }
      }
    )
    .patch(
      "/stars/:githubId/intent",
      zValidator("param", starIdSchema),
      zValidator("json", updateStarIntentSchema),
      (c) => {
        try {
          const { githubId } = c.req.valid("param");
          const { intent } = c.req.valid("json");
          const star = updateStarIntent(getInstance().db, githubId, intent);
          eventBus.emit("mc:event", { type: "star:categorized", id: String(githubId) });
          return c.json({ star });
        } catch (e) {
          if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.status as 404);
          }
          throw e;
        }
      }
    )
    .post(
      "/stars/sync",
      async (c) => {
        try {
          const config = getConfig();
          const result = await syncStars(getInstance().db, config);
          return c.json(result);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.status as 500);
          }
          throw e;
        }
      }
    );
}
