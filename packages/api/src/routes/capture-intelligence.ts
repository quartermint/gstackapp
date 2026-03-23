import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  captureIdSchema,
  reassignCaptureSchema,
} from "@mission-control/shared";
import {
  getCapture,
  updateCaptureEnrichment,
} from "../db/queries/captures.js";
import {
  createFewShotExample,
  listFewShotExamples,
} from "../db/queries/few-shot-examples.js";
import {
  getExtractionsByCapture,
} from "../db/queries/capture-extractions.js";
import {
  recordCorrection,
  getAllCorrectionStats,
} from "../db/queries/correction-stats.js";
import { eventBus } from "../services/event-bus.js";
import { AppError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";

/**
 * Capture intelligence routes:
 * - POST /api/captures/:id/reassign — reassign capture to different project
 * - GET /api/captures/:id/extractions — get extractions for a capture
 * - GET /api/captures/correction-stats — get correction rate stats
 * - GET /api/captures/few-shot-examples — get all few-shot examples
 */
export function createCaptureIntelligenceRoutes(
  getInstance: () => DatabaseInstance
) {
  return new Hono()
    .post(
      "/captures/:id/reassign",
      zValidator("param", captureIdSchema),
      zValidator("json", reassignCaptureSchema),
      (c) => {
        try {
          const { id } = c.req.valid("param");
          const { projectSlug } = c.req.valid("json");
          const db = getInstance().db;

          // Get the capture to find its current AI prediction
          const capture = getCapture(db, id);
          const previousSlug = capture.aiProjectSlug;

          // Update the capture's projectId to the new slug
          updateCaptureEnrichment(db, id, {
            projectId: projectSlug,
          });

          // Record correction: store the user's correction as a new few-shot example
          createFewShotExample(db, {
            captureContent: capture.rawContent,
            projectSlug,
            extractionType: "project_ref",
            isCorrection: true,
            sourceCaptureId: id,
          });

          // Track correction stats if AI had a different prediction
          if (previousSlug && previousSlug !== projectSlug) {
            recordCorrection(db, previousSlug, projectSlug);
          }

          const updated = getCapture(db, id);

          // Emit event for real-time subscribers
          eventBus.emit("mc:event", {
            type: "capture:reassigned",
            id,
          });

          return c.json({
            capture: updated,
            correction: {
              previousSlug,
              newSlug: projectSlug,
              fewShotExampleCreated: true,
            },
          });
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
    )
    .get(
      "/captures/:id/extractions",
      zValidator("param", captureIdSchema),
      (c) => {
        try {
          const { id } = c.req.valid("param");
          const db = getInstance().db;

          // Verify capture exists
          getCapture(db, id);

          const extractions = getExtractionsByCapture(db, id);

          return c.json({
            captureId: id,
            extractions: extractions.map((e) => ({
              id: e.id,
              extractionType: e.extractionType,
              content: e.content,
              confidence: e.confidence,
              grounding: e.groundingJson
                ? JSON.parse(e.groundingJson)
                : null,
              createdAt: e.createdAt?.toISOString() ?? null,
            })),
          });
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
    )
    .get("/captures/correction-stats", (c) => {
      try {
        const db = getInstance().db;
        const stats = getAllCorrectionStats(db);

        return c.json({
          stats: stats.map((s) => ({
            predictedSlug: s.predictedSlug,
            actualSlug: s.actualSlug,
            correctionCount: s.correctionCount,
            lastCorrectedAt: s.lastCorrectedAt?.toISOString() ?? null,
          })),
          total: stats.length,
        });
      } catch (e) {
        if (e instanceof AppError) {
          return c.json(
            { error: { code: e.code, message: e.message } },
            e.status as 500
          );
        }
        throw e;
      }
    })
    .get("/captures/few-shot-examples", (c) => {
      try {
        const db = getInstance().db;
        const examples = listFewShotExamples(db);

        return c.json({
          examples: examples.map((e) => ({
            id: e.id,
            captureContent: e.captureContent,
            projectSlug: e.projectSlug,
            extractionType: e.extractionType,
            isCorrection: e.isCorrection,
            sourceCaptureId: e.sourceCaptureId,
            createdAt: e.createdAt?.toISOString() ?? null,
          })),
          total: examples.length,
        });
      } catch (e) {
        if (e instanceof AppError) {
          return c.json(
            { error: { code: e.code, message: e.message } },
            e.status as 500
          );
        }
        throw e;
      }
    });
}
