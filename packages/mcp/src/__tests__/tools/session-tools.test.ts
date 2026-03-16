import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerSessionStatus } from "../../tools/session-status.js";
import { registerSessionConflicts } from "../../tools/session-conflicts.js";

vi.mock("../../api-client.js", () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from "../../api-client.js";

const mockFetchApi = vi.mocked(fetchApi);

describe("session_status", () => {
  let handler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockServer = {
      registerTool: vi.fn((_name, _opts, fn) => {
        handler = fn;
      }),
    };

    registerSessionStatus(mockServer as never);

    if (!handler!) {
      throw new Error("registerSessionStatus did not register a tool");
    }
  });

  it("formats active sessions correctly", async () => {
    mockFetchApi.mockResolvedValue({
      sessions: [
        {
          id: "session-abc-123-456",
          source: "claude-code",
          model: "opus-4",
          tier: "opus",
          projectSlug: "mission-control",
          status: "active",
          filesJson: JSON.stringify(["src/app.ts", "src/index.ts"]),
          startedAt: "2026-03-16T15:00:00Z",
          lastHeartbeatAt: "2026-03-16T15:05:00Z",
        },
      ],
      total: 1,
    });

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toBeDefined();
    expect(result.content[0]?.type).toBe("text");
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("ACTIVE SESSIONS (1)");
    expect(text).toContain("session-abc-");
    expect(text).toContain("mission-control");
    expect(text).toContain("claude-code/opus");
    expect(text).toContain("files=2");
  });

  it("shows 'No active sessions.' when none exist", async () => {
    mockFetchApi.mockResolvedValue({ sessions: [], total: 0 });

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toBe("No active sessions.");
  });

  it("calls GET /api/sessions?status=active&limit=100", async () => {
    mockFetchApi.mockResolvedValue({ sessions: [], total: 0 });

    await handler({});

    expect(mockFetchApi).toHaveBeenCalledWith(
      "/api/sessions?status=active&limit=100",
    );
  });

  it("returns error content on fetch failure", async () => {
    mockFetchApi.mockRejectedValue(new Error("Connection refused"));

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("Error");
    expect(result.content[0]?.text).toContain("Connection refused");
  });
});

describe("session_conflicts", () => {
  let handler: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockServer = {
      registerTool: vi.fn((_name, _opts, fn) => {
        handler = fn;
      }),
    };

    registerSessionConflicts(mockServer as never);

    if (!handler!) {
      throw new Error("registerSessionConflicts did not register a tool");
    }
  });

  it("formats conflicts correctly", async () => {
    mockFetchApi.mockResolvedValue({
      conflicts: [
        {
          projectSlug: "mission-control",
          sessionA: "session-abc-123-456",
          sessionB: "session-def-789-012",
          files: ["src/app.ts", "src/routes/sessions.ts"],
          severity: "warning",
          detectedAt: "2026-03-16T15:00:00Z",
        },
      ],
      total: 1,
    });

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content).toBeDefined();
    expect(result.content[0]?.type).toBe("text");
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("FILE CONFLICTS (1)");
    expect(text).toContain("mission-control:");
    expect(text).toContain("session-abc-");
    expect(text).toContain("session-def-");
    expect(text).toContain("warning");
    expect(text).toContain("src/app.ts");
    expect(text).toContain("src/routes/sessions.ts");
  });

  it("shows 'No active file conflicts' when none exist", async () => {
    mockFetchApi.mockResolvedValue({ conflicts: [], total: 0 });

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toBe(
      "No active file conflicts across sessions.",
    );
  });

  it("calls GET /api/sessions/conflicts", async () => {
    mockFetchApi.mockResolvedValue({ conflicts: [], total: 0 });

    await handler({});

    expect(mockFetchApi).toHaveBeenCalledWith("/api/sessions/conflicts");
  });

  it("returns error content on fetch failure", async () => {
    mockFetchApi.mockRejectedValue(new Error("API timeout"));

    const result = (await handler({})) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.text).toContain("Error");
    expect(result.content[0]?.text).toContain("API timeout");
  });
});
