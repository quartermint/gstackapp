import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import {
  toolCallSchema,
  AVAILABLE_TOOLS,
  executeToolCall,
} from "../../services/intelligence-tools.js";
import { createTestDb } from "../helpers/setup.js";
import type { DatabaseInstance } from "../../db/index.js";
import { projects, commits, captures, projectKnowledge } from "../../db/schema.js";

// ── toolCallSchema ────────────────────────────────────────────

describe("toolCallSchema", () => {
  it("validates a 'search' tool call with query parameter", () => {
    const result = toolCallSchema.safeParse({
      tool: "search",
      args: { query: "authentication setup" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tool).toBe("search");
    }
  });

  it("validates a 'project_lookup' tool call with slug parameter", () => {
    const result = toolCallSchema.safeParse({
      tool: "project_lookup",
      args: { slug: "mission-control" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tool).toBe("project_lookup");
    }
  });

  it("validates a 'capture_stats' tool call with slug + days parameters", () => {
    const result = toolCallSchema.safeParse({
      tool: "capture_stats",
      args: { slug: "mission-control", days: 14 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tool).toBe("capture_stats");
    }
  });

  it("validates a 'capture_stats' tool call with default days", () => {
    const result = toolCallSchema.safeParse({
      tool: "capture_stats",
      args: { slug: "mc" },
    });
    expect(result.success).toBe(true);
  });

  it("validates a 'knowledge_query' tool call with slug parameter", () => {
    const result = toolCallSchema.safeParse({
      tool: "knowledge_query",
      args: { slug: "openefb" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tool).toBe("knowledge_query");
    }
  });

  it("rejects unknown tool names", () => {
    const result = toolCallSchema.safeParse({
      tool: "delete_everything",
      args: { query: "test" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required args", () => {
    const result = toolCallSchema.safeParse({
      tool: "search",
      args: {},
    });
    expect(result.success).toBe(false);
  });
});

// ── AVAILABLE_TOOLS ──────────────────────────────────────────

describe("AVAILABLE_TOOLS", () => {
  it("exports 4 tool definitions", () => {
    expect(Object.keys(AVAILABLE_TOOLS)).toHaveLength(4);
  });

  it("each tool has description and parameters", () => {
    for (const [, tool] of Object.entries(AVAILABLE_TOOLS)) {
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("parameters");
      expect(typeof tool.description).toBe("string");
    }
  });
});

// ── executeToolCall ──────────────────────────────────────────

describe("executeToolCall", () => {
  let instance: DatabaseInstance;

  beforeAll(() => {
    instance = createTestDb();

    // Seed test data
    const db = instance.db;
    const now = new Date();

    // Insert a project
    db.insert(projects)
      .values({
        slug: "test-project",
        name: "Test Project",
        tagline: "A test project",
        path: "/test/path",
        host: "local",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Insert commits
    db.insert(commits)
      .values({
        id: "tool-commit-1",
        hash: "abc1234",
        message: "feat: add tool calling",
        projectSlug: "test-project",
        authorDate: now.toISOString(),
        createdAt: now,
      })
      .run();

    // Insert captures
    db.insert(captures)
      .values({
        id: "tool-capture-1",
        rawContent: "Need to refactor auth module",
        type: "text",
        status: "raw",
        projectId: "test-project",
        sourceType: "manual",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Insert knowledge
    db.insert(projectKnowledge)
      .values({
        projectSlug: "test-project",
        content: "# CLAUDE.md\nTest project knowledge content",
        contentHash: "hash-123",
        fileSize: 100,
        lastModified: now.toISOString(),
        commitsSinceUpdate: 0,
        lastScannedAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .run();
  });

  afterAll(() => {
    instance.sqlite.close();
  });

  it("executes search tool call and returns results", async () => {
    const result = await executeToolCall(
      { tool: "search", args: { query: "auth" } },
      instance.db,
      instance.sqlite
    );
    expect(result).toBeDefined();
    expect(result).toHaveProperty("results");
  });

  it("executes project_lookup and returns project data", async () => {
    const result = await executeToolCall(
      { tool: "project_lookup", args: { slug: "test-project" } },
      instance.db
    );
    expect(result).toBeDefined();
    const data = result as { project: unknown; recentCommits: unknown };
    expect(data).toHaveProperty("project");
    expect(data).toHaveProperty("recentCommits");
  });

  it("executes capture_stats and returns count", async () => {
    const result = await executeToolCall(
      { tool: "capture_stats", args: { slug: "test-project", days: 7 } },
      instance.db
    );
    expect(result).toBeDefined();
    const data = result as { count: number };
    expect(data).toHaveProperty("count");
    expect(typeof data.count).toBe("number");
  });

  it("executes knowledge_query and returns knowledge data", async () => {
    const result = await executeToolCall(
      { tool: "knowledge_query", args: { slug: "test-project" } },
      instance.db
    );
    expect(result).toBeDefined();
    const data = result as { knowledge: unknown };
    expect(data).toHaveProperty("knowledge");
  });

  it("returns error object for project_lookup with nonexistent slug", async () => {
    const result = await executeToolCall(
      { tool: "project_lookup", args: { slug: "nonexistent" } },
      instance.db
    );
    const data = result as { project: unknown };
    expect(data.project).toBeNull();
  });
});
