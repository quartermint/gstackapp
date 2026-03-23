import { describe, it, expect } from "vitest";
import {
  fuseResults,
  rankByFusion,
  RRF_K,
  type FusionCandidate,
} from "../../services/rrf-fusion.js";

describe("RRF constants", () => {
  it("RRF_K equals 60", () => {
    expect(RRF_K).toBe(60);
  });
});

describe("fuseResults", () => {
  it("returns empty map for empty input", () => {
    const result = fuseResults([]);
    expect(result.size).toBe(0);
  });

  it("returns empty map for empty ranked lists", () => {
    const result = fuseResults([[]]);
    expect(result.size).toBe(0);
  });

  it("computes score = weight / (K + rank + 1) for single ranked list", () => {
    const list: FusionCandidate[] = [
      { contentHash: "abc", rank: 0, weight: 1.0 },
      { contentHash: "def", rank: 1, weight: 1.0 },
    ];

    const result = fuseResults([list]);

    // rank 0: 1.0 / (60 + 0 + 1) = 1/61
    expect(result.get("abc")).toBeCloseTo(1 / 61, 10);
    // rank 1: 1.0 / (60 + 1 + 1) = 1/62
    expect(result.get("def")).toBeCloseTo(1 / 62, 10);
  });

  it("sums scores for items appearing in both lists", () => {
    const listA: FusionCandidate[] = [
      { contentHash: "abc", rank: 0, weight: 2.0 },
    ];
    const listB: FusionCandidate[] = [
      { contentHash: "abc", rank: 2, weight: 1.0 },
    ];

    const result = fuseResults([listA, listB]);

    // 2.0 / (60 + 0 + 1) + 1.0 / (60 + 2 + 1) = 2/61 + 1/63
    const expected = 2.0 / 61 + 1.0 / 63;
    expect(result.get("abc")).toBeCloseTo(expected, 10);
  });

  it("weight=2.0 produces double the score of weight=1.0 for same rank", () => {
    const listDouble: FusionCandidate[] = [
      { contentHash: "abc", rank: 0, weight: 2.0 },
    ];
    const listSingle: FusionCandidate[] = [
      { contentHash: "def", rank: 0, weight: 1.0 },
    ];

    const doubleResult = fuseResults([listDouble]);
    const singleResult = fuseResults([listSingle]);

    const doubleScore = doubleResult.get("abc")!;
    const singleScore = singleResult.get("def")!;

    expect(doubleScore).toBeCloseTo(singleScore * 2, 10);
  });

  it("handles items appearing in only one list (single contribution)", () => {
    const listA: FusionCandidate[] = [
      { contentHash: "abc", rank: 0, weight: 1.0 },
    ];
    const listB: FusionCandidate[] = [
      { contentHash: "def", rank: 0, weight: 1.0 },
    ];

    const result = fuseResults([listA, listB]);

    expect(result.size).toBe(2);
    expect(result.get("abc")).toBeCloseTo(1 / 61, 10);
    expect(result.get("def")).toBeCloseTo(1 / 61, 10);
  });

  it("end-to-end: original query (weight 2.0) BM25 + vector fused with expanded query (weight 1.0) BM25 + vector", () => {
    // 4 ranked lists simulating hybrid search
    const origBm25: FusionCandidate[] = [
      { contentHash: "A", rank: 0, weight: 2.0 },
      { contentHash: "B", rank: 1, weight: 2.0 },
      { contentHash: "C", rank: 2, weight: 2.0 },
    ];
    const origVec: FusionCandidate[] = [
      { contentHash: "A", rank: 0, weight: 2.0 },
      { contentHash: "D", rank: 1, weight: 2.0 },
      { contentHash: "B", rank: 2, weight: 2.0 },
    ];
    const expandedBm25: FusionCandidate[] = [
      { contentHash: "A", rank: 0, weight: 1.0 },
      { contentHash: "E", rank: 1, weight: 1.0 },
      { contentHash: "C", rank: 2, weight: 1.0 },
    ];
    const expandedVec: FusionCandidate[] = [
      { contentHash: "B", rank: 0, weight: 1.0 },
      { contentHash: "A", rank: 1, weight: 1.0 },
      { contentHash: "F", rank: 2, weight: 1.0 },
    ];

    const result = fuseResults([origBm25, origVec, expandedBm25, expandedVec]);

    // A appears in all 4 lists — should have the highest score
    // A: 2.0/61 + 2.0/61 + 1.0/61 + 1.0/62
    const scoreA =
      2.0 / 61 + 2.0 / 61 + 1.0 / 61 + 1.0 / 62;
    expect(result.get("A")).toBeCloseTo(scoreA, 10);

    // B appears in 3 lists
    // B: 2.0/62 + 2.0/63 + 1.0/61
    const scoreB = 2.0 / 62 + 2.0 / 63 + 1.0 / 61;
    expect(result.get("B")).toBeCloseTo(scoreB, 10);

    // A should be ranked higher than all others
    const ranked = rankByFusion(result);
    expect(ranked[0]).toBe("A");

    // B should be second (appears in 3 lists with decent ranks)
    expect(ranked[1]).toBe("B");
  });
});

describe("rankByFusion", () => {
  it("sorts content hashes by descending fused score", () => {
    const scores = new Map<string, number>([
      ["low", 0.01],
      ["high", 0.05],
      ["mid", 0.03],
    ]);

    const result = rankByFusion(scores);
    expect(result).toEqual(["high", "mid", "low"]);
  });

  it("returns stable ordering for tied scores", () => {
    const scores = new Map<string, number>([
      ["first", 0.05],
      ["second", 0.05],
    ]);

    const result = rankByFusion(scores);
    expect(result).toHaveLength(2);
    // Both present
    expect(result).toContain("first");
    expect(result).toContain("second");
  });

  it("returns empty array for empty map", () => {
    const result = rankByFusion(new Map());
    expect(result).toEqual([]);
  });
});
