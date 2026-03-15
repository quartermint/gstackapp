# Architecture Patterns

**Domain:** Session orchestration + LLM gateway integration into existing Hono/SQLite/React stack
**Researched:** 2026-03-15

## Recommended Architecture

Session orchestration adds a **reporting ingestion layer** and a **background intelligence layer** to the existing architecture. The existing pattern of "scan + persist + emit SSE" (project scanner -> SQLite -> event bus -> dashboard) extends naturally: session reporters push data in (instead of MC pulling), but persistence, enrichment, and SSE follow the same flow.

```
                                          +-----------------------+
                                          |    LM Studio (:1234)  |
                                          |   Qwen3-Coder-30B    |
                                          +----------^------------+
                                                     |
                                             health probe (30s)
                                                     |
+-----------------+    POST /api/sessions    +-------+---------------+
| Claude Code     | -----------------------> |                       |
| SessionStart    |    heartbeat / stop       |    Hono API (:3000)  |
| Stop hooks      |                          |                       |
+-----------------+                          |  +-- sessions.ts      |
                                             |  +-- session-svc.ts   |
+-----------------+    POST /api/sessions    |  +-- budget-svc.ts    |
| Aider           | -----------------------> |  +-- convergence.ts   |
| wrapper script  |                          |  +-- lm-gateway.ts    |
+-----------------+                          |                       |
                                             +---+---+---+-----------+
                                                 |   |   |
                                          write  | SSE   | read
                                                 v   |   v
                                        +--------+   |  +--------+
                                        | SQLite  |   |  | Config |
                                        | sessions|   |  | models |
                                        | budgets |   |  +--------+
                                        +---------+   |
                                                      v
                                        +---------------------------+
                                        |  React Dashboard          |
                                        |  +-- session-feed         |
                                        |  +-- budget-widget        |
                                        |  +-- convergence-alerts   |
                                        +---------------------------+
```

### Integration Strategy: Push-In, Same Patterns Out

The existing MC architecture is **pull-based** -- the project scanner runs every 5 minutes, pulls git data, persists, emits SSE. Session orchestration introduces **push-based ingestion** -- external tools POST session reports into MC. This is the first time MC receives data from external sources via HTTP (captures use the dashboard UI, not external POST).

The key insight: **session data flows IN differently, but flows OUT identically** to existing patterns. Sessions hit SQLite via Drizzle, emit SSE via `eventBus`, and the dashboard consumes via TanStack Query + `useSSE`. No new transport mechanisms needed.

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|-------------|
| **Session Reporter Hook** | Sends heartbeats from CC to MC API | MC API (HTTP POST) | **NEW** (shell script) |
| **Aider Wrapper Script** | Sends start/stop/commit events from Aider | MC API (HTTP POST) | **NEW** (shell script) |
| **Session Routes** (`routes/sessions.ts`) | HTTP endpoints for session CRUD | Session Service, Event Bus | **NEW** |
| **Session Service** (`services/session-svc.ts`) | State machine, conflict detection, convergence | DB queries, Event Bus | **NEW** |
| **Budget Service** (`services/budget-svc.ts`) | Usage tracking, tier aggregation, weekly rollup | DB queries | **NEW** |
| **LM Gateway Service** (`services/lm-gateway.ts`) | LM Studio health probe, model availability | LM Studio API (HTTP) | **NEW** |
| **Session Schemas** (`shared/schemas/session.ts`) | Zod schemas for session API boundaries | All packages | **NEW** |
| **Event Bus** (`services/event-bus.ts`) | Add session event types | SSE route, dashboard | **MODIFIED** (add types) |
| **SSE Route** (`routes/events.ts`) | No changes needed (generic handler) | Event Bus | **UNCHANGED** |
| **useSSE Hook** (`hooks/use-sse.ts`) | Add session event callbacks | Dashboard components | **MODIFIED** |
| **Config** (`lib/config.ts`) | Add `models` section for tier definitions | Session Service | **MODIFIED** |
| **App** (`app.ts`) | Register session routes | Session Routes | **MODIFIED** (1 line) |
| **Index** (`index.ts`) | Start LM health probe timer | LM Gateway Service | **MODIFIED** (few lines) |
| **Dashboard Layout** | Add session/budget sections | New components | **MODIFIED** |
| **DB Schema** (`db/schema.ts`) | Add sessions + budget tables | Drizzle ORM | **MODIFIED** |

### What Does NOT Change

These components need zero modification -- important for estimating blast radius:

- SSE streaming mechanism (generic event handler, already supports arbitrary event types)
- Project scanner and health engine pipeline
- Capture pipeline and AI categorization
- Search and FTS5 indexing
- MCP server (consumes API, session tools can be added later as thin wrappers)
- Existing Zod schemas for projects, captures, health
- Tailwind theming and design system
- Existing hooks (bash-safety, write-safety, context-warning)

## Data Flow

### Session Lifecycle Flow

```
1. CC SessionStart hook fires
   -> Hook script POSTs to /api/sessions { sessionId, model, cwd, source }
   -> Session service creates row in sessions table (state: active)
   -> Event bus emits session:started
   -> Dashboard SSE receives, invalidates session query

2. CC PostToolUse hook fires (on Bash/Write/Edit)
   -> Hook script POSTs to /api/sessions/:id/heartbeat { filesTouched, toolName }
   -> Session service updates lastHeartbeatAt, merges filesTouched
   -> Conflict detection runs: any other active session touching same files?
   -> If conflict: emit session:conflict
   -> Dashboard shows conflict alert

3. CC Stop hook fires
   -> Hook script POSTs to /api/sessions/:id/stop { stopReason, lastMessage }
   -> Session service transitions state: active -> completed
   -> Budget service increments tier counter
   -> Convergence detector checks: any commits since last check on same project?
   -> Event bus emits session:ended
   -> Dashboard updates

4. Git commit detected (existing scan cycle)
   -> Convergence detector correlates: which session was this from?
   -> If parallel sessions on same project both committed: emit convergence:ready
   -> Dashboard shows "ready to merge" alert
```

### LM Studio Health Probe Flow

```
1. On startup: GET http://100.x.x.x:1234/v1/models
   -> Parse response for loaded model IDs
   -> Store in module-level cache: { available: true, models: [...], lastChecked }
   -> Log: "LM Studio: Qwen3-Coder-30B available"

2. Every 30 seconds: repeat health probe
   -> On failure: { available: false, models: [], lastChecked }
   -> On model change: emit lm:status event
   -> Dashboard health panel shows LM Studio status

3. Session routes expose: GET /api/models
   -> Returns available tiers: opus, sonnet, local
   -> Local tier includes model name and availability boolean
```

### Budget Tracking Flow

```
1. Session ends -> budget service called
   -> Determine tier from session.model field:
      - "claude-opus-*" -> opus
      - "claude-sonnet-*" -> sonnet
      - local model IDs -> local
   -> Upsert weekly_budget row: { weekStart, tier, sessionCount++ }

2. Dashboard polls: GET /api/budget
   -> Returns current week's usage by tier
   -> Returns 4-week rolling history
   -> Returns "burn rate" indicator (sessions/day this week vs last)
```

## Database Schema Design

### New Tables

```sql
-- Session tracking
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- CC session_id or generated for Aider
  source TEXT NOT NULL,          -- 'claude-code' | 'aider'
  model TEXT,                    -- 'claude-opus-4-6' | 'claude-sonnet-4-6' | 'qwen3-coder-30b'
  tier TEXT NOT NULL,            -- 'opus' | 'sonnet' | 'local'
  project_slug TEXT,             -- matched from cwd, nullable
  cwd TEXT NOT NULL,             -- working directory
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'abandoned' | 'error'
  task_description TEXT,         -- from first prompt or last_assistant_message
  files_touched TEXT,            -- JSON array of file paths
  stop_reason TEXT,              -- from Stop hook
  started_at TEXT NOT NULL,      -- ISO timestamp
  last_heartbeat_at TEXT,        -- updated on each heartbeat
  ended_at TEXT,                 -- set on stop
  created_at INTEGER NOT NULL    -- epoch ms (Drizzle convention)
);

CREATE INDEX sessions_status_idx ON sessions(status);
CREATE INDEX sessions_project_slug_idx ON sessions(project_slug);
CREATE INDEX sessions_started_at_idx ON sessions(started_at);
CREATE INDEX sessions_tier_idx ON sessions(tier);

-- Budget tracking (weekly aggregation)
CREATE TABLE session_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,      -- ISO date of Monday
  tier TEXT NOT NULL,            -- 'opus' | 'sonnet' | 'local'
  session_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(week_start, tier)
);

-- LM Studio status snapshots (optional, for history)
CREATE TABLE lm_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  available INTEGER NOT NULL,    -- boolean
  models TEXT,                   -- JSON array of model IDs
  checked_at TEXT NOT NULL       -- ISO timestamp
);
```

### Why This Schema

- **Sessions table uses TEXT id**: Claude Code provides `session_id` as a string. Using it directly avoids mapping layers.
- **files_touched as JSON text**: SQLite handles JSON queries via `json_each()`. A normalized files table would be overkill for single-user conflict detection.
- **tier as denormalized column**: Derived from `model` at insert time. Avoids repeated string parsing in budget queries.
- **session_budgets as weekly rollup**: Not derived from sessions table on each query. Explicit aggregation is cheaper and survives session cleanup.
- **Text ISO timestamps for started_at/ended_at**: Consistent with the project_health table pattern (detectedAt is text ISO, not epoch). Drizzle `integer mode:timestamp` is used for created_at to match existing captures/projects convention.
- **lm_status table is optional**: Module-level cache suffices for real-time. Table only needed if you want historical uptime tracking (probably defer).

## Patterns to Follow

### Pattern 1: Service Layer with Event Emission (from git-health.ts)

The existing health engine pattern: pure functions for logic, service layer for orchestration, event bus for notifications. Session orchestration should follow the same separation.

**What:** Business logic in pure functions (testable without DB), service orchestrates persistence + events.
**When:** Any new domain logic (conflict detection, convergence, budget calculation).
**Example:**

```typescript
// Pure function: detects conflicts (testable)
export function detectConflicts(
  activeSession: SessionRecord,
  allActiveSessions: SessionRecord[]
): ConflictResult[] {
  const otherSessions = allActiveSessions.filter(s => s.id !== activeSession.id);
  const conflicts: ConflictResult[] = [];

  for (const other of otherSessions) {
    const overlap = findFileOverlap(activeSession.filesTouched, other.filesTouched);
    if (overlap.length > 0) {
      conflicts.push({
        sessionA: activeSession.id,
        sessionB: other.id,
        projectSlug: activeSession.projectSlug,
        overlappingFiles: overlap,
        severity: activeSession.projectSlug === other.projectSlug ? 'critical' : 'warning',
      });
    }
  }
  return conflicts;
}

// Service layer: orchestrates persistence + events
export function handleHeartbeat(
  db: DrizzleDb,
  sessionId: string,
  heartbeat: HeartbeatInput
): void {
  updateSessionHeartbeat(db, sessionId, heartbeat);
  const session = getSession(db, sessionId);
  const activeSessions = getActiveSessions(db);
  const conflicts = detectConflicts(session, activeSessions);

  if (conflicts.length > 0) {
    eventBus.emit("mc:event", {
      type: "session:conflict",
      id: sessionId,
    });
  }
}
```

### Pattern 2: Background Timer with Offset (from project-scanner.ts)

The project scanner runs on a 5-minute timer started in `index.ts`. LM Studio health probes should use the same pattern but at a different interval (30 seconds), started in the same `index.ts` startup sequence.

**What:** `setInterval` with cleanup on SIGTERM.
**When:** LM Studio health probing, session abandonment cleanup.
**Example:**

```typescript
// In index.ts, after existing poll setup:
let lmProbeTimer: ReturnType<typeof setInterval> | null = null;

lmProbeTimer = startLmHealthProbe(30_000); // 30-second interval
console.log("LM Studio health probe started (30-second interval)");

// In shutdown():
if (lmProbeTimer) {
  clearInterval(lmProbeTimer);
  lmProbeTimer = null;
}
```

### Pattern 3: Zod Schema in Shared Package (from schemas/health.ts)

All API boundary types defined as Zod schemas in `packages/shared/src/schemas/`. Request validation in routes, response shaping for typed RPC client.

**What:** Zod schemas for session API inputs/outputs.
**When:** Every new API endpoint.
**Example:**

```typescript
// packages/shared/src/schemas/session.ts
export const sessionSourceEnum = z.enum(["claude-code", "aider"]);
export const sessionTierEnum = z.enum(["opus", "sonnet", "local"]);
export const sessionStatusEnum = z.enum(["active", "completed", "abandoned", "error"]);

export const sessionReportSchema = z.object({
  sessionId: z.string().min(1),
  source: sessionSourceEnum,
  model: z.string().nullable(),
  cwd: z.string().min(1),
  taskDescription: z.string().nullable().optional(),
});

export const heartbeatSchema = z.object({
  filesTouched: z.array(z.string()).optional(),
  toolName: z.string().optional(),
});
```

### Pattern 4: Route Factory with Dependency Injection (from app.ts)

Routes are created via factory functions that receive `getInstance` (database accessor) and optionally `config`. Session routes follow the same pattern.

**What:** `createSessionRoutes(getInstance)` registered in `app.ts` via `.route()`.
**When:** Adding any new route group.

### Pattern 5: Cwd-to-Project Resolution

Sessions report their `cwd` (working directory). MC needs to resolve this to a `projectSlug` by matching against the config's project paths. This is similar to how the health engine maps scan targets to project slugs.

**What:** Match `cwd` against `config.projects[].path` to find the project slug.
**When:** Session start, to associate sessions with projects.
**Example:**

```typescript
export function resolveProjectFromCwd(
  cwd: string,
  config: MCConfig
): string | null {
  // Exact match first
  for (const project of config.projects) {
    if ('copies' in project) {
      for (const copy of project.copies) {
        if (cwd.startsWith(copy.path)) return project.slug;
      }
    } else {
      if (cwd.startsWith(project.path)) return project.slug;
    }
  }
  return null;
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: WebSocket for Session Updates
**What:** Using WebSocket instead of SSE for real-time session feed.
**Why bad:** MC already uses SSE throughout. Adding WebSocket introduces a second transport, different connection management, different error handling. The session feed is one-directional (server -> client) which is exactly what SSE is for.
**Instead:** Add `session:started`, `session:ended`, `session:conflict`, `convergence:ready` to the existing `MCEventType` union. The SSE handler is already generic.

### Anti-Pattern 2: Polling LM Studio on Every Session Start
**What:** Checking LM Studio availability only when a session needs routing.
**Why bad:** LM Studio cold-start takes seconds. If you check only on demand, you get latency spikes and stale availability data. The dashboard also needs to show LM status independently of sessions.
**Instead:** Background probe on 30-second timer. Module-level cache. Dashboard and session routes both read from cache.

### Anti-Pattern 3: Storing File Diffs in Sessions Table
**What:** Capturing actual file content or diffs in the sessions table for conflict detection.
**Why bad:** Massive data volume (each heartbeat could include KB of diff), SQLite bloat, and unnecessary. Conflict detection only needs **which files**, not **what changed**.
**Instead:** Store file paths as JSON array. Conflict detection is set intersection, not content comparison.

### Anti-Pattern 4: Token-Level Usage Tracking
**What:** Trying to track exact token counts per session for budget.
**Why bad:** Claude Code does not expose per-session token counts. The model field is available but token usage is not. Building token estimation heuristics is unreliable and over-engineered for the actual need.
**Instead:** Track **session count by tier**. "You've used 12 Opus sessions this week" is actionable. "You've used 847,293 tokens" is not.

### Anti-Pattern 5: Convergence Detection via Git Hooks
**What:** Installing git post-commit hooks in every project to notify MC of commits.
**Why bad:** Requires touching 35+ repos, hook maintenance across machines, breaks when repos are re-cloned. Fragile and invasive.
**Instead:** Piggyback on the existing 5-minute scan cycle. When scan detects new commits on a project with multiple recent sessions, that's convergence. Latency of up to 5 minutes is acceptable -- convergence isn't time-critical.

### Anti-Pattern 6: Session State Machine with External Library
**What:** Using xstate or similar for session state transitions.
**Why bad:** 4 states (active/completed/abandoned/error) with ~6 transitions is trivial. Adding a state machine library for this is dependency bloat. The existing health engine manages state transitions with simple conditional logic.
**Instead:** Plain TypeScript function with exhaustive switch. Same approach as health finding state (detected -> resolved).

## New SSE Event Types

Extend `MCEventType` in `event-bus.ts`:

```typescript
export type MCEventType =
  | "capture:created"
  | "capture:enriched"
  | "capture:archived"
  | "scan:complete"
  | "health:changed"
  | "copy:diverged"
  // v1.2 Session events
  | "session:started"
  | "session:ended"
  | "session:conflict"
  | "session:abandoned"
  | "convergence:ready"
  | "lm:status"
  | "budget:updated";
```

The SSE handler in `routes/events.ts` is already generic -- it forwards all `MCEvent` objects to clients. No changes needed there. The `useSSE` hook needs new callback props added.

## New API Endpoints

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/sessions` | Report session start | None (Tailscale) |
| POST | `/api/sessions/:id/heartbeat` | Report activity | None |
| POST | `/api/sessions/:id/stop` | Report session end | None |
| GET | `/api/sessions` | List sessions (filterable) | None |
| GET | `/api/sessions/active` | Active sessions only | None |
| GET | `/api/budget` | Weekly budget summary | None |
| GET | `/api/budget/history` | 4-week rolling budget | None |
| GET | `/api/models` | Available model tiers | None |

## Hook Script Architecture

### Claude Code Session Reporter

A new hook script registered in `~/.claude/settings.json` for both `SessionStart` and `Stop` events. The `PostToolUse` hook for heartbeats is registered separately with a matcher for file-modifying tools.

```bash
# ~/.claude/hooks/session-reporter.sh
# Registered for SessionStart and Stop events
MC_API="${MC_API_URL:-http://100.x.x.x:3000}"
INPUT=$(cat)

EVENT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('hook_event_name',''))" 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null)

case "$EVENT" in
  SessionStart)
    MODEL=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('model',''))" 2>/dev/null)
    CWD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null)
    SOURCE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('source','startup'))" 2>/dev/null)
    curl -sf --max-time 3 -X POST "$MC_API/api/sessions" \
      -H "Content-Type: application/json" \
      -d "{\"sessionId\":\"$SESSION_ID\",\"source\":\"claude-code\",\"model\":\"$MODEL\",\"cwd\":\"$CWD\"}" \
      >/dev/null 2>&1 &
    ;;
  Stop)
    REASON=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('stop_hook_reason',''))" 2>/dev/null)
    curl -sf --max-time 3 -X POST "$MC_API/api/sessions/$SESSION_ID/stop" \
      -H "Content-Type: application/json" \
      -d "{\"stopReason\":\"$REASON\"}" \
      >/dev/null 2>&1 &
    ;;
esac
exit 0
```

Key design decisions:
- **Fire-and-forget** (`curl ... &`): Hook must not block Claude Code. Same philosophy as `session-summary.sh`.
- **`--max-time 3`**: If MC API is unreachable, fail fast. Session data is nice-to-have, not critical.
- **`exit 0` always**: Hook failures must never break the coding session.
- **Backgrounded curl**: Zero latency impact on the coding flow.

### Heartbeat Hook (PostToolUse)

Separate script for PostToolUse events, filtered to file-modifying tools only:

```bash
# ~/.claude/hooks/session-heartbeat.sh
# Registered for PostToolUse with matcher "Write|Edit|Bash"
MC_API="${MC_API_URL:-http://100.x.x.x:3000}"
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); ti=d.get('tool_input',{}); print(ti.get('file_path',''))" 2>/dev/null)
TOOL=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null)

# Only report if we have meaningful data
if [ -n "$SESSION_ID" ] && [ -n "$FILE_PATH" ]; then
  curl -sf --max-time 2 -X POST "$MC_API/api/sessions/$SESSION_ID/heartbeat" \
    -H "Content-Type: application/json" \
    -d "{\"filesTouched\":[\"$FILE_PATH\"],\"toolName\":\"$TOOL\"}" \
    >/dev/null 2>&1 &
fi
exit 0
```

### Aider Wrapper Script

Aider does not have the same hook system as Claude Code. The cleanest approach is a **wrapper script** that reports start/stop to MC:

```bash
#!/bin/bash
# ~/bin/mc-aider — Aider wrapper with MC session reporting
MC_API="${MC_API_URL:-http://100.x.x.x:3000}"
SESSION_ID="aider-$(date +%s)-$$"
CWD=$(pwd)

# Report session start
curl -sf --max-time 3 -X POST "$MC_API/api/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"source\":\"aider\",\"model\":\"qwen3-coder-30b\",\"cwd\":\"$CWD\"}" \
  >/dev/null 2>&1

# Run aider with all arguments passed through
aider "$@"
EXIT_CODE=$?

# Report session end
curl -sf --max-time 3 -X POST "$MC_API/api/sessions/$SESSION_ID/stop" \
  -H "Content-Type: application/json" \
  -d "{\"stopReason\":\"exit_code_$EXIT_CODE\"}" \
  >/dev/null 2>&1

exit $EXIT_CODE
```

## Config Extension

Add `models` section to `mc.config.json` schema:

```typescript
const modelTierSchema = z.object({
  name: z.string(),
  tier: z.enum(["opus", "sonnet", "local"]),
  provider: z.enum(["anthropic", "lm-studio"]),
  endpoint: z.string().url().optional(), // only for local
  modelId: z.string(), // e.g., "qwen3-coder-30b"
});

// Extend mcConfigSchema:
export const mcConfigSchema = z.object({
  projects: z.array(projectConfigEntrySchema),
  dataDir: z.string().default("./data"),
  services: z.array(serviceEntrySchema).default([]),
  macMiniSshHost: z.string().default("mac-mini-host"),
  models: z.array(modelTierSchema).default([
    { name: "Opus", tier: "opus", provider: "anthropic", modelId: "claude-opus-4-6" },
    { name: "Sonnet", tier: "sonnet", provider: "anthropic", modelId: "claude-sonnet-4-6" },
    { name: "Qwen3 Coder", tier: "local", provider: "lm-studio", endpoint: "http://100.x.x.x:1234", modelId: "qwen3-coder-30b" },
  ]),
});
```

## Scalability Considerations

| Concern | At current scale (1 user, 2-5 sessions/day) | At moderate (10+ sessions/day) | At high (50+ sessions/day, team) |
|---------|------|------|------|
| Session table growth | Negligible. ~150 rows/month | ~300 rows/month, still trivial | Need session archival/cleanup. Monthly sweep of completed sessions > 90 days |
| Heartbeat volume | ~20-100 heartbeats/session, fine | Fine with SQLite WAL mode | Batch heartbeats (debounce to 10-second window) |
| Conflict detection | Linear scan of active sessions (< 5) | Still < 10 active at once | Index on project_slug + status |
| LM Studio probes | 30s interval, negligible | Same | Same |
| Budget aggregation | Simple group-by on < 100 rows | Simple group-by on < 300 rows | Materialized weekly_budget table (already designed this way) |

## Suggested Build Order

Based on dependency analysis:

```
Phase 1: Data Foundation
  - sessions table + migration
  - session_budgets table
  - Zod schemas in shared package
  - Config extension (models section)
  - Depends on: nothing (pure additions)

Phase 2: Session Ingestion
  - Session routes (POST start/heartbeat/stop, GET list)
  - Session service (state machine, cwd-to-project resolution)
  - Event bus extension (new event types)
  - CC hook scripts (session-reporter.sh, session-heartbeat.sh)
  - Aider wrapper script
  - Depends on: Phase 1

Phase 3: LM Gateway + Budget
  - LM Studio health probe service
  - Budget service (tier counting, weekly aggregation)
  - GET /api/models endpoint
  - GET /api/budget endpoint
  - Background timer integration in index.ts
  - Depends on: Phase 1 (budget needs schema), Phase 2 (budget needs session events)

Phase 4: Intelligence Layer
  - Conflict detection (pure function + service integration)
  - Convergence detection (correlate sessions with scan cycle commits)
  - Session abandonment cleanup (active sessions with no heartbeat > 30 min)
  - Depends on: Phase 2 (needs active sessions), Phase 3 (needs scan data)

Phase 5: Dashboard
  - Session feed component (active sessions list)
  - Budget widget (weekly usage by tier)
  - Conflict alerts (inline in session feed)
  - Convergence alerts (project-level notification)
  - LM Studio status in health panel
  - useSSE extensions for new event types
  - Depends on: Phase 2-4 (needs all API endpoints)
```

**Rationale for this order:**
1. Schema first because everything depends on it
2. Ingestion second because you need data flowing before you can build intelligence
3. LM Gateway and budget are independent of each other but both need schema
4. Intelligence requires ingested data to detect patterns
5. Dashboard last because it needs all backend pieces in place

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- official hook event schemas, HIGH confidence
- [LM Studio OpenAI Compatibility Docs](https://lmstudio.ai/docs/developer/openai-compat) -- /v1/models endpoint, MEDIUM confidence
- [LM Studio REST API v0](https://lmstudio.ai/docs/developer/rest/endpoints) -- native API endpoints, MEDIUM confidence
- Existing MC codebase analysis (event-bus.ts, project-scanner.ts, app.ts, schema.ts) -- HIGH confidence
- [Claude Code Hooks Guide](https://claudefa.st/blog/tools/hooks/hooks-guide) -- supplementary hook documentation, MEDIUM confidence
