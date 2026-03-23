import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeContentHash,
  vectorToBuffer,
  isEmbeddingAvailable,
  generateEmbedding,
  getEmbeddingDimensions,
  getEmbeddingModel,
} from "../../services/embedding.js";

// Mock lm-studio module
vi.mock("../../services/lm-studio.js", () => ({
  getLmStudioStatus: vi.fn(),
}));

import { getLmStudioStatus } from "../../services/lm-studio.js";
const mockGetStatus = vi.mocked(getLmStudioStatus);

describe("embedding service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("computeContentHash", () => {
    it("produces consistent SHA-256 for same content", () => {
      const hash1 = computeContentHash("hello world");
      const hash2 = computeContentHash("hello world");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it("normalizes CRLF to LF", () => {
      const hash1 = computeContentHash("line1\r\nline2");
      const hash2 = computeContentHash("line1\nline2");
      expect(hash1).toBe(hash2);
    });

    it("trims whitespace", () => {
      const hash1 = computeContentHash("  hello  ");
      const hash2 = computeContentHash("hello");
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different content", () => {
      const hash1 = computeContentHash("content A");
      const hash2 = computeContentHash("content B");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("vectorToBuffer", () => {
    it("converts number array to Float32Array buffer", () => {
      const vec = [0.1, 0.2, 0.3, 0.4];
      const buf = vectorToBuffer(vec);
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBe(4 * 4); // 4 floats * 4 bytes each
    });

    it("round-trips through Float32Array", () => {
      const vec = [1.0, 2.0, 3.0];
      const buf = vectorToBuffer(vec);
      const restored = new Float32Array(
        buf.buffer,
        buf.byteOffset,
        buf.length / 4
      );
      expect(restored[0]).toBeCloseTo(1.0);
      expect(restored[1]).toBeCloseTo(2.0);
      expect(restored[2]).toBeCloseTo(3.0);
    });
  });

  describe("isEmbeddingAvailable", () => {
    it("returns true when LM Studio is ready", () => {
      mockGetStatus.mockReturnValue({
        health: "ready",
        modelId: "test-model",
        lastChecked: new Date(),
      });
      expect(isEmbeddingAvailable()).toBe(true);
    });

    it("returns false when LM Studio is loading", () => {
      mockGetStatus.mockReturnValue({
        health: "loading",
        modelId: null,
        lastChecked: new Date(),
      });
      expect(isEmbeddingAvailable()).toBe(false);
    });

    it("returns false when LM Studio is unavailable", () => {
      mockGetStatus.mockReturnValue({
        health: "unavailable",
        modelId: null,
        lastChecked: new Date(),
      });
      expect(isEmbeddingAvailable()).toBe(false);
    });
  });

  describe("generateEmbedding", () => {
    it("returns null when LM Studio unavailable", async () => {
      mockGetStatus.mockReturnValue({
        health: "unavailable",
        modelId: null,
        lastChecked: new Date(),
      });
      const result = await generateEmbedding("test text");
      expect(result).toBeNull();
    });

    it("calls LM Studio embedding endpoint when available", async () => {
      mockGetStatus.mockReturnValue({
        health: "ready",
        modelId: "test-model",
        lastChecked: new Date(),
      });

      const mockEmbedding = Array.from({ length: 768 }, (_, i) => i * 0.001);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ embedding: mockEmbedding }],
          }),
          { status: 200 }
        )
      );

      const result = await generateEmbedding("test text");
      expect(result).toEqual(mockEmbedding);
      expect(fetchSpy).toHaveBeenCalledOnce();

      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[0]).toContain("/v1/embeddings");
    });

    it("returns null on fetch error", async () => {
      mockGetStatus.mockReturnValue({
        health: "ready",
        modelId: "test-model",
        lastChecked: new Date(),
      });

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
      const result = await generateEmbedding("test text");
      expect(result).toBeNull();
    });

    it("returns null on non-200 response", async () => {
      mockGetStatus.mockReturnValue({
        health: "ready",
        modelId: "test-model",
        lastChecked: new Date(),
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("error", { status: 500 })
      );
      const result = await generateEmbedding("test text");
      expect(result).toBeNull();
    });
  });

  describe("constants", () => {
    it("returns 768 dimensions", () => {
      expect(getEmbeddingDimensions()).toBe(768);
    });

    it("returns embedding model name", () => {
      expect(getEmbeddingModel()).toMatch(/embed/i);
    });
  });
});
