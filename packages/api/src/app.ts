import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoutes } from "./routes/health.js";
import { createCaptureRoutes } from "./routes/captures.js";
import { createSearchRoutes } from "./routes/search.js";
import { AppError } from "./lib/errors.js";
import { getDatabase, type DatabaseInstance } from "./db/index.js";

/**
 * Create a Hono app wired to a specific database instance.
 * Used by tests (in-memory db) and production (file db).
 */
export function createApp(instance?: DatabaseInstance): Hono {
  const getInstance = () => instance ?? getDatabase();

  const app = new Hono();

  // Middleware
  app.use("*", logger());
  app.use("/api/*", cors());

  // Routes
  app.route("/api", healthRoutes);
  app.route("/api", createCaptureRoutes(getInstance));
  app.route("/api", createSearchRoutes(getInstance));

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
