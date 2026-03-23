import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client.js";

/**
 * Shape of the compound score response from GET /api/solutions/compound-score.
 */
export interface CompoundScore {
  totalSolutions: number;
  acceptedSolutions: number;
  referencedSolutions: number;
  totalReferences: number;
  reuseRate: number;
  weeklyTrend: Array<{ week: string; references: number }>;
}

/**
 * Hook to fetch compound score metrics from GET /api/solutions/compound-score.
 * Uses fetchCounter pattern for SSE-triggered refetch (matches use-budget.ts).
 */
export function useCompoundScore(): {
  score: CompoundScore | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [score, setScore] = useState<CompoundScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchScore() {
      setLoading(true);
      try {
        const res = await client.api.solutions["compound-score"].$get();
        if (!res.ok) {
          throw new Error(`Failed to fetch compound score: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setScore(data as unknown as CompoundScore);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch compound score:", err);
        if (!cancelled) {
          setScore(null);
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    }

    fetchScore();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { score, loading, error, refetch };
}
