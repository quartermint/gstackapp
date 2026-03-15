import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerProjectDetail } from "../../tools/project-detail.js";

vi.mock("../../api-client.js", () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from "../../api-client.js";

const mockFetchApi = vi.mocked(fetchApi);

describe("project_detail", () => {
  let handler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockServer = {
      registerTool: vi.fn((_name, _opts, fn) => {
        handler = fn;
      }),
    };

    registerProjectDetail(mockServer as never);

    if (!handler!) {
      throw new Error("registerProjectDetail did not register a tool");
    }
  });

  it("returns deep status for a project", async () => {
    mockFetchApi.mockImplementation(async (path: string) => {
      if (path === "/api/projects/mission-control") {
        return {
          project: {
            slug: "mission-control",
            name: "Mission Control",
            host: "macbook",
            branch: "main",
            dirty: true,
            dirtyFiles: ["src/index.ts"],
            lastCommitHash: "abc1234",
            lastCommitMessage: "feat: add MCP tools",
            lastCommitTime: "2026-03-15T00:00:00Z",
          },
        };
      }
      if (path === "/api/health-checks/mission-control") {
        return {
          findings: [
            {
              projectSlug: "mission-control",
              checkType: "dirty_working_tree",
              severity: "warning",
              detail: "1 uncommitted file",
            },
          ],
          riskLevel: "warning",
        };
      }
      if (path === "/api/copies/mission-control") {
        return {
          copies: [
            {
              projectSlug: "mission-control",
              host: "mac-mini",
              branch: "main",
              headHash: "abc1234",
              isStale: false,
            },
          ],
          projectSlug: "mission-control",
        };
      }
      return {};
    });

    const result = (await handler({ slug: "mission-control" })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.type).toBe("text");
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Mission Control");
    expect(text).toContain("main");
    expect(text).toContain("abc1234");
    expect(text).toContain("dirty");
  });

  it("calls correct API endpoints with slug", async () => {
    mockFetchApi.mockResolvedValue({
      project: {},
      findings: [],
      copies: [],
      riskLevel: "healthy",
      projectSlug: "test",
    });

    await handler({ slug: "openefb" });

    expect(mockFetchApi).toHaveBeenCalledWith("/api/projects/openefb");
    expect(mockFetchApi).toHaveBeenCalledWith("/api/health-checks/openefb");
    expect(mockFetchApi).toHaveBeenCalledWith("/api/copies/openefb");
  });

  it("returns error content on fetch failure", async () => {
    mockFetchApi.mockRejectedValue(new Error("Not found"));

    const result = (await handler({ slug: "nonexistent" })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("Error");
    expect(result.content[0]?.text).toContain("Not found");
  });
});
