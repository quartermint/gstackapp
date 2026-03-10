import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoutes } from "./routes/health.js";
import { createCaptureRoutes } from "./routes/captures.js";
import { createSearchRoutes } from "./routes/search.js";
import { createProjectRoutes } from "./routes/projects.js";
import { createEnrichmentRoutes } from "./routes/enrichment.js";
import { eventRoutes } from "./routes/events.js";
import { createHeatmapRoutes } from "./routes/heatmap.js";
import { AppError } from "./lib/errors.js";
import { getDatabase, type DatabaseInstance } from "./db/index.js";
import type { MCConfig } from "./lib/config.js";

/**
 * Create a Hono app wired to a specific database instance.
 * Used by tests (in-memory db) and production (file db).
 * Optional config enables project scanning routes.
 */
export function createApp(instance?: DatabaseInstance, config?: MCConfig | null): Hono {
  const getInstance = () => instance ?? getDatabase();

  const app = new Hono();

  // Middleware
  app.use("*", logger());
  app.use("/api/*", cors());

  // Routes
  app.route("/api", healthRoutes);
  app.route("/api", createCaptureRoutes(getInstance));
  app.route("/api", createSearchRoutes(getInstance));
  app.route("/api", createProjectRoutes(getInstance, () => config ?? null));
  app.route("/api", createEnrichmentRoutes(getInstance));
  app.route("/api", eventRoutes);
  app.route("/api", createHeatmapRoutes(getInstance));

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
