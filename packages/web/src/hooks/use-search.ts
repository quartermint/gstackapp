import { useState, useEffect, useRef } from "react";
import { client } from "../api/client.js";

/**
 * Search result shape matching the API searchResultSchema.
 */
export interface SearchResult {
  id: string;
  content: string;
  snippet: string;
  sourceType: "capture" | "commit" | "project" | "knowledge";
  sourceId: string;
  projectSlug: string | null;
  rank: number;
  createdAt: string;
  bm25Score?: number | null;
  vectorScore?: number | null;
  fusedScore?: number | null;
}

/**
 * AI-extracted search filters from the API response.
 */
export interface SearchFilters {
  project: string | null;
  type: "capture" | "commit" | "project" | "knowledge" | null;
  dateAfter: string | null;
  dateBefore: string | null;
}

export interface SearchState {
  results: SearchResult[];
  filters: SearchFilters | null;
  rewrittenQuery: string | null;
  loading: boolean;
  query: string;
}

/**
 * Remove a filter by key, returning new filters with that key set to null.
 * If all filters become null, returns null.
 */
export function removeFilter(
  filters: SearchFilters,
  key: keyof SearchFilters
): SearchFilters | null {
  const updated = { ...filters, [key]: null };
  const hasActive = Object.values(updated).some((v) => v !== null);
  return hasActive ? updated : null;
}

/**
 * Hook to manage debounced search against /api/search.
 *
 * Features:
 * - 200ms debounce on query changes
 * - AbortController cancellation for in-flight requests
 * - Resets to empty when query is empty or disabled
 * - Parses full API response including filters and rewrittenQuery
 */
export function useSearch(query: string, enabled: boolean): SearchState {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filters, setFilters] = useState<SearchFilters | null>(null);
  const [rewrittenQuery, setRewrittenQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Reset when disabled or empty query
    if (!enabled || !query.trim()) {
      setResults([]);
      setFilters(null);
      setRewrittenQuery(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const timer = setTimeout(() => {
      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      client.api.search
        .$get(
          { query: { q: query.trim() } },
          { init: { signal: controller.signal } }
        )
        .then((res) => {
          if (!res.ok) throw new Error(`Search failed: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (!controller.signal.aborted) {
            setResults((data.results ?? []) as unknown as SearchResult[]);
            setFilters((data.filters ?? null) as unknown as SearchFilters | null);
            setRewrittenQuery(data.rewrittenQuery ?? null);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") {
            // Request was cancelled, ignore
            return;
          }
          console.error("Search failed:", err);
          if (!controller.signal.aborted) {
            setResults([]);
            setFilters(null);
            setRewrittenQuery(null);
            setLoading(false);
          }
        });
    }, 200);

    return () => {
      clearTimeout(timer);
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [query, enabled]);

  return {
    results,
    filters,
    rewrittenQuery,
    loading,
    query,
  };
}
