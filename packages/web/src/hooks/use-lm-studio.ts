import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client.js";

export type LmStudioHealth = "unavailable" | "loading" | "ready";

export interface LmStudioStatus {
  health: LmStudioHealth;
  modelId: string | null;
  lastChecked: string;
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Hook to poll GET /api/models every 30 seconds for LM Studio health status.
 * Matches the backend probe cadence so data is always fresh.
 */
export function useLmStudio(): {
  status: LmStudioStatus | null;
  loading: boolean;
} {
  const [status, setStatus] = useState<LmStudioStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await client.api.models.$get();
      if (!res.ok) {
        setStatus(null);
        return;
      }
      const data = (await res.json()) as unknown as { lmStudio: LmStudioStatus };
      setStatus(data.lmStudio);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { status, loading };
}
