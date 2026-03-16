import { eq, and } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { DrizzleDb } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { upsertHealthFinding } from "../db/queries/health.js";
import { eventBus } from "./event-bus.js";
import { resolve } from "node:path";

export interface SessionConflict {
  projectSlug: string;
  sessionA: string;
  sessionB: string;
  conflictingFiles: string[];
}

/**
 * Normalize a file path -- if absolute return as-is, otherwise resolve relative to cwd.
 */
export function normalizePath(filePath: string, cwd: string): string {
  if (filePath.startsWith("/")) {
    return filePath;
  }
  return resolve(cwd, filePath);
}

/**
 * Detect file-level conflicts between the triggering session and other active
 * sessions on the same project. Returns an array of conflicts (one per
 * overlapping peer session).
 */
export function detectConflicts(
  db: DrizzleDb,
  triggeringSessionId: string,
  projectSlug: string
): SessionConflict[] {
  const activeSessions = db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.projectSlug, projectSlug),
        eq(sessions.status, "active")
      )
    )
    .all();

  if (activeSessions.length < 2) {
    return [];
  }

  const triggering = activeSessions.find((s) => s.id === triggeringSessionId);
  if (!triggering || !triggering.filesJson) {
    return [];
  }

  let triggeringFiles: string[];
  try {
    triggeringFiles = JSON.parse(triggering.filesJson) as string[];
  } catch {
    return [];
  }

  const normalizedTriggeringFiles = new Set(
    triggeringFiles.map((f) => normalizePath(f, triggering.cwd))
  );

  const conflicts: SessionConflict[] = [];

  for (const other of activeSessions) {
    if (other.id === triggeringSessionId) continue;
    if (!other.filesJson) continue;

    let otherFiles: string[];
    try {
      otherFiles = JSON.parse(other.filesJson) as string[];
    } catch {
      continue;
    }

    const normalizedOtherFiles = otherFiles.map((f) =>
      normalizePath(f, other.cwd)
    );

    const overlapping = normalizedOtherFiles.filter((f) =>
      normalizedTriggeringFiles.has(f)
    );

    if (overlapping.length > 0) {
      conflicts.push({
        projectSlug,
        sessionA: triggeringSessionId,
        sessionB: other.id,
        conflictingFiles: overlapping,
      });
    }
  }

  return conflicts;
}

/**
 * Persist conflict findings to project_health and emit SSE events.
 */
export function emitConflicts(
  db: DrizzleDb,
  sqlite: Database.Database,
  conflicts: SessionConflict[]
): void {
  for (const conflict of conflicts) {
    upsertHealthFinding(db, sqlite, {
      projectSlug: conflict.projectSlug,
      checkType: "session_file_conflict",
      severity: "warning",
      detail: `${conflict.conflictingFiles.length} file(s) being edited in parallel sessions`,
      metadata: {
        sessionA: conflict.sessionA,
        sessionB: conflict.sessionB,
        files: conflict.conflictingFiles,
        type: "session",
      },
    });

    queueMicrotask(() => {
      eventBus.emit("mc:event", {
        type: "session:conflict",
        id: conflict.sessionA,
        data: {
          sessionB: conflict.sessionB,
          projectSlug: conflict.projectSlug,
          conflictingFiles: conflict.conflictingFiles,
        },
      });
    });
  }
}

/**
 * Resolve any session_file_conflict findings that involve the given session ID
 * (either as sessionA or sessionB in metadata).
 */
export function resolveSessionConflicts(
  sqlite: Database.Database,
  sessionId: string
): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `UPDATE project_health
       SET resolved_at = ?
       WHERE check_type = 'session_file_conflict'
         AND resolved_at IS NULL
         AND (json_extract(metadata, '$.sessionA') = ? OR json_extract(metadata, '$.sessionB') = ?)`
    )
    .run(now, sessionId, sessionId);
}
