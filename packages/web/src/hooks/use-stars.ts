import { useState, useEffect, useCallback } from "react";

/** Shape of a starred repo from GET /api/stars. */
export interface StarItem {
  githubId: number;
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  htmlUrl: string;
  intent: "reference" | "tool" | "try" | "inspiration" | null;
  aiConfidence: number | null;
  userOverride: boolean;
  starredAt: string;
}

/**
 * Hook to fetch stars from GET /api/stars?limit=200.
 * Uses fetchCounter pattern for SSE-triggered refetch (matches use-convergence.ts).
 */
export function useStars(): {
  stars: StarItem[];
  total: number;
  loading: boolean;
  refetch: () => void;
} {
  const [stars, setStars] = useState<StarItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchStars() {
      setLoading(true);
      try {
        const res = await fetch("/api/stars?limit=200");
        if (!res.ok) {
          throw new Error(`Failed to fetch stars: ${res.status}`);
        }
        const json = (await res.json()) as {
          stars: StarItem[];
          total: number;
        };
        if (!cancelled) {
          setStars(json.stars);
          setTotal(json.total);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch stars:", err);
        if (!cancelled) {
          setStars([]);
          setTotal(0);
          setLoading(false);
        }
      }
    }

    fetchStars();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { stars, total, loading, refetch };
}

/** Override the intent category for a starred repo. */
export async function updateStarIntent(
  githubId: number,
  intent: string
): Promise<void> {
  const res = await fetch(`/api/stars/${githubId}/intent`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update star intent: ${res.status}`);
  }
}
