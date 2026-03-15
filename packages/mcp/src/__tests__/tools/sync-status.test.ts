import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerSyncStatus } from "../../tools/sync-status.js";

vi.mock("../../api-client.js", () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from "../../api-client.js";

const mockFetchApi = vi.mocked(fetchApi);

describe("sync_status", () => {
  let handler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockServer = {
      registerTool: vi.fn((_name, _opts, fn) => {
        handler = fn;
      }),
    };

    registerSyncStatus(mockServer as never);

    if (!handler!) {
      throw new Error("registerSyncStatus did not register a tool");
    }
  });

  it("filters findings to sync-related check types", async () => {
    mockFetchApi.mockImplementation(async (path: string) => {
      if (path === "/api/health-checks") {
        return {
          findings: [
            {
              projectSlug: "nexusclaw",
              checkType: "unpushed_commits",
              severity: "critical",
              detail: "5 commits ahead",
            },
            {
              projectSlug: "openefb",
              checkType: "dirty_working_tree",
              severity: "warning",
              detail: "3 uncommitted files",
            },
            {
              projectSlug: "taxnav",
              checkType: "no_remote",
              severity: "critical",
              detail: "No remote configured",
            },
          ],
          total: 3,
        };
      }
      if (path === "/api/copies") {
        return { copies: [], total: 0 };
      }
      return {};
    });

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result.content[0]?.text ?? "";
    // Should include sync-related findings (uppercased in headers)
    expect(text.toLowerCase()).toContain("unpushed_commits");
    expect(text).toContain("nexusclaw");
    expect(text.toLowerCase()).toContain("no_remote");
    expect(text).toContain("taxnav");
    // Should NOT include non-sync findings
    expect(text.toLowerCase()).not.toContain("dirty_working_tree");
  });

  it("includes diverged copies", async () => {
    mockFetchApi.mockImplementation(async (path: string) => {
      if (path === "/api/health-checks") {
        return { findings: [], total: 0 };
      }
      if (path === "/api/copies") {
        return {
          copies: [
            {
              projectSlug: "mission-control",
              host: "mac-mini",
              branch: "main",
              headHash: "abc123",
              isStale: true,
            },
          ],
          total: 1,
        };
      }
      return {};
    });

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("mission-control");
    expect(text).toContain("stale");
  });

  it("returns 'All projects in sync' when no sync issues", async () => {
    mockFetchApi.mockImplementation(async (path: string) => {
      if (path === "/api/health-checks") {
        return { findings: [], total: 0 };
      }
      if (path === "/api/copies") {
        return { copies: [], total: 0 };
      }
      return {};
    });

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("All projects in sync");
  });

  it("returns error content on fetch failure", async () => {
    mockFetchApi.mockRejectedValue(new Error("Network error"));

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("Error");
    expect(result.content[0]?.text).toContain("Network error");
  });
});
