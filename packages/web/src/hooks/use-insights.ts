import { useState, useEffect, useCallback } from "react";

/**
 * Insight type matching the API response from GET /api/intelligence/insights.
 */
export interface Insight {
  id: string;
  type: "stale_capture" | "activity_gap" | "session_pattern" | "cross_project";
  title: string;
  body: string;
  metadata: string | null;
  projectSlug: string | null;
  createdAt: string;
}

const REFETCH_INTERVAL_MS = 5 * 60_000; // 5 minutes

/**
 * Hook to fetch and manage insights from GET /api/intelligence/insights.
 * Uses the fetchCounter pattern (NOT TanStack Query) per codebase convention.
 * Re-fetches every 5 minutes and on SSE events (via refetch callback).
 *
 * Dismiss/snooze are optimistic: dismissedIds tracks locally dismissed items
 * so the UI updates instantly before the API round-trip completes.
 * Follows the seenSlugs pattern from useLastVisit (D-08).
 */
export function useInsights(): {
  insights: Insight[];
  loading: boolean;
  dismissInsight: (id: string) => void;
  snoozeInsight: (id: string, hours?: number) => void;
  refetch: () => void;
} {
  const [allInsights, setAllInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function fetchInsights() {
      try {
        const res = await fetch("/api/intelligence/insights");
        if (!res.ok) {
          throw new Error(`Failed to fetch insights: ${res.status}`);
        }
        const data = (await res.json()) as { insights: Insight[] };
        if (!cancelled) {
          setAllInsights(data.insights);
          // Clear dismissed IDs on fresh fetch — server already filtered them
          setDismissedIds(new Set());
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAllInsights([]);
          setLoading(false);
        }
      }
    }

    fetchInsights();

    const interval = setInterval(fetchInsights, REFETCH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  const dismissInsight = useCallback((id: string) => {
    // Optimistic: add to dismissed set immediately
    setDismissedIds((prev) => new Set([...prev, id]));

    // Fire-and-forget POST to API
    fetch(`/api/intelligence/insights/${encodeURIComponent(id)}/dismiss`, {
      method: "POST",
    }).catch(() => {
      // Revert on failure
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }, []);

  const snoozeInsight = useCallback((id: string, hours = 24) => {
    // Optimistic: add to dismissed set immediately
    setDismissedIds((prev) => new Set([...prev, id]));

    // Fire-and-forget POST to API
    fetch(`/api/intelligence/insights/${encodeURIComponent(id)}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours }),
    }).catch(() => {
      // Revert on failure
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }, []);

  // Filter out optimistically dismissed insights
  const activeInsights = allInsights.filter((i) => !dismissedIds.has(i.id));

  return { insights: activeInsights, loading, dismissInsight, snoozeInsight, refetch };
}
