import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { resolve } from "node:path";
import {
  listDiscoveriesQuerySchema,
  updateDiscoveryStatusSchema,
} from "@mission-control/shared";
import { listDiscoveries } from "../db/queries/discoveries.js";
import {
  scanForDiscoveries,
  promoteDiscovery,
  dismissDiscovery,
} from "../services/discovery-scanner.js";
import { AppError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";
import type { MCConfig } from "../lib/config.js";

/**
 * Create discovery route handlers wired to a specific database instance.
 * Config is required for scan and promote operations.
 */
export function createDiscoveryRoutes(
  getInstance: () => DatabaseInstance,
  getConfig?: () => MCConfig | null
) {
  return new Hono()
    .get(
      "/discoveries",
      zValidator("query", listDiscoveriesQuerySchema),
      (c) => {
        try {
          const query = c.req.valid("query");
          const { db } = getInstance();
          const results = listDiscoveries(db, {
            status: query.status,
            host: query.host,
            limit: query.limit,
            offset: query.offset,
          });

          // Serialize timestamps for JSON response
          const serialized = results.map((d) => ({
            ...d,
            lastCommitAt: d.lastCommitAt
              ? d.lastCommitAt.toISOString()
              : null,
            discoveredAt: d.discoveredAt.toISOString(),
            updatedAt: d.updatedAt.toISOString(),
          }));

          return c.json({ discoveries: serialized });
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
    .patch(
      "/discoveries/:id",
      zValidator("json", updateDiscoveryStatusSchema),
      async (c) => {
        try {
          const id = c.req.param("id");
          const body = c.req.valid("json");
          const { db } = getInstance();
          const config = getConfig?.();

          if (body.status === "tracked") {
            if (!config) {
              return c.json(
                {
                  error: {
                    code: "INTERNAL_ERROR",
                    message: "Config not loaded — cannot promote discovery",
                  },
                },
                500
              );
            }

            const configPath =
              process.env["MC_CONFIG_PATH"] ??
              resolve(process.cwd(), "mc.config.json");

            await promoteDiscovery(id, db, config, configPath);
          } else if (body.status === "dismissed") {
            dismissDiscovery(id, db);
          }

          return c.json({ message: `Discovery ${body.status}` });
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 404
            );
          }
          if (e instanceof Error && e.message.includes("already")) {
            return c.json(
              {
                error: {
                  code: "VALIDATION_ERROR",
                  message: e.message,
                },
              },
              400
            );
          }
          throw e;
        }
      }
    )
    .post("/discoveries/scan", async (c) => {
      const config = getConfig?.();
      if (!config) {
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Config not loaded — cannot scan for discoveries",
            },
          },
          500
        );
      }

      const { db } = getInstance();
      // Run scan asynchronously — don't block the response
      scanForDiscoveries(config, db).catch((err) =>
        console.error("Manual discovery scan failed:", err)
      );

      return c.json({ message: "Discovery scan initiated" }, 202);
    });
}
