import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, join } from "node:path";
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
import { createSessionRoutes } from "./routes/sessions.js";
import { createModelRoutes } from "./routes/models.js";
import { createBudgetRoutes } from "./routes/budget.js";
import { createDiscoveryRoutes } from "./routes/discoveries.js";
import { createStarRoutes } from "./routes/stars.js";
import { createKnowledgeRoutes } from "./routes/knowledge.js";
import { createVisitRoutes } from "./routes/visits.js";
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
    .route("/api", createSprintTimelineRoutes(getInstance))
    .route("/api", createSessionRoutes(getInstance, () => config ?? null))
    .route("/api", createModelRoutes())
    .route("/api", createBudgetRoutes(getInstance, () => config ?? null))
    .route("/api", createDiscoveryRoutes(getInstance, () => config ?? null))
    .route("/api", createStarRoutes(getInstance, () => config ?? null))
    .route("/api", createKnowledgeRoutes(getInstance, () => config ?? null))
    .route("/api", createVisitRoutes(getInstance));

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

  // Production: serve built web assets from packages/web/dist/
  if (process.env["NODE_ENV"] === "production") {
    const distDir = resolve(process.cwd(), "packages/web/dist");

    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    };

    app.get("*", (c) => {
      // Try to serve the exact file
      const urlPath = new URL(c.req.url).pathname;
      const filePath = join(distDir, urlPath === "/" ? "index.html" : urlPath);

      if (existsSync(filePath) && !filePath.includes("..")) {
        const ext = extname(filePath);
        const mime = mimeTypes[ext] ?? "application/octet-stream";
        const content = readFileSync(filePath);
        return c.body(content, 200, { "Content-Type": mime });
      }

      // SPA fallback: serve index.html for client-side routes
      const indexPath = join(distDir, "index.html");
      const html = readFileSync(indexPath, "utf-8");
      return c.html(html);
    });
  }

  return app;
}

// Default app for production (lazy-init database on first request)
const app = createApp();

export { app };
export type AppType = typeof app;
