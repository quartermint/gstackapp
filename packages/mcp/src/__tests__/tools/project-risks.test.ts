import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerProjectRisks } from "../../tools/project-risks.js";

vi.mock("../../api-client.js", () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from "../../api-client.js";

const mockFetchApi = vi.mocked(fetchApi);

describe("project_risks", () => {
  let handler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockServer = {
      registerTool: vi.fn((_name, _opts, fn) => {
        handler = fn;
      }),
    };

    registerProjectRisks(mockServer as never);

    if (!handler!) {
      throw new Error("registerProjectRisks did not register a tool");
    }
  });

  it("returns critical and warning findings", async () => {
    mockFetchApi.mockResolvedValue({
      critical: [
        {
          projectSlug: "nexusclaw",
          checkType: "no_remote",
          severity: "critical",
          detail: "No remote configured",
        },
      ],
      warning: [
        {
          projectSlug: "openefb",
          checkType: "dirty_working_tree",
          severity: "warning",
          detail: "3 uncommitted files",
        },
      ],
      riskCount: 2,
      summary: "1 critical, 1 warning",
    });

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("nexusclaw");
    expect(result.content[0]?.text).toContain("no_remote");
    expect(result.content[0]?.text).toContain("openefb");
  });

  it("filters by severity when provided", async () => {
    mockFetchApi.mockResolvedValue({
      critical: [
        {
          projectSlug: "nexusclaw",
          checkType: "no_remote",
          severity: "critical",
          detail: "No remote configured",
        },
      ],
      warning: [
        {
          projectSlug: "openefb",
          checkType: "dirty_working_tree",
          severity: "warning",
          detail: "3 uncommitted files",
        },
      ],
      riskCount: 2,
      summary: "1 critical, 1 warning",
    });

    const result = (await handler({ severity: "critical" })) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("nexusclaw");
    expect(result.content[0]?.text).not.toContain("openefb");
  });

  it("returns 'No active risks' when riskCount is 0", async () => {
    mockFetchApi.mockResolvedValue({
      critical: [],
      warning: [],
      riskCount: 0,
      summary: "All clear",
    });

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("No active risks");
  });

  it("returns error content on fetch failure", async () => {
    mockFetchApi.mockRejectedValue(new Error("timeout"));

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("Error");
    expect(result.content[0]?.text).toContain("timeout");
  });
});
