import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config to return a test URL
vi.mock("../config.js", () => ({
  getApiUrl: () => "http://localhost:9999",
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  createCapture,
  listProjects,
  listSessions,
  checkHealth,
  McApiError,
  McApiUnreachable,
} from "../api-client.js";

describe("api-client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("createCapture", () => {
    it("sends POST to /api/captures with content", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          capture: { id: "abc", rawContent: "test", projectId: null, aiProjectSlug: null, createdAt: "2026-01-01" },
        }),
      });

      const result = await createCapture({ rawContent: "test thought" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9999/api/captures",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ rawContent: "test thought" }),
        })
      );
      expect(result.capture.id).toBe("abc");
    });

    it("throws McApiError on 400", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: "VALIDATION", message: "Bad input" } }),
      });

      await expect(createCapture({ rawContent: "" })).rejects.toThrow(McApiError);
    });

    it("includes projectId when provided", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          capture: { id: "def", rawContent: "test", projectId: "mc", aiProjectSlug: null, createdAt: "2026-01-01" },
        }),
      });

      await createCapture({ rawContent: "test", projectId: "mc" });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.projectId).toBe("mc");
    });
  });

  describe("listProjects", () => {
    it("fetches GET /api/projects", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ projects: [{ slug: "mc", name: "Mission Control" }] }),
      });

      const result = await listProjects();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9999/api/projects",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
      expect(result.projects).toHaveLength(1);
    });
  });

  describe("listSessions", () => {
    it("fetches GET /api/sessions with status filter", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0 }),
      });

      await listSessions("active");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9999/api/sessions?status=active",
        expect.anything()
      );
    });

    it("fetches GET /api/sessions without filter when no status", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0 }),
      });

      await listSessions();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9999/api/sessions",
        expect.anything()
      );
    });
  });

  describe("checkHealth", () => {
    it("returns true when API is reachable", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      });

      expect(await checkHealth()).toBe(true);
    });

    it("returns false when API is unreachable", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
      expect(await checkHealth()).toBe(false);
    });
  });

  describe("McApiUnreachable", () => {
    it("is thrown on network errors", async () => {
      mockFetch.mockRejectedValue(new TypeError("fetch failed"));
      await expect(listProjects()).rejects.toThrow(McApiUnreachable);
    });
  });
});
