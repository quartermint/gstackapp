import { useState, useEffect } from "react";

/**
 * Types matching the API response from /api/intelligence/digest.
 */
export interface DigestSection {
  title: string;
  items: string[];
  priority: "high" | "medium" | "low";
}

export interface ProjectHighlight {
  slug: string;
  activity: string;
}

export interface DailyDigest {
  summary: string;
  sections: DigestSection[];
  actionItems: string[];
  projectHighlights: ProjectHighlight[];
  generatedAt: string;
}

const REFETCH_INTERVAL_MS = 5 * 60_000; // 5 minutes

/**
 * Hook to fetch the daily digest (global, not per-project).
 * Uses the fetchCounter pattern (NOT TanStack Query) per codebase convention.
 * Re-fetches every 5 minutes (digest updates infrequently, cached 12h).
 */
export function useDigest(): {
  digest: DailyDigest | null;
  loading: boolean;
} {
  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchDigest() {
      try {
        const res = await fetch("/api/intelligence/digest");
        if (!res.ok) {
          throw new Error(`Failed to fetch digest: ${res.status}`);
        }
        const data = (await res.json()) as { digest: DailyDigest | null };
        if (!cancelled) {
          setDigest(data.digest);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setDigest(null);
          setLoading(false);
        }
      }
    }

    fetchDigest();

    const interval = setInterval(fetchDigest, REFETCH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { digest, loading };
}
