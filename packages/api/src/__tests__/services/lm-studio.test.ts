import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test by importing the module and mocking global fetch
let probeLmStudio: typeof import("../../services/lm-studio.js").probeLmStudio;
let getLmStudioStatus: typeof import("../../services/lm-studio.js").getLmStudioStatus;
let startLmStudioProbe: typeof import("../../services/lm-studio.js").startLmStudioProbe;

describe("LM Studio health probe", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    // Re-import to get fresh module state
    vi.resetModules();
    const mod = await import("../../services/lm-studio.js");
    probeLmStudio = mod.probeLmStudio;
    getLmStudioStatus = mod.getLmStudioStatus;
    startLmStudioProbe = mod.startLmStudioProbe;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns unavailable when fetch throws (connection refused)", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"));

    const result = await probeLmStudio();
    expect(result.health).toBe("unavailable");
    expect(result.modelId).toBeNull();
  });

  it("returns loading when API returns 200 but target model not in list", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "llama-3-8b", state: "loaded" }] }),
        { status: 200 }
      )
    );

    const result = await probeLmStudio();
    expect(result.health).toBe("loading");
    expect(result.modelId).toBeNull();
  });

  it("returns loading when target model found but state is not loaded", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "qwen3-coder-30b-q4", state: "downloading" }],
        }),
        { status: 200 }
      )
    );

    const result = await probeLmStudio();
    expect(result.health).toBe("loading");
    expect(result.modelId).toBe("qwen3-coder-30b-q4");
  });

  it("returns ready when target model found with state loaded", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "qwen3-coder-30b-q4", state: "loaded" }],
        }),
        { status: 200 }
      )
    );

    const result = await probeLmStudio();
    expect(result.health).toBe("ready");
    expect(result.modelId).toBe("qwen3-coder-30b-q4");
  });

  it("returns unavailable when fetch times out after 5 seconds", async () => {
    vi.mocked(fetch).mockImplementation(
      () => new Promise((_resolve, reject) => {
        // Simulate AbortController timeout
        setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 5000);
      })
    );

    const promise = probeLmStudio();
    await vi.advanceTimersByTimeAsync(5001);
    const result = await promise;

    expect(result.health).toBe("unavailable");
    expect(result.modelId).toBeNull();
  });

  it("getLmStudioStatus returns cached status without network call", async () => {
    // Before any probe, should return default status
    const status = getLmStudioStatus();
    expect(status.health).toBe("unavailable");
    expect(status.modelId).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("startLmStudioProbe runs immediately then on interval", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "qwen3-coder-30b", state: "loaded" }],
        }),
        { status: 200 }
      )
    );

    const handle = startLmStudioProbe(30_000);
    // Wait for the immediate probe
    await vi.advanceTimersByTimeAsync(0);

    expect(fetch).toHaveBeenCalledTimes(1);

    // Advance past one interval
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(2);

    clearInterval(handle);
  });
});
