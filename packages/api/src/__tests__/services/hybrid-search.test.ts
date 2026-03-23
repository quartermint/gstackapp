import { describe, it, expect } from "vitest";
import { rrfScore, fuseResults } from "../../services/hybrid-search.js";
import type { UnifiedSearchResult } from "../../db/queries/search.js";
import type { VectorSearchResult } from "../../db/queries/embeddings.js";

describe("hybrid search", () => {
  describe("rrfScore", () => {
    it("computes RRF score with default k=60", () => {
      // rank=0, weight=1.0: 1/(60+0+1) = 1/61
      const score = rrfScore(0, 1.0);
      expect(score).toBeCloseTo(1 / 61, 6);
    });

    it("higher rank produces lower score", () => {
      const score0 = rrfScore(0, 1.0);
      const score5 = rrfScore(5, 1.0);
      const score20 = rrfScore(20, 1.0);
      expect(score0).toBeGreaterThan(score5);
      expect(score5).toBeGreaterThan(score20);
    });

    it("higher weight produces higher score at same rank", () => {
      const score1x = rrfScore(0, 1.0);
      const score2x = rrfScore(0, 2.0);
      expect(score2x).toBeCloseTo(score1x * 2, 6);
    });

    it("custom k value works", () => {
      const score = rrfScore(0, 1.0, 10);
      expect(score).toBeCloseTo(1 / 11, 6);
    });
  });

  describe("fuseResults", () => {
    const makeBm25 = (
      sourceId: string,
      content: string
    ): UnifiedSearchResult => ({
      content,
      snippet: content,
      sourceType: "capture",
      sourceId,
      projectSlug: null,
      rank: 0,
      createdAt: "2026-01-01T00:00:00Z",
    });

    const makeVector = (
      sourceId: string,
      distance: number
    ): VectorSearchResult => ({
      rowid: 1,
      distance,
      contentHash: `hash-${sourceId}`,
      sourceType: "capture",
      sourceId,
    });

    it("result in both lists gets higher fused score", () => {
      const bm25 = [makeBm25("both", "appears in both")];
      const vector = [makeVector("both", 0.1)];
      const bm25Map = new Map(bm25.map((r) => [r.sourceId, r]));

      const fused = fuseResults(bm25, vector, bm25Map);
      expect(fused).toHaveLength(1);
      expect(fused[0]!.sourceId).toBe("both");
      expect(fused[0]!.bm25Score).not.toBeNull();
      expect(fused[0]!.vectorScore).not.toBeNull();
      expect(fused[0]!.fusedScore).toBeGreaterThan(0);

      // Fused score should be sum of BM25 + vector scores
      expect(fused[0]!.fusedScore).toBeCloseTo(
        fused[0]!.bm25Score! + fused[0]!.vectorScore!,
        6
      );
    });

    it("BM25-only results have null vectorScore", () => {
      const bm25 = [makeBm25("bm25-only", "keyword match")];
      const vector: VectorSearchResult[] = [];
      const bm25Map = new Map(bm25.map((r) => [r.sourceId, r]));

      const fused = fuseResults(bm25, vector, bm25Map);
      expect(fused).toHaveLength(1);
      expect(fused[0]!.bm25Score).not.toBeNull();
      expect(fused[0]!.vectorScore).toBeNull();
    });

    it("vector-only results have null bm25Score", () => {
      const bm25: UnifiedSearchResult[] = [];
      const vector = [makeVector("vec-only", 0.5)];
      const bm25Map = new Map<string, UnifiedSearchResult>();

      const fused = fuseResults(bm25, vector, bm25Map);
      expect(fused).toHaveLength(1);
      expect(fused[0]!.bm25Score).toBeNull();
      expect(fused[0]!.vectorScore).not.toBeNull();
    });

    it("results sorted by fused score descending", () => {
      const bm25 = [
        makeBm25("item-a", "first in bm25"),
        makeBm25("item-b", "second in bm25"),
      ];
      // item-b appears first in vector (higher vector score)
      const vector = [
        makeVector("item-b", 0.1),
        makeVector("item-a", 0.5),
      ];
      const bm25Map = new Map(bm25.map((r) => [r.sourceId, r]));

      const fused = fuseResults(bm25, vector, bm25Map);
      expect(fused).toHaveLength(2);

      // Both items appear in both lists; the one with better combined score wins
      for (let i = 0; i < fused.length - 1; i++) {
        expect(fused[i]!.fusedScore).toBeGreaterThanOrEqual(
          fused[i + 1]!.fusedScore!
        );
      }
    });

    it("deduplicates by sourceId", () => {
      const bm25 = [makeBm25("same", "content")];
      const vector = [makeVector("same", 0.1)];
      const bm25Map = new Map(bm25.map((r) => [r.sourceId, r]));

      const fused = fuseResults(bm25, vector, bm25Map);
      expect(fused).toHaveLength(1);
    });

    it("BM25 results get 2x weight, vector gets 1x", () => {
      // Verify the weight difference in scoring
      const bm25 = [makeBm25("item", "content")];
      const vector = [makeVector("item", 0.1)];
      const bm25Map = new Map(bm25.map((r) => [r.sourceId, r]));

      const fused = fuseResults(bm25, vector, bm25Map);
      const result = fused[0]!;

      // BM25 at rank 0 with weight 2: 2/(60+0+1) = 2/61
      // Vector at rank 0 with weight 1: 1/(60+0+1) = 1/61
      expect(result.bm25Score).toBeCloseTo(2 / 61, 6);
      expect(result.vectorScore).toBeCloseTo(1 / 61, 6);
    });
  });
});
