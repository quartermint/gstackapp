import { and, sql, inArray, isNotNull } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { normalizePath } from "./conflict-detector.js";

export interface ConvergenceResult {
  projectSlug: string;
  sessions: { id: string; status: string }[];
  overlappingFiles: string[];
  detectedAt: string;
}

/**
 * Detect convergence opportunities: sessions on the same project that share
 * overlapping files, where at least one is committed (completed), and all are
 * within a temporal window.
 *
 * Convergence differs from conflict detection:
 * - Conflicts = active sessions editing same files (risk)
 * - Convergence = completed + active sessions with shared files (merge opportunity)
 *
 * @param db Drizzle database instance
 * @param windowMinutes Temporal window in minutes (default 30, inclusive)
 * @returns Array of convergence results, one per project with detected convergence
 */
export function detectConvergence(
  db: DrizzleDb,
  windowMinutes: number = 30
): ConvergenceResult[] {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const windowStart = nowEpoch - windowMinutes * 60;

  // Query sessions that are:
  // - status IN ('active', 'completed') -- exclude abandoned
  // - projectSlug IS NOT NULL
  // - Either still active (endedAt IS NULL) OR ended within the window (endedAt >= windowStart)
  // - Also include active sessions whose startedAt is within the window
  const candidateSessions = db
    .select()
    .from(sessions)
    .where(
      and(
        inArray(sessions.status, ["active", "completed"]),
        isNotNull(sessions.projectSlug),
        sql`(${sessions.endedAt} IS NULL OR ${sessions.endedAt} >= ${windowStart})`
      )
    )
    .all();

  // Group by projectSlug
  const grouped = new Map<string, typeof candidateSessions>();
  for (const session of candidateSessions) {
    const slug = session.projectSlug!;
    let group = grouped.get(slug);
    if (!group) {
      group = [];
      grouped.set(slug, group);
    }
    group.push(session);
  }

  const results: ConvergenceResult[] = [];

  for (const [projectSlug, projectSessions] of grouped) {
    // Need at least 2 sessions
    if (projectSessions.length < 2) continue;

    // Need at least one completed session
    const hasCompleted = projectSessions.some((s) => s.status === "completed");
    if (!hasCompleted) continue;

    // Parse filesJson for each session, skip those without files
    const sessionsWithFiles: Array<{
      id: string;
      status: string;
      cwd: string;
      normalizedFiles: Set<string>;
    }> = [];

    for (const session of projectSessions) {
      if (!session.filesJson) continue;
      let files: string[];
      try {
        files = JSON.parse(session.filesJson) as string[];
      } catch {
        continue;
      }
      if (files.length === 0) continue;

      const normalizedFiles = new Set(
        files.map((f) => normalizePath(f, session.cwd))
      );
      sessionsWithFiles.push({
        id: session.id,
        status: session.status,
        cwd: session.cwd,
        normalizedFiles,
      });
    }

    // Need at least 2 sessions with files
    if (sessionsWithFiles.length < 2) continue;

    // Re-check completed requirement among sessions with files
    const hasCompletedWithFiles = sessionsWithFiles.some(
      (s) => s.status === "completed"
    );
    if (!hasCompletedWithFiles) continue;

    // Find all overlapping files across session pairs
    const allOverlappingFiles = new Set<string>();
    const participatingSessions = new Set<string>();

    for (let i = 0; i < sessionsWithFiles.length; i++) {
      for (let j = i + 1; j < sessionsWithFiles.length; j++) {
        const a = sessionsWithFiles[i]!;
        const b = sessionsWithFiles[j]!;

        // Find intersection
        const overlap: string[] = [];
        for (const file of a.normalizedFiles) {
          if (b.normalizedFiles.has(file)) {
            overlap.push(file);
          }
        }

        if (overlap.length > 0) {
          for (const file of overlap) {
            allOverlappingFiles.add(file);
          }
          participatingSessions.add(a.id);
          participatingSessions.add(b.id);
        }
      }
    }

    if (allOverlappingFiles.size === 0) continue;

    // Build the result with only participating sessions
    const convergenceSessions = sessionsWithFiles
      .filter((s) => participatingSessions.has(s.id))
      .map((s) => ({ id: s.id, status: s.status }));

    // Final check: at least one participating session must be completed
    const hasCompletedParticipant = convergenceSessions.some(
      (s) => s.status === "completed"
    );
    if (!hasCompletedParticipant) continue;

    results.push({
      projectSlug,
      sessions: convergenceSessions,
      overlappingFiles: [...allOverlappingFiles],
      detectedAt: new Date().toISOString(),
    });
  }

  return results;
}
