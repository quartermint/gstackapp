import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchApi } from "../api-client.js";

describe("fetchApi", () => {
  const mockFetch = vi.fn();
  const originalEnv = process.env.MC_API_URL;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    delete process.env.MC_API_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv !== undefined) {
      process.env.MC_API_URL = originalEnv;
    } else {
      delete process.env.MC_API_URL;
    }
  });

  it("returns parsed JSON on success", async () => {
    const mockData = { projects: [{ slug: "test" }] };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchApi("/api/projects");
    expect(result).toEqual(mockData);
  });

  it("constructs URL from default base when env not set", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchApi("/api/risks");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://100.123.8.125:3000/api/risks",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("constructs URL from MC_API_URL env var", async () => {
    process.env.MC_API_URL = "http://localhost:4000";
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    // Re-import to pick up new env value — fetchApi reads env at call time
    await fetchApi("/api/projects");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/projects",
      expect.any(Object),
    );
  });

  it("sets Accept: application/json header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchApi("/api/health-checks");

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs?.[1]?.headers).toEqual({ Accept: "application/json" });
  });

  it("sets AbortSignal.timeout", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchApi("/api/projects");

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs?.[1]?.signal).toBeDefined();
  });

  it("throws on non-OK response with status and body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    });

    await expect(fetchApi("/api/projects/unknown")).rejects.toThrow(
      "MC API 404: Not found",
    );
  });
});
