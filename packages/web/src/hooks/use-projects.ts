import { useState, useEffect, useMemo } from "react";
import {
  groupProjectsByActivity,
  type ProjectItem,
  type GroupedProjects,
} from "../lib/grouping.js";

/**
 * Hook to fetch and group project list data from the API.
 * Fetches /api/projects on mount, groups result by activity level.
 * Uses useMemo for derived grouping (not useEffect + setState).
 */
export function useProjects(): {
  groups: GroupedProjects | null;
  loading: boolean;
  error: string | null;
} {
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchProjects() {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) {
          throw new Error(`Failed to fetch projects: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setProjects(data.projects);
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
  }, []);

  const groups = useMemo(() => {
    if (!projects) return null;
    return groupProjectsByActivity(projects);
  }, [projects]);

  return { groups, loading, error };
}
