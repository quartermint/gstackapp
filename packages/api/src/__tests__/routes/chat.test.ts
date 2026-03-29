import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// Mock LM Studio status before importing app
vi.mock("../../services/lm-studio.js", () => ({
  getLmStudioStatus: vi.fn(() => ({
    health: "unavailable" as const,
    modelId: null,
    lastChecked: new Date(),
  })),
  createLmStudioProvider: vi.fn(),
  probeLmStudio: vi.fn(),
  startLmStudioProbe: vi.fn(),
}));

import { createTestDb } from "../helpers/setup.js";
import { createApp } from "../../app.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { MCConfig } from "../../lib/config.js";
import { getLmStudioStatus } from "../../services/lm-studio.js";

const mockGetLmStudioStatus = vi.mocked(getLmStudioStatus);

const testConfig: MCConfig = {
  projects: [],
  dataDir: "./data",
  services: [],
  macMiniSshHost: "test-host",
  modelTiers: [],
  budgetThresholds: {
    weeklyOpusHot: 20,
    weeklyOpusModerate: 10,
    weekResetDay: 5,
  },
  lmStudio: {
    url: "http://100.x.x.x:1234",
    targetModel: "qwen3-coder",
    probeIntervalMs: 30000,
  },
  discovery: {
    paths: ["~"],
    scanIntervalMinutes: 60,
    githubOrgs: ["quartermint", "sternryan"],
    starSyncIntervalHours: 6, sshEnabled: true,
  },
  conventions: [],
  ambientCapture: {},
  users: [
    { id: "ryan", displayName: "Ryan", role: "owner" },
    { id: "bella", displayName: "Bella", role: "member", tailscaleLogin: "bella@example.com" },
  ],
};

describe("Chat API", () => {
  let instance: DatabaseInstance;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    instance = createTestDb();
    app = createApp(instance, testConfig);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: LM Studio unavailable
    mockGetLmStudioStatus.mockReturnValue({
      health: "unavailable",
      modelId: null,
      lastChecked: new Date(),
    });
  });

  // ── POST /api/chat ────────────────────────────────────────────

  describe("POST /api/chat", () => {
    it("returns 400 when messages is missing", async () => {
      const res = await app.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 when messages is empty array", async () => {
      const res = await app.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("returns 503 when LM Studio is unavailable", async () => {
      mockGetLmStudioStatus.mockReturnValue({
        health: "unavailable",
        modelId: null,
        lastChecked: new Date(),
      });

      const res = await app.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "What is Ryan working on?" }],
        }),
      });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("LLM_UNAVAILABLE");
    });

    it("returns 503 when LM Studio is loading", async () => {
      mockGetLmStudioStatus.mockReturnValue({
        health: "loading",
        modelId: null,
        lastChecked: new Date(),
      });

      const res = await app.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe("LLM_UNAVAILABLE");
    });
  });
});
