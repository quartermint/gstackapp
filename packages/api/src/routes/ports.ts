import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createPortAllocationSchema,
  updatePortAllocationSchema,
  listPortsQuerySchema,
  portAllocationIdSchema,
  portScanIngestSchema,
  autoAllocateSchema,
} from "@mission-control/shared";
import {
  createAllocation,
  getAllocation,
  listAllocations,
  updateAllocation,
  deleteAllocation,
} from "../db/queries/port-allocations.js";
import { ingestScans } from "../db/queries/port-scans.js";
import {
  getMergedPortMap,
  detectConflicts,
  autoAllocate,
} from "../services/port-registry.js";
import { upsertMachine } from "../db/queries/machines.js";
import { AppError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";

export function createPortRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .get(
      "/ports",
      zValidator("query", listPortsQuerySchema),
      (c) => {
        try {
          const query = c.req.valid("query");
          const result = listAllocations(getInstance().db, query);
          return c.json(result);
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
    .post(
      "/ports",
      zValidator("json", createPortAllocationSchema),
      (c) => {
        try {
          const data = c.req.valid("json");
          const allocation = createAllocation(getInstance().db, data);
          return c.json({ allocation }, 201);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 400
            );
          }
          throw e;
        }
      }
    )
    .get(
      "/ports/map",
      (c) => {
        try {
          const portMap = getMergedPortMap(getInstance().db);
          return c.json({ portMap });
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
    .get(
      "/ports/conflicts",
      (c) => {
        try {
          const conflicts = detectConflicts(getInstance().db);
          return c.json({ conflicts });
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
    .post(
      "/ports/allocate",
      zValidator("json", autoAllocateSchema),
      (c) => {
        try {
          const { machineId, rangeName, serviceName, projectSlug } =
            c.req.valid("json");
          const allocation = autoAllocate(
            getInstance().db,
            machineId,
            rangeName,
            serviceName,
            projectSlug
          );
          return c.json({ allocation }, 201);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 400
            );
          }
          throw e;
        }
      }
    )
    .post(
      "/ports/scan",
      zValidator("json", portScanIngestSchema),
      (c) => {
        try {
          const { machineId, scans } = c.req.valid("json");
          // Auto-upsert machine on scan to keep lastSeenAt fresh
          try {
            upsertMachine(getInstance().db, { hostname: machineId });
          } catch {
            // Machine upsert is best-effort
          }
          const result = ingestScans(getInstance().db, machineId, scans);
          return c.json(result, 202);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 400
            );
          }
          throw e;
        }
      }
    )
    .get(
      "/ports/:id",
      zValidator("param", portAllocationIdSchema),
      (c) => {
        try {
          const { id } = c.req.valid("param");
          const allocation = getAllocation(getInstance().db, id);
          return c.json({ allocation });
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
    .patch(
      "/ports/:id",
      zValidator("param", portAllocationIdSchema),
      zValidator("json", updatePortAllocationSchema),
      (c) => {
        try {
          const { id } = c.req.valid("param");
          const data = c.req.valid("json");
          const allocation = updateAllocation(getInstance().db, id, data);
          return c.json({ allocation });
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 400
            );
          }
          throw e;
        }
      }
    )
    .delete(
      "/ports/:id",
      zValidator("param", portAllocationIdSchema),
      (c) => {
        try {
          const { id } = c.req.valid("param");
          deleteAllocation(getInstance().db, id);
          return c.body(null, 204);
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
