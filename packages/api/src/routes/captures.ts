import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createCaptureSchema,
  updateCaptureSchema,
  captureIdSchema,
  listCapturesQuerySchema,
} from "@mission-control/shared";
import {
  createCapture,
  getCapture,
  listCaptures,
  updateCapture,
  deleteCapture,
  getStaleCaptures,
} from "../db/queries/captures.js";
import { enrichCapture } from "../services/enrichment.js";
import { AppError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Create capture route handlers wired to a specific database instance.
 */
export function createCaptureRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .post(
      "/captures",
      zValidator("json", createCaptureSchema),
      (c) => {
        try {
          const data = c.req.valid("json");
          const capture = createCapture(getInstance().db, data);

          // Fire-and-forget: trigger async enrichment after persisting
          // Response returns immediately with "raw" capture
          queueMicrotask(() => {
            enrichCapture(getInstance().db, capture.id).catch((err) => {
              console.error(`Enrichment failed for capture ${capture.id}:`, err);
            });
          });

          return c.json({ capture }, 201);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.status as 400);
          }
          throw e;
        }
      }
    )
    .get(
      "/captures",
      zValidator("query", listCapturesQuerySchema),
      (c) => {
        try {
          const query = c.req.valid("query");
          const result = listCaptures(getInstance().db, query);
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
      "/captures/stale",
      (c) => {
        try {
          const stale = getStaleCaptures(getInstance().db);
          return c.json({ captures: stale, total: stale.length });
        } catch (e) {
          if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.status as 500);
          }
          throw e;
        }
      }
    )
    .get(
      "/captures/:id",
      zValidator("param", captureIdSchema),
      (c) => {
        try {
          const { id } = c.req.valid("param");
          const capture = getCapture(getInstance().db, id);
          return c.json({ capture });
        } catch (e) {
          if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.status as 404);
          }
          throw e;
        }
      }
    )
    .patch(
      "/captures/:id",
      zValidator("param", captureIdSchema),
      zValidator("json", updateCaptureSchema),
      (c) => {
        try {
          const { id } = c.req.valid("param");
          const data = c.req.valid("json");
          const capture = updateCapture(getInstance().db, id, data);
          return c.json({ capture });
        } catch (e) {
          if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.status as 404);
          }
          throw e;
        }
      }
    )
    .delete(
      "/captures/:id",
      zValidator("param", captureIdSchema),
      (c) => {
        try {
          const { id } = c.req.valid("param");
          deleteCapture(getInstance().db, id);
          return c.body(null, 204);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.status as 404);
          }
          throw e;
        }
      }
    );
}
