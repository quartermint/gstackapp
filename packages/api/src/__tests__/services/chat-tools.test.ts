import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { upsertProject } from "../../db/queries/projects.js";
import {
  createCapture,
  listCaptures,
} from "../../db/queries/captures.js";
import { indexCapture } from "../../db/queries/search.js";
import { createChatTools } from "../../services/chat-tools.js";

describe("Chat Tools Service", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();

    // Seed test data
    upsertProject(instance.db, {
      slug: "mission-control",
      name: "Mission Control",
      tagline: "Personal operating environment",
      path: "/Users/ryanstern/mission-control",
      host: "local",
      lastScannedAt: new Date(),
    });

    upsertProject(instance.db, {
      slug: "openefb",
      name: "OpenEFB",
      tagline: "Open-source iPad VFR EFB",
      path: "/Users/ryanstern/openefb",
      host: "local",
      lastScannedAt: new Date(),
    });

    // Seed a regular capture
    createCapture(instance.db, {
      rawContent: "Remember to update the API docs",
      projectId: "mission-control",
      userId: "ryan",
      sourceType: "manual",
    });

    // Seed an iMessage capture
    createCapture(instance.db, {
      rawContent: "Bella said she likes the chat feature",
      projectId: "mission-control",
      userId: "ryan",
      sourceType: "imessage",
    });

    // Index a capture for search
    const { captures } = listCaptures(instance.db, { limit: 1, offset: 0 });
    if (captures[0]) {
      indexCapture(instance.sqlite, {
        id: captures[0].id,
        rawContent: captures[0].rawContent,
        projectId: captures[0].projectId,
        createdAt: captures[0].createdAt.toISOString(),
      });
    }
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  function getTools() {
    return createChatTools(instance, "ryan");
  }

  // ── listProjects ──────────────────────────────────────────────

  describe("listProjects tool", () => {
    it("returns seeded projects", async () => {
      const tools = getTools();
      const result = await tools.listProjects.execute({}, { toolCallId: "test-1", messages: [], abortSignal: undefined as unknown as AbortSignal });
      expect(result).toHaveProperty("projects");
      const data = result as { projects: Array<{ slug: string }> };
      expect(data.projects.length).toBeGreaterThanOrEqual(2);
      const slugs = data.projects.map((p) => p.slug);
      expect(slugs).toContain("mission-control");
      expect(slugs).toContain("openefb");
    });
  });

  // ── getProjectStatus ──────────────────────────────────────────

  describe("getProjectStatus tool", () => {
    it("returns project data for valid slug", async () => {
      const tools = getTools();
      const result = await tools.getProjectStatus.execute(
        { slug: "mission-control" },
        { toolCallId: "test-2", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );
      const data = result as { project: { slug: string } };
      expect(data.project).toBeDefined();
      expect(data.project.slug).toBe("mission-control");
    });

    it("returns error for unknown slug", async () => {
      const tools = getTools();
      const result = await tools.getProjectStatus.execute(
        { slug: "nonexistent" },
        { toolCallId: "test-3", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );
      const data = result as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("not found");
    });
  });

  // ── getRecentCaptures ─────────────────────────────────────────

  describe("getRecentCaptures tool", () => {
    it("returns captures optionally filtered by project", async () => {
      const tools = getTools();
      const result = await tools.getRecentCaptures.execute(
        { projectSlug: "mission-control", limit: 10 },
        { toolCallId: "test-4", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );
      const data = result as { captures: Array<{ rawContent: string }> };
      expect(data.captures).toBeDefined();
      expect(data.captures.length).toBeGreaterThanOrEqual(1);
    });

    it("returns all captures when no filter", async () => {
      const tools = getTools();
      const result = await tools.getRecentCaptures.execute(
        { limit: 10 },
        { toolCallId: "test-5", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );
      const data = result as { captures: unknown[] };
      expect(data.captures.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── getImessageExtracts ───────────────────────────────────────

  describe("getImessageExtracts tool", () => {
    it("returns captures with sourceType imessage", async () => {
      const tools = getTools();
      const result = await tools.getImessageExtracts.execute(
        { limit: 20 },
        { toolCallId: "test-6", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );
      const data = result as { captures: Array<{ sourceType: string; rawContent: string }> };
      expect(data.captures).toBeDefined();
      expect(data.captures.length).toBeGreaterThanOrEqual(1);
      expect(data.captures.every((c) => c.sourceType === "imessage")).toBe(true);
    });
  });

  // ── searchMC ──────────────────────────────────────────────────

  describe("searchMC tool", () => {
    it("returns search results", async () => {
      const tools = getTools();
      const result = await tools.searchMC.execute(
        { query: "API docs" },
        { toolCallId: "test-7", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );
      const data = result as { results: unknown[] };
      expect(data.results).toBeDefined();
      expect(data.results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── createCapture ─────────────────────────────────────────────

  describe("createCapture tool", () => {
    it("creates capture with userId and sourceType bella", async () => {
      const tools = getTools();
      const result = await tools.createCapture.execute(
        { content: "Bella captured this via chat", projectSlug: "mission-control" },
        { toolCallId: "test-8", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );
      const data = result as { capture: { userId: string; sourceType: string; rawContent: string } };
      expect(data.capture).toBeDefined();
      expect(data.capture.userId).toBe("ryan");
      expect(data.capture.sourceType).toBe("bella");
      expect(data.capture.rawContent).toBe("Bella captured this via chat");
    });
  });

  // ── getRecentSessions ─────────────────────────────────────────

  describe("getRecentSessions tool", () => {
    it("returns sessions array (empty when none seeded)", async () => {
      const tools = getTools();
      const result = await tools.getRecentSessions.execute(
        { limit: 5 },
        { toolCallId: "test-9", messages: [], abortSignal: undefined as unknown as AbortSignal }
      );
      const data = result as { sessions: unknown[] };
      expect(data.sessions).toBeDefined();
      expect(Array.isArray(data.sessions)).toBe(true);
    });
  });
});
