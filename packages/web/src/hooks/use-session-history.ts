import { useState, useEffect, useCallback } from "react";

/** Shape of a session with endedAt for timeline visualization. */
export interface SessionHistoryItem {
  id: string;
  source: "claude-code" | "aider";
  model: string | null;
  tier: "opus" | "sonnet" | "local" | "unknown";
  projectSlug: string | null;
  cwd: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  lastHeartbeatAt: string | null;
}

/**
 * Group sessions by projectSlug. Null projectSlug maps to "unlinked".
 */
export function groupByProject(
  sessions: SessionHistoryItem[]
): Map<string, SessionHistoryItem[]> {
  const map = new Map<string, SessionHistoryItem[]>();
  for (const s of sessions) {
    const key = s.projectSlug ?? "unlinked";
    const existing = map.get(key);
    if (existing) {
      existing.push(s);
    } else {
      map.set(key, [s]);
    }
  }
  return map;
}

/**
 * Hook to fetch today's sessions (active + completed) for timeline visualization.
 * Uses fetchCounter pattern for SSE-triggered refetch (matches use-convergence.ts).
 */
export function useSessionHistory(): {
  sessions: SessionHistoryItem[];
  loading: boolean;
  refetch: () => void;
} {
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchSessionHistory() {
      setLoading(true);
      try {
        const res = await fetch("/api/sessions?limit=100");
        if (!res.ok) {
          throw new Error(`Failed to fetch session history: ${res.status}`);
        }
        const json = (await res.json()) as {
          sessions: SessionHistoryItem[];
          total: number;
        };
        if (!cancelled) {
          // Filter to today's sessions only
          const today = new Date().toDateString();
          const todaySessions = json.sessions.filter(
            (s) => new Date(s.startedAt).toDateString() === today
          );
          setSessions(todaySessions);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch session history:", err);
        if (!cancelled) {
          setSessions([]);
          setLoading(false);
        }
      }
    }

    fetchSessionHistory();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { sessions, loading, refetch };
}
