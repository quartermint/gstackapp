import { useState, useEffect, useMemo, useCallback } from "react";
import {
  groupProjectsByActivity,
  type ProjectItem,
  type GroupedProjects,
} from "../lib/grouping.js";
import { client } from "../api/client.js";

/**
 * Hook to fetch and group project list data from the API.
 * Fetches /api/projects on mount, groups result by activity level.
 * Uses useMemo for derived grouping (not useEffect + setState).
 */
export function useProjects(): {
  groups: GroupedProjects | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchProjects() {
      try {
        const res = await client.api.projects.$get({ query: {} });
        if (!res.ok) {
          throw new Error(`Failed to fetch projects: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setProjects(data.projects as unknown as ProjectItem[]);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unknown error"
          );
          setLoading(false);
        }
      }
    }

    fetchProjects();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const groups = useMemo(() => {
    if (!projects) return null;
    return groupProjectsByActivity(projects);
  }, [projects]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { groups, loading, error, refetch };
}
