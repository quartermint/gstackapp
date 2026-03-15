import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createHealthRoutes } from "./routes/health.js";
import { createCaptureRoutes } from "./routes/captures.js";
import { createSearchRoutes } from "./routes/search.js";
import { createProjectRoutes } from "./routes/projects.js";
import { createEnrichmentRoutes } from "./routes/enrichment.js";
import { eventRoutes } from "./routes/events.js";
import { createHeatmapRoutes } from "./routes/heatmap.js";
import { createPortRoutes } from "./routes/ports.js";
import { createMachineRoutes } from "./routes/machines.js";
import { createHealthCheckRoutes } from "./routes/health-checks.js";
import { createRiskRoutes } from "./routes/risks.js";
import { createCopyRoutes } from "./routes/copies.js";
import { createSprintTimelineRoutes } from "./routes/sprint-timeline.js";
import { AppError } from "./lib/errors.js";
import { getDatabase, type DatabaseInstance } from "./db/index.js";
import type { MCConfig } from "./lib/config.js";

/**
 * Create a Hono app wired to a specific database instance.
 * Used by tests (in-memory db) and production (file db).
 * Optional config enables project scanning routes.
 *
 * Route registration uses method chaining so TypeScript preserves
 * the full route type graph. This is required for the Hono RPC
 * client (`hc<AppType>`) to produce typed methods instead of `unknown`.
 */
export function createApp(instance?: DatabaseInstance, config?: MCConfig | null) {
  const getInstance = () => instance ?? getDatabase();

  const app = new Hono()
    .route("/api", createHealthRoutes(() => config ?? null))
    .route("/api", createCaptureRoutes(getInstance))
    .route("/api", createSearchRoutes(getInstance))
    .route("/api", createProjectRoutes(getInstance, () => config ?? null))
    .route("/api", createEnrichmentRoutes(getInstance))
    .route("/api", eventRoutes)
    .route("/api", createHeatmapRoutes(getInstance))
    .route("/api", createPortRoutes(getInstance))
    .route("/api", createMachineRoutes(getInstance))
    .route("/api", createHealthCheckRoutes(getInstance))
    .route("/api", createRiskRoutes(getInstance))
    .route("/api", createCopyRoutes(getInstance))
    .route("/api", createSprintTimelineRoutes(getInstance));

  // Middleware (applied after route chaining to keep route types intact)
  app.use("*", logger());
  app.use("/api/*", cors());

  // Global error handler
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.status as 500
      );
    }
    console.error("Unhandled error:", err);
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      500
    );
  });

  return app;
}

// Default app for production (lazy-init database on first request)
const app = createApp();

export { app };
export type AppType = typeof app;
