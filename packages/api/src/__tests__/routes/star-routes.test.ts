import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";
import { upsertStar, updateStarIntent } from "../../db/queries/stars.js";

/** Helper to insert a star for testing. */
function insertStar(
  db: DatabaseInstance["db"],
  overrides: Partial<{
    githubId: number;
    fullName: string;
    description: string | null;
    language: string | null;
    topics: string[];
    htmlUrl: string;
    starredAt: Date;
  }> = {}
) {
  const githubId = overrides.githubId ?? Math.floor(Math.random() * 1_000_000);
  return upsertStar(db, {
    githubId,
    fullName: overrides.fullName ?? `owner/repo-${githubId}`,
    description: overrides.description ?? "A test repository",
    language: overrides.language ?? "TypeScript",
    topics: overrides.topics ?? ["test"],
    htmlUrl: overrides.htmlUrl ?? `https://github.com/owner/repo-${githubId}`,
    starredAt: overrides.starredAt ?? new Date("2026-03-15T12:00:00Z"),
  });
}

describe("star routes", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  beforeAll(() => {
    instance = createTestDb();
    app = createTestApp(instance);
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  describe("GET /api/stars", () => {
    it("returns empty list when no stars exist", async () => {
      // Use a fresh DB for this test
      const freshInstance = createTestDb();
      const freshApp = createTestApp(freshInstance);

      const res = await freshApp.request("/api/stars");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stars).toEqual([]);
      expect(body.total).toBe(0);

      freshInstance.sqlite.close();
    });

    it("returns stars after insert", async () => {
      insertStar(instance.db, { githubId: 1001, fullName: "test/alpha", language: "TypeScript" });
      insertStar(instance.db, { githubId: 1002, fullName: "test/beta", language: "Rust" });
      insertStar(instance.db, { githubId: 1003, fullName: "test/gamma", language: "Go" });

      const res = await app.request("/api/stars");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stars.length).toBe(3);
      expect(body.total).toBe(3);
    });

    it("filters by intent", async () => {
      updateStarIntent(instance.db, 1001, "tool");
      updateStarIntent(instance.db, 1002, "reference");

      const res = await app.request("/api/stars?intent=tool");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stars.length).toBe(1);
      expect(body.stars[0].fullName).toBe("test/alpha");
      expect(body.stars[0].intent).toBe("tool");
    });

    it("filters by language", async () => {
      const res = await app.request("/api/stars?language=Rust");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stars.length).toBe(1);
      expect(body.stars[0].fullName).toBe("test/beta");
    });

    it("filters by search term (fullName/description)", async () => {
      const res = await app.request("/api/stars?search=alpha");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stars.length).toBe(1);
      expect(body.stars[0].fullName).toBe("test/alpha");
    });

    it("supports pagination with limit and offset", async () => {
      const res = await app.request("/api/stars?limit=2&offset=0");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stars.length).toBe(2);
      expect(body.total).toBe(3); // total count is still 3
    });
  });

  describe("GET /api/stars/:githubId", () => {
    it("returns a star by githubId", async () => {
      const res = await app.request("/api/stars/1001");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.star).toBeDefined();
      expect(body.star.githubId).toBe(1001);
      expect(body.star.fullName).toBe("test/alpha");
    });

    it("returns 404 for non-existent githubId", async () => {
      const res = await app.request("/api/stars/999999");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PATCH /api/stars/:githubId/intent", () => {
    it("updates intent and sets userOverride=true, aiConfidence=null", async () => {
      // Insert a fresh star
      insertStar(instance.db, { githubId: 2001, fullName: "test/intent-test" });

      const res = await app.request("/api/stars/2001/intent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "reference" }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.star.intent).toBe("reference");
      expect(body.star.userOverride).toBe(true);
      expect(body.star.aiConfidence).toBeNull();
    });

    it("returns 400 for invalid intent value", async () => {
      const res = await app.request("/api/stars/2001/intent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "invalid" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent star", async () => {
      const res = await app.request("/api/stars/888888/intent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "tool" }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/stars/sync", () => {
    it("triggers sync (returns error in test env without gh CLI)", { timeout: 15000 }, async () => {
      // In test env, gh CLI is not available, so sync will skip (rate limit returns 0)
      // OR fail gracefully. Either way, it should return 200 with a result object.
      const res = await app.request("/api/stars/sync", { method: "POST" });
      expect(res.status).toBe(200);

      const body = await res.json();
      // syncStars returns { synced, skipped, total }
      expect(typeof body.synced).toBe("number");
      expect(typeof body.total).toBe("number");
    });
  });
});
