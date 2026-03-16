import { useState, useEffect } from "react";
import { client } from "../api/client.js";

/** Shape of a single health finding from /api/health-checks/:slug. */
export interface HealthFinding {
  id: number;
  projectSlug: string;
  checkType: string;
  severity: string;
  detail: string;
  metadata: Record<string, unknown> | null;
  detectedAt: string;
  resolvedAt: string | null;
  isNew: boolean;
}

/**
 * Lazy-fetch hook for per-project health findings.
 * Only fetches when slug is non-null (i.e., when the findings panel is expanded).
 * Returns findings, riskLevel, and loading state.
 */
export function useProjectHealth(slug: string | null): {
  findings: HealthFinding[];
  riskLevel: string;
  loading: boolean;
} {
  const [findings, setFindings] = useState<HealthFinding[]>([]);
  const [riskLevel, setRiskLevel] = useState<string>("unmonitored");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug) {
      setFindings([]);
      setRiskLevel("unmonitored");
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function fetchHealth() {
      try {
        const res = await client.api["health-checks"][":slug"].$get({
          param: { slug: slug! },
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch health for ${slug}: ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setFindings(json.findings as unknown as HealthFinding[]);
          setRiskLevel((json.riskLevel as string) ?? "unmonitored");
          setLoading(false);
        }
      } catch (err) {
        console.error(`Failed to fetch health for ${slug}:`, err);
        if (!cancelled) {
          setFindings([]);
          setRiskLevel("unmonitored");
          setLoading(false);
        }
      }
    }

    fetchHealth();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { findings, riskLevel, loading };
}

/**
 * Extract convergence data from health findings for a specific project.
 * Returns session count and file count, or null if no convergence is detected.
 */
export function getConvergenceForProject(
  findings: HealthFinding[],
  projectSlug: string
): { sessionCount: number; fileCount: number } | null {
  const convergenceFinding = findings.find(
    (f) => f.projectSlug === projectSlug && f.checkType === "convergence"
  );
  if (!convergenceFinding || !convergenceFinding.metadata) return null;

  const metadata = convergenceFinding.metadata as Record<string, unknown>;
  const sessions = (metadata.sessions as Array<{ id: string }>) ?? [];
  const files = (metadata.overlappingFiles as string[]) ?? [];

  return { sessionCount: sessions.length, fileCount: files.length };
}
