import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { listSessionsQuerySchema } from "@mission-control/shared";
import {
  createSession,
  getSession,
  updateSessionHeartbeat,
  updateSessionStatus,
  listSessions,
} from "../db/queries/sessions.js";
import {
  resolveProjectFromCwd,
  shouldDebounceHeartbeat,
  recordHeartbeat,
  clearHeartbeatDebounce,
  bufferFile,
  getBufferedFiles,
} from "../services/session-service.js";
import { eventBus } from "../services/event-bus.js";
import { AppError } from "../lib/errors.js";
import type { DatabaseInstance } from "../db/index.js";
import type { MCConfig } from "../lib/config.js";

// ── Hook Payload Schemas (Claude Code specific, NOT shared API contracts) ──

const hookStartSchema = z
  .object({
    session_id: z.string().min(1),
    cwd: z.string().min(1),
    model: z.string().optional(),
    source: z.string().optional(), // "startup" | "resume" | "clear" | "compact"
    hook_event_name: z.string().optional(),
  })
  .passthrough(); // Accept additional Claude Code fields without failing

const hookHeartbeatSchema = z
  .object({
    session_id: z.string().min(1),
    tool_name: z.string().optional(),
    tool_input: z
      .object({
        file_path: z.string().optional(),
      })
      .optional(),
    hook_event_name: z.string().optional(),
  })
  .passthrough();

const hookStopSchema = z
  .object({
    session_id: z.string().min(1),
    hook_event_name: z.string().optional(),
  })
  .passthrough();

// ── Route Factory ─────────────────────────────────────────────────

/**
 * Create session route handlers wired to a specific database instance.
 * Accepts getConfig for project resolution from cwd.
 */
export function createSessionRoutes(
  getInstance: () => DatabaseInstance,
  getConfig: () => MCConfig | null
) {
  return new Hono()
    .post(
      "/sessions/hook/start",
      zValidator("json", hookStartSchema),
      (c) => {
        try {
          const hook = c.req.valid("json");
          const db = getInstance().db;

          // Check for resume: if session exists and is active, update heartbeat
          try {
            const existing = getSession(db, hook.session_id);
            if (existing.status === "active") {
              updateSessionHeartbeat(db, hook.session_id);
              return c.json({ session: existing });
            }
            // Session exists but is completed/abandoned -- treat as new session
            // (session_id reuse after restart is not expected but handled gracefully)
          } catch {
            // Session not found -- proceed to create
          }

          // Resolve project from cwd
          const config = getConfig();
          const projectSlug = config
            ? resolveProjectFromCwd(hook.cwd, config)
            : null;

          // Create new session
          const session = createSession(
            db,
            {
              sessionId: hook.session_id,
              source: "claude-code",
              model: hook.model ?? null,
              cwd: hook.cwd,
            },
            projectSlug
          );

          // Async event emission (fire-and-forget)
          queueMicrotask(() => {
            eventBus.emit("mc:event", {
              type: "session:started",
              id: session.id,
            });
          });

          return c.json({ session }, 201);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 400
            );
          }
          throw e;
        }
      }
    )
    .post(
      "/sessions/hook/heartbeat",
      zValidator("json", hookHeartbeatSchema),
      (c) => {
        const hook = c.req.valid("json");
        const db = getInstance().db;

        // Extract file path from tool_input
        const filePath = hook.tool_input?.file_path;

        // Always buffer the file path if present
        if (filePath) {
          bufferFile(hook.session_id, filePath);
        }

        // Check debounce
        if (shouldDebounceHeartbeat(hook.session_id)) {
          return c.json({ debounced: true });
        }

        // Record heartbeat timestamp
        recordHeartbeat(hook.session_id);

        // Get buffered files (flushes buffer)
        const filesTouched = getBufferedFiles(hook.session_id);
        const files =
          filesTouched.length > 0
            ? filesTouched
            : filePath
              ? [filePath]
              : undefined;

        // Update session heartbeat (catch silently -- session may not exist yet)
        try {
          updateSessionHeartbeat(db, hook.session_id, files);
        } catch {
          // Session may not exist if hook fires before start processes
        }

        return c.json({ ok: true });
      }
    )
    .post(
      "/sessions/hook/stop",
      zValidator("json", hookStopSchema),
      (c) => {
        const hook = c.req.valid("json");
        const db = getInstance().db;

        try {
          const session = updateSessionStatus(
            db,
            hook.session_id,
            "completed"
          );

          // Clean up debounce state
          clearHeartbeatDebounce(hook.session_id);

          // Async event emission (fire-and-forget)
          queueMicrotask(() => {
            eventBus.emit("mc:event", {
              type: "session:ended",
              id: session.id,
            });
          });

          return c.json({ session });
        } catch {
          // Stop for unknown session is not an error -- hook may fire
          // for sessions started before MC was running
          return c.json({ ok: true });
        }
      }
    )
    .get(
      "/sessions",
      zValidator("query", listSessionsQuerySchema),
      (c) => {
        try {
          const query = c.req.valid("query");
          const db = getInstance().db;
          const result = listSessions(db, query);
          return c.json(result);
        } catch (e) {
          if (e instanceof AppError) {
            return c.json(
              { error: { code: e.code, message: e.message } },
              e.status as 400
            );
          }
          throw e;
        }
      }
    );
}
