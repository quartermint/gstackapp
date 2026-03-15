import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, createTestApp } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import type { Hono } from "hono";

describe("Copies API", () => {
  let instance: DatabaseInstance;
  let app: Hono;

  describe("GET /api/copies (empty state)", () => {
    beforeAll(() => {
      instance = createTestDb();
      app = createTestApp(instance);
    });

    afterAll(() => {
      instance.sqlite.close();
    });

    it("returns 200 with empty copies and total 0", async () => {
      const res = await app.request("/api/copies");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.copies).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe("GET /api/copies (with data)", () => {
    beforeAll(() => {
      instance = createTestDb();
      app = createTestApp(instance);

      const now = new Date().toISOString();
      const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

      // Fresh copy (not stale)
      instance.sqlite
        .prepare(
          `INSERT INTO project_copies (project_slug, host, path, remote_url, head_commit, branch, last_checked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run("proj-a", "local", "/Users/me/proj-a", "github.com/me/proj-a", "abc1234", "main", now);

      // Stale copy (1 hour old)
      instance.sqlite
        .prepare(
          `INSERT INTO project_copies (project_slug, host, path, remote_url, head_commit, branch, last_checked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run("proj-a", "mac-mini", "/Users/me/proj-a", "github.com/me/proj-a", "def5678", "main", oneHourAgo);

      // Another project copy
      instance.sqlite
        .prepare(
          `INSERT INTO project_copies (project_slug, host, path, remote_url, head_commit, branch, last_checked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run("proj-b", "local", "/Users/me/proj-b", "github.com/me/proj-b", "ghi9012", "main", now);
    });

    afterAll(() => {
      instance.sqlite.close();
    });

    it("returns all copies with isStale boolean", async () => {
      const res = await app.request("/api/copies");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.copies).toHaveLength(3);
      expect(body.total).toBe(3);

      for (const copy of body.copies) {
        expect(typeof copy.isStale).toBe("boolean");
      }
    });

    it("isStale is false for fresh copy and true for old copy", async () => {
      const res = await app.request("/api/copies");
      const body = await res.json();

      const freshCopy = body.copies.find(
        (c: { projectSlug: string; host: string }) =>
          c.projectSlug === "proj-a" && c.host === "local"
      );
      const staleCopy = body.copies.find(
        (c: { projectSlug: string; host: string }) =>
          c.projectSlug === "proj-a" && c.host === "mac-mini"
      );

      expect(freshCopy.isStale).toBe(false);
      expect(staleCopy.isStale).toBe(true);
    });
  });

  describe("GET /api/copies/:slug", () => {
    it("returns copies for specific project", async () => {
      const res = await app.request("/api/copies/proj-a");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.copies).toHaveLength(2);
      expect(body.projectSlug).toBe("proj-a");
      for (const copy of body.copies) {
        expect(copy.projectSlug).toBe("proj-a");
      }
    });

    it("returns empty copies for nonexistent project", async () => {
      const res = await app.request("/api/copies/nonexistent");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.copies).toEqual([]);
      expect(body.projectSlug).toBe("nonexistent");
    });
  });
});
