import { createOpenAI } from "@ai-sdk/openai";
import type { LmStudioConfig } from "../lib/config.js";

export type LmStudioHealth = "unavailable" | "loading" | "ready";

export interface LmStudioStatus {
  health: LmStudioHealth;
  modelId: string | null;
  lastChecked: Date;
}

/** Module-level cached status (same pattern as project-scanner background poll). */
let cachedStatus: LmStudioStatus = {
  health: "unavailable",
  modelId: null,
  lastChecked: new Date(),
};

const DEFAULT_URL = "http://100.123.8.125:1234";
const DEFAULT_TARGET = "qwen3-coder";
const TIMEOUT_MS = 5000;

interface LmStudioModel {
  id: string;
  state?: string;
}

interface LmStudioModelsResponse {
  data?: LmStudioModel[];
}

/**
 * Probe LM Studio's /v1/models endpoint for model availability.
 * Derives three-state health: unavailable | loading | ready.
 *
 * - Connection error / timeout => "unavailable"
 * - API up but target model not found => "loading" (modelId: null)
 * - Target model found but state !== "loaded" => "loading" (modelId set)
 * - Target model found with state "loaded" => "ready" (modelId set)
 */
export async function probeLmStudio(
  config?: LmStudioConfig
): Promise<LmStudioStatus> {
  const url = config?.url ?? DEFAULT_URL;
  const targetModel = config?.targetModel ?? DEFAULT_TARGET;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${url}/v1/models`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const body = (await response.json()) as LmStudioModelsResponse;
    const models = body.data ?? [];

    // Find target model via partial match (case-insensitive)
    const target = models.find((m) =>
      m.id.toLowerCase().includes(targetModel.toLowerCase())
    );

    let health: LmStudioHealth;
    let modelId: string | null = null;

    if (!target) {
      // API is up but target model not loaded
      health = "loading";
    } else {
      modelId = target.id;
      health = target.state === "loaded" ? "ready" : "loading";
    }

    cachedStatus = {
      health,
      modelId,
      lastChecked: new Date(),
    };

    return cachedStatus;
  } catch {
    // Connection refused, timeout, parse error -- all become "unavailable"
    cachedStatus = {
      health: "unavailable",
      modelId: null,
      lastChecked: new Date(),
    };

    return cachedStatus;
  }
}

/**
 * Get the cached LM Studio status without making a network call.
 * Zero-latency for use in route handlers.
 */
export function getLmStudioStatus(): LmStudioStatus {
  return cachedStatus;
}

/**
 * Create an AI SDK provider pointing to LM Studio's OpenAI-compatible API.
 * Used by query expansion and embedding services.
 */
export function createLmStudioProvider(baseURL: string = DEFAULT_URL) {
  return createOpenAI({
    baseURL: `${baseURL}/v1`,
    apiKey: "lm-studio", // LM Studio ignores API key but field is required
  });
}

/**
 * Start background probe that polls LM Studio on an interval.
 * Runs immediately on first call, then repeats at intervalMs.
 * Returns the interval handle for cleanup.
 */
export function startLmStudioProbe(
  intervalMs: number = 30_000,
  config?: LmStudioConfig
): ReturnType<typeof setInterval> {
  // Run immediately
  void probeLmStudio(config);

  // Then on interval
  return setInterval(() => {
    void probeLmStudio(config);
  }, intervalMs);
}
