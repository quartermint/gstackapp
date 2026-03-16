import { useState, useEffect, useCallback } from "react";

/** Shape of a convergence finding from GET /api/sessions/convergence. */
export interface ConvergenceItem {
  projectSlug: string;
  sessions: Array<{ id: string; status: string }>;
  overlappingFiles: string[];
  severity: string;
  detectedAt: string;
}

/**
 * Derive per-project convergence counts from an array of convergence items.
 * For each item, key by projectSlug with sessionCount and fileCount.
 */
export function deriveConvergenceCounts(
  convergences: ConvergenceItem[]
): Record<string, { sessionCount: number; fileCount: number }> {
  const counts: Record<string, { sessionCount: number; fileCount: number }> = {};
  for (const item of convergences) {
    counts[item.projectSlug] = {
      sessionCount: item.sessions.length,
      fileCount: item.overlappingFiles.length,
    };
  }
  return counts;
}

/**
 * Hook to fetch convergence data from GET /api/sessions/convergence.
 * Uses fetchCounter pattern for SSE-triggered refetch (matches use-sessions.ts).
 */
export function useConvergence(): {
  convergences: ConvergenceItem[];
  loading: boolean;
  refetch: () => void;
} {
  const [convergences, setConvergences] = useState<ConvergenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchConvergence() {
      setLoading(true);
      try {
        const res = await fetch("/api/sessions/convergence");
        if (!res.ok) {
          throw new Error(`Failed to fetch convergence: ${res.status}`);
        }
        const json = (await res.json()) as {
          convergences: ConvergenceItem[];
          total: number;
        };
        if (!cancelled) {
          setConvergences(json.convergences);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch convergence:", err);
        if (!cancelled) {
          setConvergences([]);
          setLoading(false);
        }
      }
    }

    fetchConvergence();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { convergences, loading, refetch };
}
