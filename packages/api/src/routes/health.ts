import { Hono } from "hono";
import { getSystemHealth } from "../services/health-monitor.js";
import type { MCConfig } from "../lib/config.js";

/**
 * Create health route handlers.
 * The /health/system endpoint uses config for service port checks.
 */
export function createHealthRoutes(getConfig: () => MCConfig | null) {
  return new Hono()
    .get("/health/system", async (c) => {
      const config = getConfig();
      const serviceList = config?.services ?? [];
      const health = await getSystemHealth(serviceList);

      // Compute overall status
      let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
      if (serviceList.length > 0) {
        const upCount = health.services.filter((s) => s.status === "up").length;
        if (upCount === 0) {
          overallStatus = "unhealthy";
        } else if (upCount < serviceList.length) {
          overallStatus = "degraded";
        }
      }

      return c.json({ ...health, overallStatus });
    })
    .get("/health", (c) => {
      return c.json({
        status: "ok" as const,
        timestamp: Date.now(),
        version: "0.1.0",
      });
    });
}

/**
 * Legacy export for backward compatibility with existing tests.
 * Simple health route without config dependency.
 */
export const healthRoutes = new Hono().get("/health", (c) => {
  return c.json({
    status: "ok" as const,
    timestamp: Date.now(),
    version: "0.1.0",
  });
});
