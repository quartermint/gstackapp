# Phase 12: Session Ingestion - Research

**Researched:** 2026-03-16
**Domain:** HTTP hook ingestion, session lifecycle API, project resolution, background reaping
**Confidence:** HIGH

## Summary

Phase 12 builds the session ingestion layer: HTTP endpoints that receive Claude Code hook events (SessionStart, PostToolUse, Stop), a session service that resolves cwd to projects and manages debouncing, a background reaper for abandoned sessions, and passive Aider detection via git log during the existing scan cycle. Phase 11 already delivered the complete data foundation -- sessions table, Drizzle schema, query module with full CRUD, Zod schemas in shared package, model tier derivation, and event bus types. Phase 12 wires this into live HTTP endpoints and external hook configuration.

The CONTEXT.md decisions lock the implementation to HTTP hooks (no shell scripts needed), `Write|Edit`-only PostToolUse matching, server-side 10-second heartbeat debounce, cwd resolution against mc.config.json (not the projects DB table), and passive Aider detection via git commit author matching. All response handling must be < 50ms via `queueMicrotask` for async processing.

**Primary recommendation:** Build three route handlers (start/heartbeat/stop), a session service with project resolution + debounce + reaper, configure Claude Code HTTP hooks in settings.json, and add Aider detection to the existing scan cycle. The data layer is complete -- this phase is pure wiring.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- HTTP hooks POST to MC API -- no shell scripts needed
- SessionStart hook: POST /api/sessions with session_id, model, cwd, tool metadata
- PostToolUse hook: POST /api/sessions/:id/heartbeat -- matcher narrowed to `Write|Edit` only
  - Server-side debounce: accept but deduplicate within 10-second window per session
  - files_touched accumulated as cumulative set (not per-heartbeat)
- Stop hook: POST /api/sessions/:id/stop -- marks session completed
- All hook responses return immediately (< 50ms) -- processing is async via queueMicrotask
- Match session cwd against tracked projects in mc.config.json (not projects DB table)
- Resolution chain: exact path match -> prefix match -> git remote URL fallback
- For worktrees: `cwd` like `/path/project-wt-1234/` -> resolve to `/path/project/` primary
- For subagents: inherit projectSlug from parent session if available
- Unresolvable sessions get `projectSlug: null` -- still tracked, just unlinked
- Background timer every 2-5 minutes for session reaper
- Sessions with no heartbeat for 15+ minutes -> mark as `abandoned`
- Same `setInterval` pattern as existing project scanner (5-min cycle)
- Aider passive detection via `git log --author="(aider)" --since="30 minutes ago"` during project scan cycle
- Create completed session records with `tool: aider`, `status: completed`
- No wrapper script -- zero UX friction
- Use Claude Code's `session_id` from hook data as the external ID
- MC generates its own internal UUID (text primary key, matching existing pattern)
- Map external -> internal via unique index on external session_id

### Claude's Discretion
None specified -- all key decisions are locked.

### Deferred Ideas (OUT OF SCOPE)
- SubagentStart/SubagentStop hooks -- fold into parent session for v1.2, revisit if needed
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SESS-01 | Claude Code sessions report activity to MC API via HTTP hooks (SessionStart, PostToolUse for Write/Edit, Stop) | Claude Code HTTP hook payload format documented; settings.json hook config pattern verified; existing hook infrastructure analyzed |
| SESS-03 | Session reaper marks sessions with no heartbeat for 15+ minutes as abandoned | setInterval pattern from project-scanner.ts; reaper query against lastHeartbeatAt column already in schema |
| SESS-04 | Sessions resolve to tracked projects via cwd prefix matching with git remote URL fallback | mc.config.json project paths analyzed; resolution chain (exact -> prefix -> git remote) documented |
| SESS-05 | Aider sessions detected passively via git commit attribution during scan cycle | git log --author pattern verified; scan cycle integration point identified in project-scanner.ts |
| SESS-06 | Hook scripts are fire-and-forget (<100ms), backgrounded curl, always exit 0 | HTTP hooks have built-in timeout; MC API returns 200 immediately with queueMicrotask for async work |
| API-01 | POST /api/sessions -- create/start session from hook data | Route pattern from captures.ts; createSession query module from Phase 11; Zod validation via shared schemas |
| API-02 | POST /api/sessions/:id/heartbeat -- update files touched, last activity | updateSessionHeartbeat query from Phase 11; debounce logic needed in service layer |
| API-03 | POST /api/sessions/:id/stop -- mark session completed | updateSessionStatus query from Phase 11; event bus emission pattern |
| API-04 | GET /api/sessions -- list sessions with filters (status, project, tool) | listSessions query from Phase 11 already supports status/projectSlug/source filters |
</phase_requirements>

## Standard Stack

### Core (All Existing -- No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | 4.x | Route handlers for session API | Already in use for all routes |
| @hono/zod-validator | * | Request validation | Already in use for all routes |
| Drizzle ORM | * | Session queries | Already in use; Phase 11 built query module |
| better-sqlite3 | * | Database engine | Already in use |
| Zod | * | Schema validation in shared package | Already in use; Phase 11 built session schemas |

### Supporting (All Existing)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:child_process | built-in | `execFile` for git log in Aider detection | During scan cycle |
| node:events | built-in | EventEmitter for SSE events | session:started, session:ended, session:abandoned |

### Alternatives Considered

None. This phase requires zero new dependencies. All tooling exists from v1.0/v1.1 and Phase 11.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

```
packages/api/src/
├── routes/
│   └── sessions.ts          # NEW: session lifecycle endpoints (POST start/heartbeat/stop, GET list)
├── services/
│   └── session-service.ts   # NEW: project resolution, debounce, reaper timer, aider detection
├── db/queries/
│   └── sessions.ts          # EXISTS (Phase 11): createSession, getSession, listSessions, updateHeartbeat, updateStatus
├── lib/
│   ├── model-tier.ts        # EXISTS (Phase 11): deriveModelTier
│   └── config.ts            # EXISTS: MCConfig type, project entries
└── __tests__/
    ├── routes/
    │   └── sessions.test.ts  # NEW: route integration tests
    └── services/
        └── session-service.test.ts  # NEW: service unit tests

packages/shared/src/schemas/
└── session.ts               # EXISTS (Phase 11): all Zod schemas

~/.claude/settings.json      # MODIFIED: add HTTP hooks for SessionStart, PostToolUse, Stop
```

### Pattern 1: Route Factory with DB Injection (from captures.ts)

**What:** Routes created via factory function receiving `getInstance` and optionally `config`. Hono method chaining preserves RPC type graph.
**When to use:** The session routes file.
**Example:**

```typescript
// Source: packages/api/src/routes/captures.ts pattern
export function createSessionRoutes(
  getInstance: () => DatabaseInstance,
  getConfig: () => MCConfig | null
) {
  return new Hono()
    .post(
      "/sessions",
      zValidator("json", createSessionSchema),
      (c) => {
        const data = c.req.valid("json");
        const config = getConfig();
        // Resolve project, create session, emit event
        // Return 200 immediately -- async work via queueMicrotask
        return c.json({ session }, 201);
      }
    )
    // ... heartbeat, stop, list endpoints
}
```

### Pattern 2: Async Processing via queueMicrotask (from captures.ts)

**What:** Route handler returns response immediately. Side effects (event emission, enrichment) happen via `queueMicrotask`.
**When to use:** All three POST endpoints must return < 50ms. Project resolution and event emission happen after response.
**Example:**

```typescript
// Source: packages/api/src/routes/captures.ts line 49
queueMicrotask(() => {
  enrichCapture(getInstance().db, capture.id).catch((err) => {
    console.error(`Enrichment failed for capture ${capture.id}:`, err);
  });
});
return c.json({ capture }, 201);
```

**Critical note:** For session ingestion, the core DB write (createSession, updateHeartbeat, updateStatus) MUST happen synchronously before the response -- only ancillary work (SSE emission) goes into queueMicrotask. This ensures the session exists in DB even if MC crashes during async processing.

### Pattern 3: Background Timer with Cleanup (from project-scanner.ts)

**What:** `setInterval` started in `index.ts`, cleaned up on SIGTERM/SIGINT.
**When to use:** Session reaper (every 2-5 minutes).
**Example:**

```typescript
// Source: packages/api/src/index.ts lines 53-66
let reaperTimer: ReturnType<typeof setInterval> | null = null;

reaperTimer = startSessionReaper(db, 180_000); // 3 minutes
console.log("Session reaper started (3-minute interval)");

// In shutdown():
if (reaperTimer) {
  clearInterval(reaperTimer);
  reaperTimer = null;
}
```

### Pattern 4: CWD-to-Project Resolution Against Config

**What:** Match session `cwd` against `config.projects[].path` using a resolution chain.
**When to use:** Every POST /api/sessions call.
**Resolution chain:**
1. Exact path match: `cwd === project.path`
2. Prefix match: `cwd.startsWith(project.path + "/")`  (longest match wins)
3. Git remote URL fallback: shell out to `git remote get-url origin` in cwd, match against project configs
4. For multi-copy entries: check all `copies[].path` values

**Example:**

```typescript
export function resolveProjectFromCwd(
  cwd: string,
  config: MCConfig
): string | null {
  let bestMatch: { slug: string; pathLength: number } | null = null;

  for (const project of config.projects) {
    const paths: string[] = [];
    if ("copies" in project) {
      for (const copy of project.copies) paths.push(copy.path);
    } else {
      if (project.path) paths.push(project.path);
    }

    for (const projectPath of paths) {
      if (!projectPath) continue;
      if (cwd === projectPath || cwd.startsWith(projectPath + "/")) {
        if (!bestMatch || projectPath.length > bestMatch.pathLength) {
          bestMatch = { slug: project.slug, pathLength: projectPath.length };
        }
      }
    }
  }

  return bestMatch?.slug ?? null;
}
```

### Pattern 5: HTTP Hook Configuration in settings.json

**What:** Claude Code HTTP hooks send the event JSON as POST body with Content-Type: application/json.
**When to use:** Configuring SessionStart, PostToolUse (Write|Edit), and Stop hooks.
**Example:**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://100.x.x.x:3000/api/sessions",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "http",
            "url": "http://100.x.x.x:3000/api/sessions/hook/heartbeat",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://100.x.x.x:3000/api/sessions/hook/stop",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**Important design consideration:** The HTTP hook POSTs the raw Claude Code event payload -- it does NOT transform the data. The MC API must accept Claude Code's native payload format directly (with `session_id`, `cwd`, `model`, `tool_name`, `tool_input.file_path`, etc.) or have a translation layer. Two approaches:

1. **Direct acceptance:** Create route handlers that parse Claude Code's native JSON directly (map `session_id` to `sessionId`, extract `tool_input.file_path` to `filesTouched`, etc.)
2. **Hook-specific endpoints:** Create `/api/sessions/hook/start`, `/api/sessions/hook/heartbeat`, `/api/sessions/hook/stop` endpoints that accept raw Claude Code payloads and translate internally.

**Recommendation:** Approach 2 (hook-specific endpoints). This keeps the clean API (`POST /api/sessions`, `POST /api/sessions/:id/heartbeat`) separate from the hook translation layer. The hook endpoints are thin wrappers that parse Claude Code's format and call the canonical API. This also means future non-hook clients (CLI, dashboard admin) use the clean API without dealing with hook payload format.

### Pattern 6: Aider Detection in Scan Cycle

**What:** During `scanAllProjects`, after scanning a local repo, check `git log --author="(aider)" --since="30 minutes ago"` for recent Aider commits.
**When to use:** Integrated into the existing scan cycle, not a separate timer.
**Example:**

```typescript
// Inside scanAllProjects, after scanning a local repo:
if (target.host === "local" && scanResult) {
  await detectAiderSessions(target.path, target.slug, db);
}

async function detectAiderSessions(
  repoPath: string,
  projectSlug: string,
  db: DrizzleDb
): Promise<void> {
  try {
    const result = await execFile(
      "git",
      ["log", "--author=(aider)", "--since=30 minutes ago", "--format=%H|%aI|%s"],
      { cwd: repoPath, timeout: 5_000 }
    );
    // Parse commits, create completed session records if not already tracked
  } catch {
    // Silently ignore -- Aider detection is best-effort
  }
}
```

### Anti-Patterns to Avoid

- **Blocking hook response on DB write + event emission + project resolution:** The DB write must be synchronous (ensures data persists), but event emission and project resolution can be async. However, for session START, project resolution should happen before the response so the session is immediately linked.
- **Emitting SSE events for every heartbeat:** Only emit SSE for state transitions (started, ended, abandoned, conflict). Heartbeats are silent updates.
- **Using session_id directly as primary key without considering duplicates:** Claude Code sends `session_id` for each event in a session. A "resume" event sends `source: "resume"` with the same session_id. The POST /api/sessions handler must handle upsert for resumed sessions.
- **Matching PostToolUse on Bash tool:** Bash commands can create/modify files, but the CONTEXT.md locks the matcher to `Write|Edit` only. Don't add Bash.
- **Running git commands in heartbeat handler:** Git operations are slow (10-100ms). Never run git in the heartbeat path. Only use git in the scan cycle (Aider detection) and optionally in session start (git remote fallback).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session state machine | xstate or custom FSM library | Simple status update in updateSessionStatus | Only 3 states (active/completed/abandoned), 4 transitions |
| Heartbeat debounce | Rate limiting middleware | In-memory Map with timestamp check per session | 10-second window, single-user system, trivial logic |
| Background timer | cron library, node-schedule | setInterval + clearInterval | Matches project-scanner.ts pattern exactly |
| Hook payload parsing | Custom parser | Zod schemas for validation | Already the project standard |
| Project path matching | glob or minimatch | Simple string startsWith | Exact + prefix matching is all that's needed |

**Key insight:** Phase 12 is pure wiring -- connecting Claude Code's hook system to the data layer Phase 11 built. No new abstractions or libraries needed.

## Common Pitfalls

### Pitfall 1: Hook Timeout Kills Session Tracking
**What goes wrong:** Claude Code HTTP hook has a default 30-second timeout, but if the MC API takes > timeout to respond, the hook fails silently. More critically, Claude Code may retry or skip the hook entirely.
**Why it happens:** The route handler does too much work synchronously (project resolution with git fallback, event emission, etc.).
**How to avoid:** All three POST handlers MUST return within 50ms. DB write is fast (< 5ms for SQLite). Project resolution from config is fast (in-memory loop). Git remote fallback must be deferred (async backfill). Set hook timeout to 5 seconds as safety net.
**Warning signs:** Sessions appear in dashboard intermittently or with null projectSlug.

### Pitfall 2: Duplicate Sessions from Resume Events
**What goes wrong:** Claude Code SessionStart fires with `source: "resume"` when a session is resumed (e.g., after idle timeout or manual `claude --continue`). A naive POST /api/sessions creates a duplicate row.
**Why it happens:** The `session_id` is the same across start/resume/compact/clear events. The `source` field in SessionStart indicates *why* the session started, not the tool source.
**How to avoid:** Use upsert logic: if session with this `session_id` already exists and is active, update `lastHeartbeatAt` instead of creating new. Only create if session doesn't exist.
**Warning signs:** Multiple "active" sessions with the same external ID.

### Pitfall 3: Session ID Mapping Confusion
**What goes wrong:** CONTEXT.md says "MC generates its own internal UUID" and "map external -> internal via unique index." But Phase 11's `createSession` query uses `data.sessionId` directly as the primary key (`id: data.sessionId`). The schema has no separate `externalSessionId` column.
**Why it happens:** The schema was built in Phase 11 with `id` as the session's primary key, set to the Claude Code `session_id` value.
**How to avoid:** Use the Claude Code `session_id` directly as the `id` column (already the Phase 11 pattern). The CONTEXT.md aspiration for separate internal/external IDs can be deferred -- it adds complexity with no benefit for single-user v1.2. The Phase 11 schema already handles this correctly.
**Warning signs:** N/A -- this is a design clarification, not a runtime issue.

### Pitfall 4: PostToolUse Payload Has Nested File Path
**What goes wrong:** The heartbeat handler expects `filesTouched: ["path"]` in the request body, but Claude Code's PostToolUse payload has the file path nested at `tool_input.file_path`.
**Why it happens:** The HTTP hook sends the raw Claude Code event payload, not a pre-transformed payload.
**How to avoid:** The hook-specific endpoint (`/api/sessions/hook/heartbeat`) must extract `tool_input.file_path` from the raw payload and transform it into the canonical heartbeat format before calling the query module.
**Warning signs:** `filesJson` is always null despite active Write/Edit operations.

### Pitfall 5: Existing PostToolUse Hooks Interfere
**What goes wrong:** The existing `PostToolUse` hooks in settings.json use empty matchers (match everything). Adding a new PostToolUse hook for `Write|Edit` might conflict or run in unexpected order with `context-warning.sh` and `gsd-context-monitor.js`.
**Why it happens:** Claude Code runs all matching hooks for each event. Multiple PostToolUse hooks are additive, not exclusive.
**How to avoid:** This is actually fine -- Claude Code runs all matching hooks. The new HTTP hook with `"matcher": "Write|Edit"` will fire alongside the existing hooks. No conflict. Just ensure the HTTP hook entry is added as a new array element, not replacing existing ones.
**Warning signs:** Existing hooks stop working after adding session hooks.

### Pitfall 6: Aider Detection Creates Duplicate Sessions
**What goes wrong:** The scan cycle runs every 5 minutes. Each scan checks `git log --author="(aider)" --since="30 minutes ago"`. The same Aider commits appear in multiple scan cycles, creating duplicate session records.
**Why it happens:** The 30-minute window overlaps across multiple 5-minute scan cycles.
**How to avoid:** Use the commit hash as a dedup key. Before creating an Aider session, check if a session already exists for that commit hash (or set of commits). Store the commit hash in the session metadata or use it as part of the session ID (e.g., `aider-<commit_hash>`).
**Warning signs:** Multiple Aider sessions for the same commit in the sessions list.

## Code Examples

### Hook-Specific Endpoint: Session Start

```typescript
// Source: Claude Code hooks reference (code.claude.com/docs/en/hooks)
// The HTTP hook sends the raw SessionStart payload:
// { session_id, cwd, model, source, hook_event_name, ... }

// Hook endpoint that translates Claude Code format to MC format
const hookStartSchema = z.object({
  session_id: z.string().min(1),
  cwd: z.string().min(1),
  model: z.string().optional(),
  source: z.string().optional(), // "startup" | "resume" | "clear" | "compact"
  hook_event_name: z.string().optional(),
});

app.post("/sessions/hook/start", zValidator("json", hookStartSchema), (c) => {
  const hook = c.req.valid("json");

  // Check for resume -- update existing session instead of creating new
  try {
    const existing = getSession(db, hook.session_id);
    if (existing.status === "active") {
      updateSessionHeartbeat(db, hook.session_id);
      return c.json({ session: existing });
    }
  } catch {
    // Session doesn't exist -- create new
  }

  const projectSlug = config
    ? resolveProjectFromCwd(hook.cwd, config)
    : null;

  const session = createSession(db, {
    sessionId: hook.session_id,
    source: "claude-code",
    model: hook.model ?? null,
    cwd: hook.cwd,
  });

  // Backfill projectSlug (createSession doesn't set it)
  if (projectSlug) {
    // Update session with resolved project
  }

  queueMicrotask(() => {
    eventBus.emit("mc:event", { type: "session:started", id: session.id });
  });

  return c.json({ session }, 201);
});
```

### Hook-Specific Endpoint: Heartbeat

```typescript
// Source: Claude Code hooks reference (code.claude.com/docs/en/hooks)
// PostToolUse payload: { session_id, tool_name, tool_input: { file_path }, ... }

const hookHeartbeatSchema = z.object({
  session_id: z.string().min(1),
  tool_name: z.string().optional(),
  tool_input: z.object({
    file_path: z.string().optional(),
  }).optional(),
  hook_event_name: z.string().optional(),
});

// In-memory debounce map: session_id -> last heartbeat timestamp
const heartbeatDebounce = new Map<string, number>();
const DEBOUNCE_MS = 10_000; // 10 seconds

app.post("/sessions/hook/heartbeat", zValidator("json", hookHeartbeatSchema), (c) => {
  const hook = c.req.valid("json");

  // Debounce: skip if < 10 seconds since last heartbeat for this session
  const now = Date.now();
  const lastBeat = heartbeatDebounce.get(hook.session_id);
  if (lastBeat && now - lastBeat < DEBOUNCE_MS) {
    return c.json({ debounced: true });
  }
  heartbeatDebounce.set(hook.session_id, now);

  // Extract file path from tool_input
  const filePath = hook.tool_input?.file_path;
  const filesTouched = filePath ? [filePath] : undefined;

  try {
    updateSessionHeartbeat(db, hook.session_id, filesTouched);
  } catch {
    // Session doesn't exist -- silently ignore (hook fired before start processed)
  }

  return c.json({ ok: true });
});
```

### Session Reaper

```typescript
// Source: project-scanner.ts startBackgroundPoll pattern

const REAPER_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export function reapAbandonedSessions(db: DrizzleDb): number {
  const cutoff = new Date(Date.now() - REAPER_THRESHOLD_MS);

  // Find active sessions with lastHeartbeatAt (or startedAt) older than cutoff
  const stale = db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.status, "active"),
        // No heartbeat and started > 15 min ago, OR last heartbeat > 15 min ago
      )
    )
    .all();

  let count = 0;
  for (const session of stale) {
    const lastActivity = session.lastHeartbeatAt ?? session.startedAt;
    if (lastActivity.getTime() < cutoff.getTime()) {
      updateSessionStatus(db, session.id, "abandoned", "no heartbeat for 15+ minutes");
      eventBus.emit("mc:event", { type: "session:abandoned", id: session.id });
      count++;
    }
  }

  return count;
}

export function startSessionReaper(
  db: DrizzleDb,
  intervalMs: number = 180_000 // 3 minutes
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
```

### Project Resolution from Config

```typescript
// Source: mc.config.json structure + project-scanner.ts flattenToScanTargets pattern

export function resolveProjectFromCwd(
  cwd: string,
  config: MCConfig
): string | null {
  let bestMatch: { slug: string; pathLength: number } | null = null;

  for (const project of config.projects) {
    const paths: string[] = [];

    if ("copies" in project) {
      for (const copy of project.copies) {
        paths.push(copy.path);
      }
    } else {
      if (project.path) paths.push(project.path);
    }

    for (const projectPath of paths) {
      if (!projectPath) continue;
      // Exact match or prefix match (cwd is inside project directory)
      if (cwd === projectPath || cwd.startsWith(projectPath + "/")) {
        // Longest path wins (most specific match)
        if (!bestMatch || projectPath.length > bestMatch.pathLength) {
          bestMatch = { slug: project.slug, pathLength: projectPath.length };
        }
      }
    }
  }

  return bestMatch?.slug ?? null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shell command hooks (bash scripts) | HTTP hooks (direct POST) | Claude Code late 2025 | No intermediate shell script needed; hook sends JSON as POST body directly |
| session_id via environment variable | session_id in hook JSON payload | Claude Code hooks v2 | Reliable session tracking via structured JSON, not env vars |
| SessionEnd hook | Stop hook (SessionEnd is separate) | Claude Code hooks maturation | Stop fires when Claude finishes responding; SessionEnd on terminal close |
| Broad PostToolUse matcher | Tool-specific matchers (Write\|Edit) | Always available | Prevents heartbeat flood from Read/Grep/Glob |

**Key clarification on hook events:**
- **Stop** fires when Claude finishes its response (graceful completion)
- The `source` field in SessionStart indicates: `startup` (new), `resume` (continued), `clear` (cleared context), `compact` (after compaction)
- HTTP hooks receive the full event JSON as POST body with `Content-Type: application/json`
- Non-2xx responses from the hook endpoint are non-blocking errors -- Claude Code continues normally

## Open Questions

1. **Session ID for Aider sessions**
   - What we know: Aider doesn't have a session_id. We generate one based on git commits.
   - What's unclear: Should Aider session ID be `aider-<commit_hash>` (per commit) or `aider-<timestamp>-<slug>` (per detected batch)?
   - Recommendation: Use `aider-<commit_hash>` for dedup safety. One session per Aider commit batch (group commits within a short time window).

2. **Project resolution for sessions with cwd outside any tracked project**
   - What we know: `projectSlug: null` is the fallback per CONTEXT.md.
   - What's unclear: Should we attempt git remote URL matching for sessions in untracked directories?
   - Recommendation: Skip git remote fallback for initial implementation. The 33 projects in mc.config.json cover the realistic working directories. Add git fallback as a follow-up if null-project sessions appear in practice.

3. **Heartbeat debounce -- what happens to file paths during debounce window?**
   - What we know: 10-second window, accept but deduplicate.
   - What's unclear: If a heartbeat is debounced, does its `file_path` get dropped?
   - Recommendation: Always accumulate the file path even during debounce. Only skip the DB write for `lastHeartbeatAt`. Buffer file paths in-memory and flush on next non-debounced heartbeat.

4. **createSession doesn't set projectSlug**
   - What we know: The Phase 11 `createSession` query doesn't accept `projectSlug` in its input schema.
   - What's unclear: Should we modify `createSession` to accept projectSlug, or update after creation?
   - Recommendation: Extend the Phase 11 `createSession` function to accept an optional `projectSlug` parameter. This is cleaner than a separate update call.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (latest, via pnpm) |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | POST /api/sessions creates session with correct project | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/sessions.test.ts -x` | No -- Wave 0 |
| API-02 | POST /api/sessions/:id/heartbeat updates files and lastActivity | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/sessions.test.ts -x` | No -- Wave 0 |
| API-03 | POST /api/sessions/:id/stop marks completed | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/sessions.test.ts -x` | No -- Wave 0 |
| API-04 | GET /api/sessions returns filtered list | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/sessions.test.ts -x` | No -- Wave 0 |
| SESS-01 | Hook endpoint accepts Claude Code native payload format | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/sessions.test.ts -x` | No -- Wave 0 |
| SESS-03 | Reaper marks stale sessions as abandoned | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/session-service.test.ts -x` | No -- Wave 0 |
| SESS-04 | CWD resolves to project slug via prefix matching | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/session-service.test.ts -x` | No -- Wave 0 |
| SESS-05 | Aider git log detection creates completed session | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/session-service.test.ts -x` | No -- Wave 0 |
| SESS-06 | Hook endpoints return within 50ms (timing test) | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/sessions.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/routes/sessions.test.ts` -- covers API-01, API-02, API-03, API-04, SESS-01, SESS-06
- [ ] `packages/api/src/__tests__/services/session-service.test.ts` -- covers SESS-03, SESS-04, SESS-05
- Existing `packages/api/src/__tests__/db/queries/sessions.test.ts` covers the data layer (Phase 11)
- Existing `packages/api/src/__tests__/helpers/setup.ts` provides test DB infrastructure

## Sources

### Primary (HIGH confidence)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- complete hook event payloads, HTTP hook config, timeout behavior
- Existing MC codebase (packages/api/src/) -- routes, services, queries, schema patterns
- Phase 11 deliverables -- sessions.ts schema, queries, tests, model-tier.ts

### Secondary (MEDIUM confidence)
- [v1.2 Architecture Research](.planning/research/ARCHITECTURE.md) -- session lifecycle patterns, hook script design
- [v1.2 Pitfalls Research](.planning/research/PITFALLS.md) -- heartbeat flood, abandoned sessions, cwd resolution
- Claude Code settings.json (existing hooks) -- verified current hook configuration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all existing patterns
- Architecture: HIGH -- extends proven patterns (captures routes, project scanner timer, event bus), CONTEXT.md decisions are specific and implementable
- Pitfalls: HIGH -- well-documented from v1.2 project research + verified against Claude Code hooks reference
- Claude Code hook payloads: HIGH -- verified via official docs at code.claude.com/docs/en/hooks

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable domain -- MC codebase + Claude Code hooks are both mature)
