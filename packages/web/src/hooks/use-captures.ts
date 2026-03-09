import { useState, useEffect, useCallback } from "react";

/**
 * Shape of a capture as returned by the API.
 * Defined locally (no runtime import from shared package).
 */
export interface CaptureItem {
  id: string;
  rawContent: string;
  type: "text" | "voice" | "link" | "image";
  status: "raw" | "pending_enrichment" | "enriched" | "archived";
  projectId: string | null;
  aiConfidence: number | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  linkDomain: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Hook to fetch captures, optionally filtered by projectId.
 * Follows established useState + useEffect + cancellation pattern from use-projects.ts.
 */
export function useCaptures(projectId?: string): {
  captures: CaptureItem[];
  total: number;
  loading: boolean;
  refetch: () => void;
} {
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCaptures() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "5" });
        if (projectId) {
          params.set("projectId", projectId);
        }

        const res = await fetch(`/api/captures?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch captures: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setCaptures(data.captures ?? []);
          setTotal(data.total ?? 0);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch captures:", err);
        if (!cancelled) {
          setCaptures([]);
          setTotal(0);
          setLoading(false);
        }
      }
    }

    fetchCaptures();

    return () => {
      cancelled = true;
    };
  }, [projectId, fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { captures, total, loading, refetch };
}

/**
 * Hook to fetch N most recent captures (for command palette suggestions).
 */
export function useRecentCaptures(limit = 3): {
  captures: CaptureItem[];
  loading: boolean;
} {
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchRecent() {
      try {
        const res = await fetch(`/api/captures?limit=${limit}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch recent captures: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setCaptures(data.captures ?? []);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch recent captures:", err);
        if (!cancelled) {
          setCaptures([]);
          setLoading(false);
        }
      }
    }

    fetchRecent();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { captures, loading };
}

/**
 * Hook to fetch unlinked captures (projectId is null, not archived).
 * Fetches recent captures and filters client-side for unlinked ones.
 */
export function useUnlinkedCaptures(): {
  captures: CaptureItem[];
  loading: boolean;
  refetch: () => void;
} {
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchUnlinked() {
      setLoading(true);
      try {
        const res = await fetch("/api/captures?limit=50");
        if (!res.ok) {
          throw new Error(`Failed to fetch captures: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          const unlinked = (data.captures ?? []).filter(
            (c: CaptureItem) => c.projectId === null && c.status !== "archived"
          );
          setCaptures(unlinked);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch unlinked captures:", err);
        if (!cancelled) {
          setCaptures([]);
          setLoading(false);
        }
      }
    }

    fetchUnlinked();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { captures, loading, refetch };
}

/**
 * Hook to fetch capture counts for all projects.
 * Returns a map of projectId -> count.
 * Fetches all captures once and aggregates client-side.
 */
export function useCaptureCounts(): {
  counts: Record<string, number>;
  loading: boolean;
  refetch: () => void;
} {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      setLoading(true);
      try {
        const res = await fetch("/api/captures?limit=200");
        if (!res.ok) {
          throw new Error(`Failed to fetch captures: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          const countMap: Record<string, number> = {};
          for (const capture of data.captures ?? []) {
            if (capture.projectId && capture.status !== "archived") {
              countMap[capture.projectId] = (countMap[capture.projectId] ?? 0) + 1;
            }
          }
          setCounts(countMap);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch capture counts:", err);
        if (!cancelled) {
          setCounts({});
          setLoading(false);
        }
      }
    }

    fetchCounts();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { counts, loading, refetch };
}

/**
 * Hook to fetch count of stale captures (older than 2 weeks, not archived).
 * Uses GET /api/captures/stale when available (Plan 03-01).
 * Gracefully returns 0 if endpoint doesn't exist yet.
 */
export function useStaleCount(): {
  count: number;
  loading: boolean;
} {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchStale() {
      try {
        const res = await fetch("/api/captures/stale");
        if (!res.ok) {
          // Endpoint may not exist yet (Plan 03-01 dependency)
          if (!cancelled) {
            setCount(0);
            setLoading(false);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setCount(data.total ?? 0);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setCount(0);
          setLoading(false);
        }
      }
    }

    fetchStale();

    return () => {
      cancelled = true;
    };
  }, []);

  return { count, loading };
}
