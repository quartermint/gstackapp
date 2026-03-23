import { generateText, Output } from "ai";
import { z } from "zod";
import { getLmStudioStatus } from "./lm-studio.js";

const RERANK_TIMEOUT_MS = 2000;
const RERANK_TOP_N = 20;
const TOP_TIER_COUNT = 5;
const TOP_TIER_RRF_WEIGHT = 0.75;
const TOP_TIER_RERANK_WEIGHT = 0.25;
const DEEP_TIER_RRF_WEIGHT = 0.40;
const DEEP_TIER_RERANK_WEIGHT = 0.60;

export interface RerankCandidate {
  id: string;
  content: string;
  rrfScore: number;
}

export interface RerankedResult {
  id: string;
  finalScore: number;
}

const rerankScoreSchema = z.object({
  relevance: z
    .number()
    .min(0)
    .max(1)
    .describe("Relevance score 0-1 for how well the document matches the query"),
});

/**
 * Cross-encoder reranking via LM Studio (D-08).
 * Position-aware blending: top results trust RRF more (75/25),
 * deep results trust reranker more (40/60).
 * Returns original order on timeout or LM Studio unavailable.
 */
export async function rerankResults(
  query: string,
  candidates: RerankCandidate[],
  lmStudioUrl: string
): Promise<RerankedResult[]> {
  // Skip if no candidates or too few to rerank
  if (candidates.length <= 1) {
    return candidates.map((c) => ({ id: c.id, finalScore: c.rrfScore }));
  }

  // Skip if LM Studio unavailable
  const status = getLmStudioStatus();
  if (status.health !== "ready") {
    return candidates.map((c) => ({ id: c.id, finalScore: c.rrfScore }));
  }

  // Only rerank top N candidates
  const toRerank = candidates.slice(0, RERANK_TOP_N);
  const remainder = candidates.slice(RERANK_TOP_N);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RERANK_TIMEOUT_MS);

    const rerankScores: number[] = [];

    for (const candidate of toRerank) {
      // If abort already fired, bail out of the loop
      if (controller.signal.aborted) {
        throw new Error("Rerank timeout");
      }

      try {
        const { output } = await generateText({
          model: { modelId: "qwen3-coder", provider: "lm-studio" } as Parameters<typeof generateText>[0]["model"],
          output: Output.object({ schema: rerankScoreSchema }),
          prompt: `Rate the relevance of this document to the search query on a scale of 0 to 1.
Query: "${query}"
Document: "${candidate.content.slice(0, 500)}"
Return a relevance score between 0.0 (not relevant) and 1.0 (highly relevant).`,
          abortSignal: controller.signal,
        });
        rerankScores.push(
          (output as { relevance: number } | null)?.relevance ?? 0.5
        );
      } catch (err) {
        // Check if this is an abort — bail out entirely
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          throw err;
        }
        rerankScores.push(0.5); // Neutral score on individual failure
      }
    }

    clearTimeout(timeoutId);

    // Position-aware blending
    const reranked = toRerank.map((candidate, i) => {
      const rerankScore = rerankScores[i] ?? 0.5;
      const isTopTier = i < TOP_TIER_COUNT;
      const rrfWeight = isTopTier ? TOP_TIER_RRF_WEIGHT : DEEP_TIER_RRF_WEIGHT;
      const rerankWeight = isTopTier
        ? TOP_TIER_RERANK_WEIGHT
        : DEEP_TIER_RERANK_WEIGHT;

      return {
        id: candidate.id,
        finalScore: rrfWeight * candidate.rrfScore + rerankWeight * rerankScore,
      };
    });

    // Sort reranked by final score descending
    reranked.sort((a, b) => b.finalScore - a.finalScore);

    // Append remainder unchanged
    const remainderResults = remainder.map((c) => ({
      id: c.id,
      finalScore: c.rrfScore,
    }));

    return [...reranked, ...remainderResults];
  } catch {
    // Timeout or other error: return original order
    return candidates.map((c) => ({ id: c.id, finalScore: c.rrfScore }));
  }
}
