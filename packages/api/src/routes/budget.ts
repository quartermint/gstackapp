import { Hono } from "hono";
import { getWeeklyBudget, suggestTier } from "../services/budget-service.js";
import { getLmStudioStatus } from "../services/lm-studio.js";
import type { DatabaseInstance } from "../db/index.js";
import type { MCConfig } from "../lib/config.js";

/**
 * Create budget route handlers.
 * GET /budget returns weekly session counts by tier with burn rate and suggestion.
 */
export function createBudgetRoutes(
  getInstance: () => DatabaseInstance,
  getConfig: () => MCConfig | null
) {
  return new Hono().get("/budget", (c) => {
    const db = getInstance().db;
    const config = getConfig();
    const thresholds = config?.budgetThresholds ?? {
      weeklyOpusHot: 20,
      weeklyOpusModerate: 10,
      weekResetDay: 5,
    };

    const budget = getWeeklyBudget(db, thresholds);
    const lmStatus = getLmStudioStatus();
    const localAvailable = lmStatus.health === "ready";
    const suggestion = suggestTier(null, budget.burnRate, localAvailable);

    return c.json({ budget, suggestion });
  });
}
