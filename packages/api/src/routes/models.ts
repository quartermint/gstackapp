import { Hono } from "hono";
import { getLmStudioStatus } from "../services/lm-studio.js";

/**
 * Create model route handlers.
 * GET /models returns cached LM Studio health status (no dependencies).
 */
export function createModelRoutes() {
  return new Hono().get("/models", (c) => {
    const status = getLmStudioStatus();
    return c.json({
      lmStudio: {
        health: status.health,
        modelId: status.modelId,
        lastChecked: status.lastChecked.toISOString(),
      },
    });
  });
}
