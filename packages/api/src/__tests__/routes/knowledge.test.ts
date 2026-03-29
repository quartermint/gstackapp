import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import { createApp } from "../../app.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { MCConfig } from "../../lib/config.js";
import type { Hono } from "hono";
import { upsertKnowledge } from "../../db/queries/knowledge.js";

const testConfig: MCConfig = {
  projects: [
    {
      name: "Mission Control",
      slug: "mission-control",
      path: "/Users/ryanstern/mission-control",
      host: "local",
      dependsOn: ["openefb", "nexusclaw"],
      conventionOverrides: [],
    },
    {
      name: "OpenEFB",
      slug: "openefb",
      path: "/Users/ryanstern/openefb",
      host: "local",
      dependsOn: [],
      conventionOverrides: [],
    },
    {
      name: "NexusClaw",
      slug: "nexusclaw",
      path: "/Users/ryanstern/nexusclaw",
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
  budgetThresholds: { weeklyOpusHot: 20, weeklyOpusModerate: 10, weekResetDay: 5 },
  lmStudio: { url: "http://100.x.x.x:1234", targetModel: "qwen3-coder", probeIntervalMs: 30000 },
  discovery: { paths: ["~"], scanIntervalMinutes: 60, githubOrgs: ["quartermint", "sternryan"], starSyncIntervalHours: 6, sshEnabled: true },
  conventions: [],
  ambientCapture: {},
  users: [],
};

describe("Knowledge Routes", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("GET /api/knowledge", () => {
    it("returns empty list when no knowledge records exist", async () => {
      const res = await app.request("/api/knowledge");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.knowledge).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns list of knowledge records without content field", async () => {
      // Seed knowledge records
      upsertKnowledge(instance.sqlite, {
        projectSlug: "mission-control",
        content: "# Mission Control\n\nFull content here.",
        contentHash: "hash1",
        fileSize: 40,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 0,
      });

      upsertKnowledge(instance.sqlite, {
        projectSlug: "openefb",
        content: "# OpenEFB\n\nFlight bag docs.",
        contentHash: "hash2",
        fileSize: 28,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 5,
      });

      const res = await app.request("/api/knowledge");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.total).toBe(2);
      expect(body.knowledge.length).toBe(2);

      // Verify no content field in list items
      for (const item of body.knowledge) {
        expect(item.projectSlug).toBeTruthy();
        expect(item.contentHash).toBeTruthy();
        expect(typeof item.fileSize).toBe("number");
        expect(typeof item.stalenessScore).toBe("number");
        expect(item.content).toBeUndefined();
      }
    });
  });

  describe("GET /api/knowledge/:slug", () => {
    it("returns 404 for unknown slug", async () => {
      const res = await app.request("/api/knowledge/nonexistent");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns full knowledge record with content and stalenessScore", async () => {
      const res = await app.request("/api/knowledge/mission-control");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.projectSlug).toBe("mission-control");
      expect(body.content).toBeTruthy();
      expect(body.contentHash).toBe("hash1");
      expect(typeof body.fileSize).toBe("number");
      expect(typeof body.stalenessScore).toBe("number");
      expect(typeof body.commitsSinceUpdate).toBe("number");
      expect(body.lastModified).toBeTruthy();
      expect(body.lastScannedAt).toBeTruthy();
    });

    it("returns stalenessScore of 100 for freshly updated knowledge", async () => {
      // Seed with today's date and 0 commits
      upsertKnowledge(instance.sqlite, {
        projectSlug: "fresh-project",
        content: "# Fresh\n\nJust updated.",
        contentHash: "fresh-hash",
        fileSize: 25,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 0,
      });

      const res = await app.request("/api/knowledge/fresh-project");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stalenessScore).toBe(100);
    });

    it("returns decreased stalenessScore for old knowledge with many commits", async () => {
      // Seed with date 60 days ago and 30 commits since update
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      upsertKnowledge(instance.sqlite, {
        projectSlug: "stale-project",
        content: "# Stale\n\nOld content.",
        contentHash: "stale-hash",
        fileSize: 22,
        lastModified: sixtyDaysAgo.toISOString(),
        commitsSinceUpdate: 30,
      });

      const res = await app.request("/api/knowledge/stale-project");
      expect(res.status).toBe(200);

      const body = await res.json();
      // 60 days = 33.3% age score (100 - (60/90)*100 = 33.3), weight 0.6 = 20
      // 30 commits = 40% commit score (100 - (30/50)*100 = 40), weight 0.4 = 16
      // Total = ~36
      expect(body.stalenessScore).toBeLessThan(50);
      expect(body.stalenessScore).toBeGreaterThan(0);
    });
  });

  describe("GET /api/knowledge/search", () => {
    beforeAll(() => {
      // Seed additional knowledge for search tests
      upsertKnowledge(instance.sqlite, {
        projectSlug: "search-project-alpha",
        content:
          "# Alpha Project\n\nThis is the Alpha project for Mission Control integration testing.",
        contentHash: "search-hash-alpha",
        fileSize: 75,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 2,
      });

      upsertKnowledge(instance.sqlite, {
        projectSlug: "search-project-beta",
        content:
          "# Beta Project\n\nBeta handles flight planning and navigation features.",
        contentHash: "search-hash-beta",
        fileSize: 68,
        lastModified: new Date().toISOString(),
        commitsSinceUpdate: 10,
      });
    });

    it("returns results matching query with snippet", async () => {
      const res = await app.request("/api/knowledge/search?q=Mission");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results.length).toBeGreaterThan(0);
      expect(body.total).toBeGreaterThan(0);

      // mission-control was seeded earlier, should match
      const mcResult = body.results.find(
        (r: { projectSlug: string }) =>
          r.projectSlug === "mission-control" ||
          r.projectSlug === "search-project-alpha"
      );
      expect(mcResult).toBeTruthy();
      expect(mcResult.snippet).toBeTruthy();
    });

    it("returns empty results when q param is missing", async () => {
      const res = await app.request("/api/knowledge/search");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns empty results when q is too short (1 char)", async () => {
      const res = await app.request("/api/knowledge/search?q=x");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns empty results for nonexistent query", async () => {
      const res = await app.request(
        "/api/knowledge/search?q=zzzznonexistentzzzz"
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("search is case-insensitive", async () => {
      const resLower = await app.request("/api/knowledge/search?q=mission");
      const resUpper = await app.request("/api/knowledge/search?q=MISSION");

      const bodyLower = await resLower.json();
      const bodyUpper = await resUpper.json();

      expect(bodyLower.results.length).toBe(bodyUpper.results.length);
      expect(bodyLower.results.length).toBeGreaterThan(0);
    });

    it("each result contains projectSlug, snippet, fileSize, stalenessScore", async () => {
      const res = await app.request("/api/knowledge/search?q=Alpha");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.results.length).toBeGreaterThan(0);

      const result = body.results[0];
      expect(result.projectSlug).toBeTruthy();
      expect(typeof result.snippet).toBe("string");
      expect(typeof result.fileSize).toBe("number");
      expect(typeof result.stalenessScore).toBe("number");
    });
  });
});

describe("GET /api/knowledge/digest", () => {
  let instance: DatabaseInstance;
  let digestApp: ReturnType<typeof createApp>;

  beforeAll(() => {
    instance = createTestDb();
    digestApp = createApp(instance, testConfig);

    // Seed knowledge records
    upsertKnowledge(instance.sqlite, {
      projectSlug: "mission-control",
      content: "# Mission Control\n\nFull content here.",
      contentHash: "digest-hash1",
      fileSize: 40,
      lastModified: new Date().toISOString(),
      commitsSinceUpdate: 0,
    });

    // Seed convention_violation health findings for mission-control
    const now = new Date().toISOString();
    instance.sqlite
      .prepare(
        `INSERT INTO project_health (project_slug, check_type, severity, detail, metadata, detected_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("mission-control", "convention_violation", "info", "Uses any type", null, now);
    instance.sqlite
      .prepare(
        `INSERT INTO project_health (project_slug, check_type, severity, detail, metadata, detected_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("mission-control", "convention_violation", "warning", "Missing error handling", null, now);

    // Seed a non-convention finding (should not be counted)
    instance.sqlite
      .prepare(
        `INSERT INTO project_health (project_slug, check_type, severity, detail, metadata, detected_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("mission-control", "unpushed_changes", "warning", "3 commits ahead", null, now);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("returns 400 when cwd is missing", async () => {
    const res = await digestApp.request("/api/knowledge/digest");
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("returns empty digest for unknown cwd path", async () => {
    const res = await digestApp.request("/api/knowledge/digest?cwd=/unknown/path");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.relatedProjects).toEqual([]);
    expect(body.violations).toBe(0);
    expect(body.staleKnowledge).toBe(false);
  });

  it("returns digest with relatedProjects from dependsOn", async () => {
    const res = await digestApp.request(
      "/api/knowledge/digest?cwd=/Users/ryanstern/mission-control"
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.slug).toBe("mission-control");
    expect(body.relatedProjects).toEqual(["openefb", "nexusclaw"]);
  });

  it("returns violation count matching convention_violation findings", async () => {
    const res = await digestApp.request(
      "/api/knowledge/digest?cwd=/Users/ryanstern/mission-control"
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    // 2 convention_violation findings, not the unpushed_changes one
    expect(body.violations).toBe(2);
  });

  it("returns staleKnowledge=false for fresh knowledge (stalenessScore >= 50)", async () => {
    const res = await digestApp.request(
      "/api/knowledge/digest?cwd=/Users/ryanstern/mission-control"
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    // Fresh knowledge (just inserted), score should be 100
    expect(body.staleKnowledge).toBe(false);
    expect(body.stalenessScore).toBe(100);
  });

  it("returns staleKnowledge=true when stalenessScore < 50", async () => {
    // Create a separate instance with stale knowledge
    const staleInstance = createTestDb();
    const staleApp = createApp(staleInstance, testConfig);

    // Seed stale knowledge (90 days old, 40 commits)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    upsertKnowledge(staleInstance.sqlite, {
      projectSlug: "mission-control",
      content: "# Old content",
      contentHash: "stale-hash",
      fileSize: 15,
      lastModified: ninetyDaysAgo.toISOString(),
      commitsSinceUpdate: 40,
    });

    const res = await staleApp.request(
      "/api/knowledge/digest?cwd=/Users/ryanstern/mission-control"
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.staleKnowledge).toBe(true);
    expect(body.stalenessScore).toBeLessThan(50);

    staleInstance.sqlite.close();
  });

  it("returns empty relatedProjects for project with no dependsOn", async () => {
    const res = await digestApp.request(
      "/api/knowledge/digest?cwd=/Users/ryanstern/openefb"
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.slug).toBe("openefb");
    expect(body.relatedProjects).toEqual([]);
  });
});
