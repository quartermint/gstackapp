import { useState, useEffect, useCallback } from "react";

export interface HeatmapEntry {
  projectSlug: string;
  date: string;
  count: number;
}

/**
 * Hook to fetch heatmap data from /api/heatmap.
 * Returns commit intensity per project per day over 12 weeks.
 * Uses fetchCounter pattern for SSE-triggered refetch.
 */
export function useHeatmap(): {
  data: HeatmapEntry[];
  loading: boolean;
  refetch: () => void;
} {
  const [data, setData] = useState<HeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchHeatmap() {
      setLoading(true);
      try {
        const res = await fetch("/api/heatmap?weeks=12");
        if (!res.ok) {
          throw new Error(`Failed to fetch heatmap: ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json.heatmap ?? []);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch heatmap:", err);
        if (!cancelled) {
          setData([]);
          setLoading(false);
        }
      }
    }

    fetchHeatmap();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { data, loading, refetch };
}
