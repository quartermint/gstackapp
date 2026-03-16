import { eq } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { updateSessionStatus } from "../db/queries/sessions.js";
import { eventBus } from "./event-bus.js";
import type { MCConfig } from "../lib/config.js";

// ── Project Resolution ────────────────────────────────────────────

/**
 * Resolve a working directory to a project slug using mc.config.json paths.
 * Uses exact match first, then prefix match (longest wins).
 * No git remote URL fallback -- deferred per CONTEXT.md decision.
 */
export function resolveProjectFromCwd(cwd: string, config: MCConfig): string | null {
  let bestMatch: { slug: string; pathLength: number } | null = null;

  for (const project of config.projects) {
    // Collect all paths for this project (multi-copy or single)
    const paths: string[] = [];
    if ("copies" in project) {
      for (const copy of project.copies) {
        paths.push(copy.path);
      }
    } else {
      paths.push(project.path);
    }

    for (const projectPath of paths) {
      // Exact match
      if (cwd === projectPath) {
        // Exact match is the best possible -- return immediately
        return project.slug;
      }

      // Prefix match (cwd is inside the project directory)
      if (cwd.startsWith(projectPath + "/")) {
        if (!bestMatch || projectPath.length > bestMatch.pathLength) {
          bestMatch = { slug: project.slug, pathLength: projectPath.length };
        }
      }
    }
  }

  return bestMatch?.slug ?? null;
}

// ── Heartbeat Debounce ────────────────────────────────────────────

const DEBOUNCE_MS = 10_000; // 10 seconds

/** Tracks the last heartbeat timestamp per session for debouncing. */
const heartbeatTimestamps = new Map<string, number>();

/**
 * Check whether a heartbeat for this session should be debounced (skipped).
 * Returns true if a heartbeat was recorded within DEBOUNCE_MS.
 */
export function shouldDebounceHeartbeat(sessionId: string): boolean {
  const lastTimestamp = heartbeatTimestamps.get(sessionId);
  if (lastTimestamp !== undefined && Date.now() - lastTimestamp < DEBOUNCE_MS) {
    return true;
  }
  return false;
}

/**
 * Record a heartbeat timestamp for debounce tracking.
 */
export function recordHeartbeat(sessionId: string): void {
  heartbeatTimestamps.set(sessionId, Date.now());
}

/**
 * Clear heartbeat debounce state for a session (called on session stop).
 */
export function clearHeartbeatDebounce(sessionId: string): void {
  heartbeatTimestamps.delete(sessionId);
}

// ── File Buffering ────────────────────────────────────────────────

/** Buffers file paths between debounced heartbeats. */
const fileBuffer = new Map<string, Set<string>>();

/**
 * Buffer a file path for a session. When heartbeats are debounced,
 * file paths accumulate here and flush on the next non-debounced heartbeat.
 */
export function bufferFile(sessionId: string, filePath: string): void {
  let files = fileBuffer.get(sessionId);
  if (!files) {
    files = new Set<string>();
    fileBuffer.set(sessionId, files);
  }
  files.add(filePath);
}

/**
 * Get all buffered files for a session and clear the buffer.
 */
export function getBufferedFiles(sessionId: string): string[] {
  const files = fileBuffer.get(sessionId);
  fileBuffer.delete(sessionId);
  return files ? [...files] : [];
}

// ── Session Reaper ────────────────────────────────────────────────

const REAPER_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Mark active sessions with no heartbeat for 15+ minutes as abandoned.
 * Returns the count of reaped sessions.
 */
export function reapAbandonedSessions(db: DrizzleDb): number {
  try {
    const cutoff = new Date(Date.now() - REAPER_THRESHOLD_MS);

    // Get all active sessions
    const activeSessions = db
      .select()
      .from(sessions)
      .where(eq(sessions.status, "active"))
      .all();

    let reaped = 0;

    for (const session of activeSessions) {
      // Use lastHeartbeatAt if available, otherwise startedAt
      const lastActivity = session.lastHeartbeatAt ?? session.startedAt;
      if (lastActivity.getTime() < cutoff.getTime()) {
        updateSessionStatus(db, session.id, "abandoned", "no heartbeat for 15+ minutes");
        eventBus.emit("mc:event", { type: "session:abandoned", id: session.id });
        // Clean up debounce and file buffer state
        heartbeatTimestamps.delete(session.id);
        fileBuffer.delete(session.id);
        reaped++;
      }
    }

    return reaped;
  } catch (err) {
    console.error("Session reaper error:", err);
    return 0;
  }
}

/**
 * Start a recurring timer that reaps abandoned sessions.
 * Default interval: 3 minutes (180_000ms).
 */
export function startSessionReaper(
  db: DrizzleDb,
  intervalMs: number = 180_000
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    try {
      const reaped = reapAbandonedSessions(db);
      if (reaped > 0) {
        console.log(`Session reaper: marked ${reaped} session(s) as abandoned`);
      }
    } catch (err) {
      console.error("Session reaper failed:", err);
    }
  }, intervalMs);
}
