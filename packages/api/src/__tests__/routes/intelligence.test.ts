import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// Mock the narrative generator before importing app
vi.mock("../../services/narrative-generator.js", () => ({
  getNarrative: vi.fn(() => null),
  narrativeSchema: {} as unknown,
}));

import { createTestDb } from "../helpers/setup.js";
import { createApp } from "../../app.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { MCConfig } from "../../lib/config.js";
import { getNarrative } from "../../services/narrative-generator.js";
import type { ProjectNarrative } from "../../services/narrative-generator.js";

const mockGetNarrative = vi.mocked(getNarrative);

const testConfig: MCConfig = {
  projects: [
    {
      name: "Test Project",
      slug: "test-project",
      path: "/test/project",
      host: "local",
      dependsOn: [],
      conventionOverrides: [],
    },
  ],
  dataDir: "./data",
  services: [],
  macMiniSshHost: "test-host",
  modelTiers: [
    { pattern: "^claude-opus", tier: "opus" },
    { pattern: "^claude-sonnet", tier: "sonnet" },
  ],
  budgetThresholds: {
    weeklyOpusHot: 20,
    weeklyOpusModerate: 10,
    weekResetDay: 5,
  },
  lmStudio: {
    url: "http://100.123.8.125:1234",
    targetModel: "qwen3-coder",
    probeIntervalMs: 30000,
  },
  discovery: { paths: ["~"], scanIntervalMinutes: 60, githubOrgs: ["quartermint", "vanboompow"], starSyncIntervalHours: 6 },
  conventions: [],
  ambientCapture: {},
};

describe("Intelligence API", () => {
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
  });

  // ── GET /api/intelligence/:slug/narrative ──────────────────────

  describe("GET /api/intelligence/:slug/narrative", () => {
    it("returns 200 with { narrative: null } on cache miss", async () => {
      mockGetNarrative.mockReturnValue(null);

      const res = await app.request("/api/intelligence/test-project/narrative");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({ narrative: null });
    });

    it("returns cached narrative as JSON when cache has data", async () => {
      const mockNarrative: ProjectNarrative = {
        summary: "Recent auth work on the project.",
        highlights: ["Added JWT rotation", "Fixed session bug"],
        openThreads: ["3 dirty files in src/"],
        suggestedFocus: "Complete middleware refactor",
      };

      mockGetNarrative.mockReturnValue(mockNarrative);

      const res = await app.request("/api/intelligence/test-project/narrative");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.narrative).toEqual(mockNarrative);
    });

    it("validates slug parameter is non-empty", async () => {
      // The route pattern requires a slug parameter, so empty slug returns 404
      const res = await app.request("/api/intelligence//narrative");
      expect(res.status).toBe(404);
    });
  });
});
