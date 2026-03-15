import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client.js";

/** A single health finding with isNew flag. */
export interface RiskFinding {
  id: number;
  projectSlug: string;
  checkType: string;
  severity: string;
  detail: string;
  metadata: Record<string, unknown> | null;
  detectedAt: string;
  resolvedAt: string | null;
  isNew: boolean;
}

/** Shape of the /api/risks response. */
export interface RisksResponse {
  critical: RiskFinding[];
  warning: RiskFinding[];
  riskCount: number;
  summary: string;
}

/**
 * Hook to fetch risk data from /api/risks.
 * Uses fetchCounter pattern for SSE-triggered refetch (matches use-heatmap.ts).
 */
export function useRisks(): {
  data: RisksResponse | null;
  loading: boolean;
  refetch: () => void;
} {
  const [data, setData] = useState<RisksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchRisks() {
      setLoading(true);
      try {
        const res = await client.api.risks.$get();
        if (!res.ok) {
          throw new Error(`Failed to fetch risks: ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json as unknown as RisksResponse);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch risks:", err);
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      }
    }

    fetchRisks();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { data, loading, refetch };
}
