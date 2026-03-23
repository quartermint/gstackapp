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
import { checkIdempotencyKey, storeIdempotencyKey } from "../db/queries/idempotency.js";
import { enrichCapture } from "../services/enrichment.js";
import { indexCapture, deindexCapture } from "../db/queries/search.js";
import { eventBus } from "../services/event-bus.js";
import { AppError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";
import { importCapacitiesBackup, findLatestBackupZip } from "../services/capacities-importer.js";
import { batchFetchTweets } from "../services/tweet-fetcher.js";
import { loadConfig } from "../lib/config.js";
import { captures } from "../db/schema.js";
import { eq, and, sql as drizzleSql, isNull } from "drizzle-orm";

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
          // Check for idempotency key before processing
          const idempotencyKey = c.req.header("Idempotency-Key");

          if (idempotencyKey) {
            const existing = checkIdempotencyKey(getInstance().db, idempotencyKey);
            if (existing) {
              const capture = getCapture(getInstance().db, existing.captureId);
              return c.json({ capture }, 201);
            }
          }

          const data = c.req.valid("json");
          const deviceHint = data.deviceClassification;
          const capture = createCapture(getInstance().db, data);

          // Store idempotency key for dedup on retries
          if (idempotencyKey) {
            storeIdempotencyKey(getInstance().db, idempotencyKey, capture.id);
          }

          // Index in unified search_index (replaces old FTS trigger)
          indexCapture(getInstance().sqlite, {
            id: capture.id,
            rawContent: capture.rawContent,
            projectId: capture.projectId ?? null,
            createdAt: capture.createdAt.toISOString(),
          });

          // Emit domain event for real-time subscribers
          eventBus.emit("mc:event", { type: "capture:created", id: capture.id });

          // Fire-and-forget: trigger async enrichment after persisting
          // Response returns immediately with "raw" capture
          queueMicrotask(() => {
            enrichCapture(getInstance().db, capture.id, deviceHint).catch((err) => {
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

          return c.json({ captures: result.captures, total: result.total });
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
    .post(
      "/captures/import/capacities",
      (c) => {
        try {
          let capacitiesConfig = {
            backupDir: "~/Capacities_backup",
            scheduleId: "Schedule #1 (829272da)",
          };

          try {
            const config = loadConfig();
            if (config.ambientCapture?.capacities) {
              capacitiesConfig = {
                backupDir: config.ambientCapture.capacities.backupDir,
                scheduleId: config.ambientCapture.capacities.scheduleId,
              };
            }
          } catch {
            // Config not available -- use defaults
          }

          const zipPath = findLatestBackupZip(capacitiesConfig);
          if (!zipPath) {
            return c.json(
              { error: { code: "NOT_FOUND", message: "No Capacities backup ZIP found" } },
              404
            );
          }

          // Fire-and-forget: run import async
          queueMicrotask(() => {
            importCapacitiesBackup(
              getInstance().db,
              getInstance().sqlite,
              zipPath
            ).catch((err) => {
              console.error("Capacities import failed:", err);
            });
          });

          return c.json({ status: "started", zipPath }, 202);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.status as 500);
          }
          throw e;
        }
      }
    )
    .post(
      "/captures/import/tweets",
      (c) => {
        try {
          const db = getInstance().db;

          // Find captures imported from Capacities that are tweet URLs without fetched content
          const tweetPattern = "https://%x.com/%";
          const twitterPattern = "https://%twitter.com/%";

          const pendingTweets = db
            .select({ id: captures.id, rawContent: captures.rawContent })
            .from(captures)
            .where(
              and(
                eq(captures.sourceType, "capacities"),
                eq(captures.type, "link"),
                isNull(captures.linkTitle),
                drizzleSql`(${captures.rawContent} LIKE ${tweetPattern} OR ${captures.rawContent} LIKE ${twitterPattern})`
              )
            )
            .all();

          if (pendingTweets.length === 0) {
            return c.json({ status: "none_pending", count: 0 });
          }

          const urls = pendingTweets.map((t) => t.rawContent.trim());
          const idMap = new Map(pendingTweets.map((t) => [t.rawContent.trim(), t.id]));

          // Fire-and-forget: batch fetch tweet content
          queueMicrotask(() => {
            batchFetchTweets(urls).then((results) => {
              for (const r of results) {
                if (r.content) {
                  const captureId = idMap.get(r.url);
                  if (captureId) {
                    db.update(captures)
                      .set({
                        linkTitle: r.content.slice(0, 200),
                        linkDescription: r.content,
                        linkDomain: r.url.includes("twitter.com") ? "twitter.com" : "x.com",
                        updatedAt: new Date(),
                      })
                      .where(eq(captures.id, captureId))
                      .run();
                  }
                }
              }
            }).catch((err) => {
              console.error("Tweet batch fetch failed:", err);
            });
          });

          return c.json({ status: "started", count: urls.length }, 202);
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
          // CAPT-08: Archived captures intentionally remain in the search index.
          // deindexCapture is NOT called here -- this preserves searchability per CAPT-08.
          // The DELETE handler below DOES call deindexCapture (permanent removal).
          if (data.status === "archived") {
            eventBus.emit("mc:event", { type: "capture:archived", id });
          }
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
          deindexCapture(getInstance().sqlite, id);
          deleteCapture(getInstance().db, id);
          eventBus.emit("mc:event", { type: "capture:archived", id });
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
