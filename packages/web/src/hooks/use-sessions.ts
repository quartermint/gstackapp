import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client.js";

/** Shape of an active session from GET /api/sessions. */
export interface SessionItem {
  id: string;
  source: "claude-code" | "aider";
  model: string | null;
  tier: "opus" | "sonnet" | "local" | "unknown";
  projectSlug: string | null;
  cwd: string;
  status: string;
  startedAt: string;
  lastHeartbeatAt: string | null;
}

/**
 * Derive per-project session counts from an array of active sessions.
 * Skips sessions with null projectSlug.
 */
export function deriveSessionCounts(
  sessions: SessionItem[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.projectSlug) {
      counts[s.projectSlug] = (counts[s.projectSlug] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Hook to fetch active sessions from GET /api/sessions?status=active.
 * Uses fetchCounter pattern for SSE-triggered refetch (matches use-risks.ts).
 */
export function useSessions(): {
  sessions: SessionItem[];
  loading: boolean;
  refetch: () => void;
} {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchSessions() {
      setLoading(true);
      try {
        const res = await client.api.sessions.$get({
          query: { status: "active" },
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch sessions: ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setSessions(
            (json as unknown as { sessions: SessionItem[] }).sessions
          );
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch sessions:", err);
        if (!cancelled) {
          setSessions([]);
          setLoading(false);
        }
      }
    }

    fetchSessions();

    return () => {
      cancelled = true;
    };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { sessions, loading, refetch };
}
