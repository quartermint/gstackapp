import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client.js";

/**
 * Shape of a solution as returned by the API.
 */
export interface SolutionItem {
  id: string;
  sessionId: string | null;
  projectSlug: string | null;
  title: string;
  content: string;
  module: string | null;
  problemType: string | null;
  symptoms: string | null;
  rootCause: string | null;
  tagsJson: string | null;
  severity: string | null;
  status: "candidate" | "accepted" | "dismissed";
  referenceCount: number;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

/**
 * Hook to fetch solutions list with optional status filtering.
 * Uses fetchCounter pattern for SSE-triggered refetch (matches use-captures.ts).
 */
export function useSolutions(status?: string): {
  solutions: SolutionItem[];
  total: number;
  loading: boolean;
  refetch: () => void;
} {
  const [solutions, setSolutions] = useState<SolutionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchSolutions() {
      setLoading(true);
      try {
        const query: Record<string, string> = { limit: "10" };
        if (status) {
          query["status"] = status;
        }

        const res = await client.api.solutions.$get({ query });
        if (!res.ok) {
          throw new Error(`Failed to fetch solutions: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setSolutions((data.solutions ?? []) as unknown as SolutionItem[]);
          setTotal((data as unknown as { total: number }).total ?? 0);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch solutions:", err);
        if (!cancelled) {
          setSolutions([]);
          setTotal(0);
          setLoading(false);
        }
      }
    }

    fetchSolutions();

    return () => {
      cancelled = true;
    };
  }, [status, fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { solutions, total, loading, refetch };
}

/**
 * Hook for solution status update actions (accept/dismiss).
 * Returns updateStatus function and pending state.
 */
export function useSolutionActions(onSuccess?: () => void): {
  updateStatus: (id: string, status: "accepted" | "dismissed") => Promise<void>;
  isPending: boolean;
} {
  const [isPending, setIsPending] = useState(false);

  const updateStatus = useCallback(
    async (id: string, newStatus: "accepted" | "dismissed") => {
      setIsPending(true);
      try {
        // Plain fetch because the PATCH route uses c.req.json() without zValidator,
        // so the typed Hono client doesn't know about the JSON body shape.
        const res = await fetch(`/api/solutions/${encodeURIComponent(id)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          throw new Error(`Failed to update solution status: ${res.status}`);
        }
        onSuccess?.();
      } catch (err) {
        console.error("Failed to update solution status:", err);
      } finally {
        setIsPending(false);
      }
    },
    [onSuccess]
  );

  return { updateStatus, isPending };
}
