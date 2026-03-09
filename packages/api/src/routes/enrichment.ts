import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { captureIdSchema } from "@mission-control/shared";
import { getCapture } from "../db/queries/captures.js";
import { enrichCapture } from "../services/enrichment.js";
import { AppError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Create enrichment route handlers.
 * Provides manual re-enrichment endpoint for retrying
 * failed enrichments or re-categorizing after project changes.
 */
export function createEnrichmentRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .post(
      "/enrichment/:id",
      zValidator("param", captureIdSchema),
      (c) => {
        try {
          const { id } = c.req.valid("param");

          // Verify capture exists before accepting
          getCapture(getInstance().db, id);

          // Fire-and-forget: trigger enrichment async
          queueMicrotask(() => {
            enrichCapture(getInstance().db, id).catch((err) => {
              console.error(`Re-enrichment failed for capture ${id}:`, err);
            });
          });

          return c.json({ message: "Enrichment triggered", captureId: id }, 202);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 404
            );
          }
          throw e;
        }
      }
    );
}
