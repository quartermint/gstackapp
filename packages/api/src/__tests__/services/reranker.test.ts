import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock lm-studio module before importing reranker
vi.mock("../../services/lm-studio.js", () => ({
  getLmStudioStatus: vi.fn(),
}));

// Mock ai module to avoid real LLM calls
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn(() => ({})),
  },
}));

import { rerankResults, type RerankCandidate } from "../../services/reranker.js";
import { getLmStudioStatus } from "../../services/lm-studio.js";
import { generateText } from "ai";

const mockGetStatus = vi.mocked(getLmStudioStatus);
const mockGenerateText = vi.mocked(generateText);

function makeCandidate(id: string, score: number): RerankCandidate {
  return {
    id,
    content: `Document content for ${id}`,
    rrfScore: score,
  };
}

describe("reranker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rerankResults", () => {
    it("returns reordered array with blended scores when LM Studio available", async () => {
      mockGetStatus.mockReturnValue({
        health: "ready",
        modelId: "qwen3-coder",
        lastChecked: new Date(),
      });

      // Mock LLM scoring: give higher relevance to later items
      let callIndex = 0;
      mockGenerateText.mockImplementation(async () => {
        const scores = [0.3, 0.9, 0.5, 0.7, 0.2, 0.8, 0.6];
        const score = scores[callIndex % scores.length] ?? 0.5;
        callIndex++;
        return { output: { relevance: score } } as unknown as ReturnType<typeof generateText>;
      });

      const candidates = [
        makeCandidate("a", 0.05),
        makeCandidate("b", 0.04),
        makeCandidate("c", 0.03),
        makeCandidate("d", 0.02),
        makeCandidate("e", 0.015),
        makeCandidate("f", 0.01),
        makeCandidate("g", 0.005),
      ];

      const results = await rerankResults("test query", candidates, "http://localhost:1234");

      expect(results).toHaveLength(7);
      // All results should have finalScore
      for (const r of results) {
        expect(typeof r.finalScore).toBe("number");
        expect(r.finalScore).toBeGreaterThan(0);
      }
      // Results should be sorted by finalScore descending
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]!.finalScore).toBeGreaterThanOrEqual(results[i + 1]!.finalScore);
      }
    });

    it("applies position-aware blending: top 5 use 75/25, rest use 40/60", async () => {
      mockGetStatus.mockReturnValue({
        health: "ready",
        modelId: "qwen3-coder",
        lastChecked: new Date(),
      });

      // All get same rerank score of 0.8 to isolate blending math
      mockGenerateText.mockResolvedValue({
        output: { relevance: 0.8 },
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const candidates = [
        makeCandidate("top1", 0.06),
        makeCandidate("top2", 0.05),
        makeCandidate("top3", 0.04),
        makeCandidate("top4", 0.03),
        makeCandidate("top5", 0.02),
        makeCandidate("deep1", 0.01),
        makeCandidate("deep2", 0.005),
      ];

      const results = await rerankResults("test query", candidates, "http://localhost:1234");

      // Top tier (index 0-4): finalScore = 0.75 * rrfScore + 0.25 * 0.8
      const top1 = results.find((r) => r.id === "top1");
      expect(top1).toBeDefined();
      expect(top1!.finalScore).toBeCloseTo(0.75 * 0.06 + 0.25 * 0.8, 4);

      // Deep tier (index 5+): finalScore = 0.40 * rrfScore + 0.60 * 0.8
      const deep1 = results.find((r) => r.id === "deep1");
      expect(deep1).toBeDefined();
      expect(deep1!.finalScore).toBeCloseTo(0.40 * 0.01 + 0.60 * 0.8, 4);
    });

    it("returns original order when LM Studio unavailable (graceful skip)", async () => {
      mockGetStatus.mockReturnValue({
        health: "unavailable",
        modelId: null,
        lastChecked: new Date(),
      });

      const candidates = [
        makeCandidate("a", 0.05),
        makeCandidate("b", 0.04),
        makeCandidate("c", 0.03),
      ];

      const results = await rerankResults("test query", candidates, "http://localhost:1234");

      expect(results).toHaveLength(3);
      expect(results[0]!.id).toBe("a");
      expect(results[0]!.finalScore).toBe(0.05);
      expect(results[1]!.id).toBe("b");
      expect(results[1]!.finalScore).toBe(0.04);
    });

    it("returns original order on timeout (respects 2 second budget)", async () => {
      mockGetStatus.mockReturnValue({
        health: "ready",
        modelId: "qwen3-coder",
        lastChecked: new Date(),
      });

      // Simulate timeout by rejecting with AbortError
      mockGenerateText.mockRejectedValue(new DOMException("Aborted", "AbortError"));

      const candidates = [
        makeCandidate("a", 0.05),
        makeCandidate("b", 0.04),
      ];

      const results = await rerankResults("test query", candidates, "http://localhost:1234");

      expect(results).toHaveLength(2);
      expect(results[0]!.id).toBe("a");
      expect(results[0]!.finalScore).toBe(0.05);
    });

    it("handles empty input", async () => {
      const results = await rerankResults("test query", [], "http://localhost:1234");
      expect(results).toEqual([]);
    });

    it("handles single-item input without calling LM Studio", async () => {
      const results = await rerankResults(
        "test query",
        [makeCandidate("only", 0.1)],
        "http://localhost:1234"
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("only");
      expect(results[0]!.finalScore).toBe(0.1);
      // Should not call LM Studio for single item
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("handles individual scoring failures gracefully (neutral 0.5 score)", async () => {
      mockGetStatus.mockReturnValue({
        health: "ready",
        modelId: "qwen3-coder",
        lastChecked: new Date(),
      });

      let callCount = 0;
      mockGenerateText.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Individual failure");
        }
        return { output: { relevance: 0.9 } } as unknown as ReturnType<typeof generateText>;
      });

      const candidates = [
        makeCandidate("a", 0.05),
        makeCandidate("b", 0.04),
        makeCandidate("c", 0.03),
      ];

      const results = await rerankResults("test query", candidates, "http://localhost:1234");

      expect(results).toHaveLength(3);
      // Item b (index 1, failed) should use neutral 0.5 score
      const itemB = results.find((r) => r.id === "b");
      expect(itemB).toBeDefined();
      // Top tier: 0.75 * 0.04 + 0.25 * 0.5 = 0.155
      expect(itemB!.finalScore).toBeCloseTo(0.75 * 0.04 + 0.25 * 0.5, 4);
    });
  });
});
