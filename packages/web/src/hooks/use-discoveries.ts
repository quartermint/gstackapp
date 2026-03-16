import { useState, useEffect, useCallback } from "react";

/** Shape of a discovery from GET /api/discoveries. */
export interface DiscoveryItem {
  id: string;
  path: string;
  host: "local" | "mac-mini" | "github";
  status: "found" | "tracked" | "dismissed";
  remoteUrl: string | null;
  name: string | null;
  lastCommitAt: string | null;
  discoveredAt: string;
  updatedAt: string;
}

/**
 * Hook to fetch discoveries from GET /api/discoveries?status=found.
 * Uses fetchCounter pattern for SSE-triggered refetch (matches use-convergence.ts).
 */
export function useDiscoveries(): {
  discoveries: DiscoveryItem[];
  loading: boolean;
  refetch: () => void;
} {
  const [discoveries, setDiscoveries] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchDiscoveries() {
      setLoading(true);
      try {
        const res = await fetch("/api/discoveries?status=found&limit=100");
        if (!res.ok) {
          throw new Error(`Failed to fetch discoveries: ${res.status}`);
        }
        const json = (await res.json()) as {
          discoveries: DiscoveryItem[];
        };
        if (!cancelled) {
          setDiscoveries(json.discoveries);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch discoveries:", err);
        if (!cancelled) {
          setDiscoveries([]);
          setLoading(false);
        }
      }
    }

    fetchDiscoveries();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { discoveries, loading, refetch };
}

/** Promote a discovery to tracked status (adds it as a project). */
export async function promoteDiscovery(id: string): Promise<void> {
  const res = await fetch(`/api/discoveries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "tracked" }),
  });
  if (!res.ok) {
    throw new Error(`Failed to promote discovery: ${res.status}`);
  }
}

/** Dismiss a discovery (permanently hides it). */
export async function dismissDiscovery(id: string): Promise<void> {
  const res = await fetch(`/api/discoveries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "dismissed" }),
  });
  if (!res.ok) {
    throw new Error(`Failed to dismiss discovery: ${res.status}`);
  }
}
