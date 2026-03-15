import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerProjectHealth } from "../../tools/project-health.js";

vi.mock("../../api-client.js", () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from "../../api-client.js";

const mockFetchApi = vi.mocked(fetchApi);

describe("project_health", () => {
  let handler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Capture the handler registered with McpServer
    const mockServer = {
      registerTool: vi.fn((_name, _opts, fn) => {
        handler = fn;
      }),
    };

    registerProjectHealth(mockServer as never);

    if (!handler!) {
      throw new Error("registerProjectHealth did not register a tool");
    }
  });

  it("returns text content with project health data", async () => {
    mockFetchApi.mockImplementation(async (path: string) => {
      if (path === "/api/projects") {
        return {
          projects: [
            {
              slug: "mission-control",
              name: "Mission Control",
              healthScore: 92,
              riskLevel: "healthy",
              copyCount: 2,
              lastCommitTime: "2026-03-15T00:00:00Z",
            },
            {
              slug: "openefb",
              name: "OpenEFB",
              healthScore: 75,
              riskLevel: "warning",
              copyCount: 1,
              lastCommitTime: "2026-03-14T00:00:00Z",
            },
          ],
        };
      }
      if (path === "/api/health-checks") {
        return { findings: [], total: 0 };
      }
      return {};
    });

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toBeDefined();
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("Mission Control");
    expect(result.content[0]?.text).toContain("92");
    expect(result.content[0]?.text).toContain("healthy");
  });

  it("calls GET /api/projects and GET /api/health-checks", async () => {
    mockFetchApi.mockResolvedValue({ projects: [], findings: [], total: 0 });

    await handler({});

    expect(mockFetchApi).toHaveBeenCalledWith("/api/projects");
    expect(mockFetchApi).toHaveBeenCalledWith("/api/health-checks");
  });

  it("returns error content on fetch failure (never throws)", async () => {
    mockFetchApi.mockRejectedValue(new Error("Connection refused"));

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toBeDefined();
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("Error");
    expect(result.content[0]?.text).toContain("Connection refused");
  });
});
