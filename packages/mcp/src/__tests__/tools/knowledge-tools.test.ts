import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerProjectKnowledge } from "../../tools/project-knowledge.js";
import { registerConventionCheck } from "../../tools/convention-check.js";
import { registerCrossProjectSearch } from "../../tools/cross-project-search.js";

vi.mock("../../api-client.js", () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from "../../api-client.js";

const mockFetchApi = vi.mocked(fetchApi);

describe("project_knowledge", () => {
  let handler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockServer = {
      registerTool: vi.fn((_name, _opts, fn) => {
        handler = fn;
      }),
    };

    registerProjectKnowledge(mockServer as never);

    if (!handler!) {
      throw new Error("registerProjectKnowledge did not register a tool");
    }
  });

  it("calls fetchApi with correct knowledge path", async () => {
    mockFetchApi.mockResolvedValue({
      projectSlug: "mission-control",
      content: "# MC\n\nContent here.",
      contentHash: "abc123",
      fileSize: 500,
      lastModified: "2026-03-15T00:00:00Z",
      commitsSinceUpdate: 3,
      stalenessScore: 90,
      lastScannedAt: "2026-03-15T12:00:00Z",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-15T12:00:00Z",
    });

    await handler({ slug: "mission-control" });

    expect(mockFetchApi).toHaveBeenCalledWith(
      "/api/knowledge/mission-control"
    );
  });

  it("returns formatted text with project slug, staleness score, and content", async () => {
    mockFetchApi.mockResolvedValue({
      projectSlug: "mission-control",
      content: "# Mission Control\n\nAPI-first platform.",
      contentHash: "abc123",
      fileSize: 500,
      lastModified: "2026-03-15T00:00:00Z",
      commitsSinceUpdate: 3,
      stalenessScore: 90,
      lastScannedAt: "2026-03-15T12:00:00Z",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-15T12:00:00Z",
    });

    const result = (await handler({ slug: "mission-control" })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.type).toBe("text");
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PROJECT KNOWLEDGE: mission-control");
    expect(text).toContain("Staleness: 90/100");
    expect(text).toContain("File size: 500 bytes");
    expect(text).toContain("# Mission Control");
    expect(text).toContain("API-first platform");
  });

  it("returns error content when fetchApi throws", async () => {
    mockFetchApi.mockRejectedValue(new Error("MC API 404: Not found"));

    const result = (await handler({ slug: "nonexistent" })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("Error");
    expect(result.content[0]?.text).toContain("404");
  });
});

describe("convention_check", () => {
  let handler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockServer = {
      registerTool: vi.fn((_name, _opts, fn) => {
        handler = fn;
      }),
    };

    registerConventionCheck(mockServer as never);

    if (!handler!) {
      throw new Error("registerConventionCheck did not register a tool");
    }
  });

  it("calls fetchApi with correct health-checks path", async () => {
    mockFetchApi.mockResolvedValue({
      findings: [],
      riskLevel: "healthy",
    });

    await handler({ slug: "mission-control" });

    expect(mockFetchApi).toHaveBeenCalledWith(
      "/api/health-checks/mission-control"
    );
  });

  it("returns 'No convention violations' when no violations found", async () => {
    mockFetchApi.mockResolvedValue({
      findings: [
        {
          projectSlug: "mission-control",
          checkType: "dirty_working_tree",
          severity: "warning",
          detail: "3 uncommitted files",
        },
      ],
      riskLevel: "warning",
    });

    const result = (await handler({ slug: "mission-control" })) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("No convention violations");
  });

  it("returns formatted violation details when violations exist", async () => {
    mockFetchApi.mockResolvedValue({
      findings: [
        {
          projectSlug: "openefb",
          checkType: "convention_violation",
          severity: "warning",
          detail: "Uses deprecated Qwen3-8B model reference",
          metadata: {
            violations: [
              {
                ruleId: "deprecated-model",
                description: "References deprecated Qwen3-8B model",
              },
            ],
          },
        },
        {
          projectSlug: "openefb",
          checkType: "dirty_working_tree",
          severity: "info",
          detail: "1 uncommitted file",
        },
      ],
      riskLevel: "warning",
    });

    const result = (await handler({ slug: "openefb" })) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("CONVENTION CHECK: openefb");
    expect(text).toContain("Violations: 1");
    expect(text).toContain("[warning]");
    expect(text).toContain("deprecated Qwen3-8B");
    expect(text).toContain("deprecated-model");
    // Should NOT contain the dirty_working_tree finding
    expect(text).not.toContain("dirty_working_tree");
  });

  it("returns error content when fetchApi throws", async () => {
    mockFetchApi.mockRejectedValue(new Error("MC API 500: Internal"));

    const result = (await handler({ slug: "broken" })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("Error");
  });
});

describe("cross_project_search", () => {
  let handler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockServer = {
      registerTool: vi.fn((_name, _opts, fn) => {
        handler = fn;
      }),
    };

    registerCrossProjectSearch(mockServer as never);

    if (!handler!) {
      throw new Error("registerCrossProjectSearch did not register a tool");
    }
  });

  it("calls fetchApi with correct search path and encoded query", async () => {
    mockFetchApi.mockResolvedValue({
      results: [],
      total: 0,
    });

    await handler({ query: "Mission Control" });

    expect(mockFetchApi).toHaveBeenCalledWith(
      "/api/knowledge/search?q=Mission%20Control"
    );
  });

  it("returns 'No results found' when search returns empty", async () => {
    mockFetchApi.mockResolvedValue({
      results: [],
      total: 0,
    });

    const result = (await handler({ query: "nonexistent" })) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("No results found");
    expect(text).toContain("nonexistent");
  });

  it("returns formatted results with slug and snippet for each match", async () => {
    mockFetchApi.mockResolvedValue({
      results: [
        {
          projectSlug: "mission-control",
          snippet: "API-first platform that aggregates project data",
          fileSize: 500,
          stalenessScore: 95,
        },
        {
          projectSlug: "openefb",
          snippet: "Open-source iPad VFR Electronic Flight Bag",
          fileSize: 300,
          stalenessScore: 80,
        },
      ],
      total: 2,
    });

    const result = (await handler({ query: "platform" })) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result.content[0]?.text ?? "";
    expect(text).toContain('KNOWLEDGE SEARCH: "platform"');
    expect(text).toContain("Found 2 match(es)");
    expect(text).toContain("[mission-control]");
    expect(text).toContain("staleness: 95/100");
    expect(text).toContain("API-first platform");
    expect(text).toContain("[openefb]");
    expect(text).toContain("staleness: 80/100");
    expect(text).toContain("Flight Bag");
  });

  it("returns error content when fetchApi throws", async () => {
    mockFetchApi.mockRejectedValue(new Error("MC API 500: timeout"));

    const result = (await handler({ query: "test" })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("Error");
  });
});
