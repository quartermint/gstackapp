import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

// Mock node-cron
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn((_expr: string, _fn: () => void) => ({
      stop: vi.fn(),
    })),
  },
}));

// Mock the ai package
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn(({ schema }: { schema: unknown }) => ({
      type: "object",
      schema,
    })),
  },
}));

// Mock LM Studio service
vi.mock("../../services/lm-studio.js", () => ({
  getLmStudioStatus: vi.fn(() => ({
    health: "unavailable",
    modelId: null,
    lastChecked: new Date(),
  })),
  createLmStudioProvider: vi.fn(() => vi.fn(() => "mocked-lm-studio-model")),
}));

// Mock embedding service
vi.mock("../../services/embedding.js", () => ({
  computeContentHash: vi.fn((text: string) => `hash-${text.length}`),
}));

// Mock event-bus
vi.mock("../../services/event-bus.js", () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

import { startIntelligenceDaemon } from "../../services/intelligence-daemon.js";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";

// ── startIntelligenceDaemon ──────────────────────────────────

describe("startIntelligenceDaemon", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
    instance.sqlite.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a stop function", () => {
    const daemon = startIntelligenceDaemon(instance.db);
    expect(daemon).toHaveProperty("stop");
    expect(typeof daemon.stop).toBe("function");
    daemon.stop();
  });

  it("calling stop cleans up timers and cron jobs", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    const daemon = startIntelligenceDaemon(instance.db);
    daemon.stop();

    // Should have cleared at least the narrative refresh and cache cleanup intervals
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("accepts custom config overrides", () => {
    const daemon = startIntelligenceDaemon(instance.db, {
      digestCron: "30 7 * * *",
      narrativeRefreshIntervalMs: 60_000,
      cacheCleanupIntervalMs: 120_000,
      initialNarrativeCount: 3,
    });

    expect(daemon).toHaveProperty("stop");
    daemon.stop();
  });

  it("schedules narrative refresh on interval", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    const daemon = startIntelligenceDaemon(instance.db, {
      narrativeRefreshIntervalMs: 15 * 60_000,
    });

    // Should have called setInterval for narrative refresh + cache cleanup
    expect(setIntervalSpy).toHaveBeenCalled();

    daemon.stop();
    setIntervalSpy.mockRestore();
  });
});
