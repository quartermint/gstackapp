import { useState, useEffect } from "react";

/**
 * AI-generated project narrative shape matching the API response.
 */
export interface ProjectNarrative {
  summary: string;
  highlights: string[];
  openThreads: string[];
  suggestedFocus: string | null;
}

/**
 * Hook to fetch AI-generated narrative for a project.
 * Uses the fetchCounter pattern (NOT TanStack Query) per codebase convention.
 * Re-fetches on slug change.
 */
export function useNarrative(slug: string | null): {
  narrative: ProjectNarrative | null;
  loading: boolean;
} {
  const [narrative, setNarrative] = useState<ProjectNarrative | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug) {
      setNarrative(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function fetchNarrative() {
      try {
        const res = await fetch(`/api/intelligence/${slug}/narrative`);
        if (!res.ok) {
          throw new Error(`Failed to fetch narrative: ${res.status}`);
        }
        const data = (await res.json()) as { narrative: ProjectNarrative | null };
        if (!cancelled) {
          setNarrative(data.narrative);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setNarrative(null);
          setLoading(false);
        }
      }
    }

    fetchNarrative();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { narrative, loading };
}
