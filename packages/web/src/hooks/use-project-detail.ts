import { useState, useEffect, useRef } from "react";
import { client } from "../api/client.js";

interface GitCommit {
  hash: string;
  message: string;
  relativeTime: string;
  date: string;
}

interface GsdState {
  status: string;
  stoppedAt: string | null;
  percent: number | null;
}

export interface ProjectDetail {
  slug: string;
  name: string;
  tagline: string | null;
  path: string;
  host: "local" | "mac-mini" | "github";
  branch: string | null;
  dirty: boolean | null;
  dirtyFiles: string[];
  lastCommitHash: string | null;
  lastCommitMessage: string | null;
  lastCommitTime: string | null;
  lastCommitDate: string | null;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  commits: GitCommit[];
  gsdState: GsdState | null;
}

// Simple in-memory cache to avoid refetching recently viewed projects
const cache = new Map<string, ProjectDetail>();

/**
 * Hook to fetch project detail for hero card.
 * Fetches /api/projects/:slug when slug changes.
 * Cancels previous fetch on slug change.
 * Caches results in memory.
 */
export function useProjectDetail(slug: string | null): {
  detail: ProjectDetail | null;
  loading: boolean;
} {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!slug) {
      setDetail(null);
      setLoading(false);
      return;
    }

    // Check cache first
    const cached = cache.get(slug);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      return;
    }

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    async function fetchDetail() {
      try {
        const res = await client.api.projects[":slug"].$get(
          { param: { slug: slug! } },
          { init: { signal: controller.signal } }
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch project: ${res.status}`);
        }
        const data = await res.json();
        const project = data.project as unknown as ProjectDetail;
        cache.set(slug!, project);
        if (!controller.signal.aborted) {
          setDetail(project);
          setLoading(false);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return; // Expected on cleanup
        }
        if (!controller.signal.aborted) {
          setDetail(null);
          setLoading(false);
        }
      }
    }

    fetchDetail();

    return () => {
      controller.abort();
    };
  }, [slug]);

  return { detail, loading };
}
