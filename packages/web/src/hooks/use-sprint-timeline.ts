import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client.js";

// ── Types ───────────────────────────────────────────────────────────

export interface TimelineSegment {
  startDate: string;
  endDate: string;
  commits: number;
  density: number;
}

export interface TimelineProject {
  slug: string;
  segments: TimelineSegment[];
  totalCommits: number;
}

export interface SprintTimelineResponse {
  projects: TimelineProject[];
  focusedProject: string | null;
  windowDays: number;
}

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Hook to fetch sprint timeline data from /api/sprint-timeline.
 * Returns segment-based activity data for swimlane visualization.
 * Uses fetchCounter pattern for SSE-triggered refetch.
 */
export function useSprintTimeline(): {
  data: SprintTimelineResponse | null;
  loading: boolean;
  refetch: () => void;
} {
  const [data, setData] = useState<SprintTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchTimeline() {
      setLoading(true);
      try {
        const res = await client.api["sprint-timeline"].$get({
          query: { weeks: "12" },
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch sprint timeline: ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json as unknown as SprintTimelineResponse);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch sprint timeline:", err);
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      }
    }

    fetchTimeline();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { data, loading, refetch };
}
