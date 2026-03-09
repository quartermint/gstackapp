import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("/api/*", cors());

// Health check
app.get("/api/health", (c) => {
  return c.json({
    status: "ok" as const,
    timestamp: Date.now(),
    version: "0.1.0",
  });
});

export { app };
export type AppType = typeof app;
