import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  recordVisitSchema,
  getVisitQuerySchema,
} from "@mission-control/shared";
import { getLastVisit, recordVisit } from "../db/queries/visits.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Create visit route handlers wired to a specific database instance.
 * Tracks client visits so the dashboard can determine changes since last visit.
 */
export function createVisitRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .get(
      "/visits/last",
      zValidator("query", getVisitQuerySchema),
      (c) => {
        const { clientId } = c.req.valid("query");
        const { db } = getInstance();
        const visit = getLastVisit(db, clientId);
        if (!visit) {
          return c.json(
            { error: { code: "NOT_FOUND", message: "No previous visit" } },
            404
          );
        }
        return c.json(visit);
      }
    )
    .post(
      "/visits",
      zValidator("json", recordVisitSchema),
      (c) => {
        const { clientId } = c.req.valid("json");
        const { db } = getInstance();
        const result = recordVisit(db, clientId);
        return c.json(result);
      }
    );
}
