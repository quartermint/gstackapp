import { useState, useEffect } from "react";

/**
 * Hook that fetches the user's previous visit timestamp and records a new visit.
 *
 * On mount:
 * 1. GET /api/visits/last?clientId=web — stores previousVisitAt (null on first visit / 404)
 * 2. POST /api/visits with { clientId: "web" } — records this visit (sequential, NOT parallel)
 *
 * Visit data is fetched once per page load and never changes during the session.
 */
export function useLastVisit(): {
  previousVisitAt: string | null;
  loading: boolean;
} {
  const [previousVisitAt, setPreviousVisitAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchAndRecord() {
      try {
        // Step 1: GET previous visit
        const getRes = await fetch("/api/visits/last?clientId=web");
        if (getRes.ok) {
          const data = (await getRes.json()) as {
            clientId: string;
            lastVisitAt: string;
            previousVisitAt: string | null;
          };
          if (!cancelled) {
            setPreviousVisitAt(data.previousVisitAt);
          }
        }
        // 404 means first visit — leave previousVisitAt as null

        // Step 2: POST to record this visit (sequential, after GET resolves)
        await fetch("/api/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: "web" }),
        });
      } catch {
        // Network errors: leave previousVisitAt as null, no highlights
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAndRecord();

    return () => {
      cancelled = true;
    };
  }, []);

  return { previousVisitAt, loading };
}
