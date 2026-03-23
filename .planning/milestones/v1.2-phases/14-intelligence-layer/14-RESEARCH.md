# Phase 14: Intelligence Layer - Research

**Researched:** 2026-03-16
**Domain:** Real-time conflict detection across parallel coding sessions
**Confidence:** HIGH

## Summary

Phase 14 adds file-level conflict detection to Mission Control. When two active Claude Code sessions on the same project report writing to the same file (via heartbeat data), MC detects the overlap and emits an SSE alert. This is a focused feature -- three requirements (INTL-01, INTL-02, INTL-03) that extend existing patterns in the codebase without introducing new libraries or transport mechanisms.

The codebase is well-prepared for this. Sessions already store `filesJson` (a JSON array of touched file paths) and resolve to `projectSlug`. The event bus already has `session:conflict` in its type union. The SSE route already streams all MCEvent types. The risk feed already renders severity-grouped cards. The work is primarily connecting these existing pieces: query active sessions by project, cross-reference their file arrays, emit conflict events, and render them as risk feed cards.

**Primary recommendation:** Build the conflict detector as a pure function in `conflict-detector.ts` that takes the DB handle, compares `filesJson` across active sessions on the same project, and returns conflict data. Call it from the heartbeat endpoint after `updateSessionHeartbeat`. Extend the MCEvent interface to carry conflict-specific payload. Add a `session:conflict` handler to the SSE client. Render conflicts as risk feed cards with a terminal icon badge.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- File-level only (not function-level -- too complex, not worth it)
- Cross-reference `filesJson` arrays across active sessions on same project
- Detection runs on every heartbeat that updates files_touched
- All file paths normalized to absolute before comparison (resolve relative against session cwd)
- Conflict alerts surface as risk feed cards with a session type badge
- Reuse existing risk card component with warm severity palette
- Add a session/terminal icon badge to distinguish from git health cards
- No separate section -- risk feed is already "things needing your attention"
- No rename of the risk feed needed -- it has no visible header label
- `session:conflict` event emitted when file overlap detected
- Contains: both session IDs, project slug, conflicting file paths
- Client-side: TanStack Query invalidation for risk feed on conflict event
- Sessions on same project are queryable as related
- API: `GET /api/sessions?project=mission-control` returns all sessions for that project
- Response includes relationship metadata: "2 active sessions, 1 completed in last hour"

### Claude's Discretion
None specified -- all decisions locked.

### Deferred Ideas (OUT OF SCOPE)
- Convergence detection (parallel sessions both committed, ready to merge) -- v1.3
- Function-level conflict detection -- not worth the complexity
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTL-01 | File-level conflict detection across active sessions on same project | Conflict detector service comparing `filesJson` arrays, triggered on heartbeat; file path normalization; existing session schema has all needed data |
| INTL-02 | SSE alert emitted when two sessions report writing to the same file | Extended MCEvent interface with conflict payload; `session:conflict` already in event type union; SSE route already streams all event types; `useSSE` hook extended with `onSessionConflict` handler |
| INTL-03 | Session relationships grouped by project -- sessions on same project linked | Existing `listSessions` query already supports `projectSlug` filter; extend response with relationship metadata (active count, recent completed count) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | 4.12+ | API routes | Already in use, session routes already exist |
| Drizzle ORM | 0.33+ | Session queries | Already in use, sessions table already defined |
| better-sqlite3 | 11+ | Database | Already in use, synchronous queries |
| Zod | 3.23+ | Schema validation | Already in use for all API boundaries |
| Vitest | 3+ | Testing | Already configured, test patterns established |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| EventEmitter (node:events) | built-in | Event bus | Already in use via MCEventBus singleton |
| Hono SSE streaming | built-in | Real-time events | Already in use via `streamSSE` |

### Alternatives Considered
None -- this phase uses only existing libraries. No new dependencies needed.

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
  services/
    conflict-detector.ts     # NEW: Pure conflict detection logic
    session-service.ts       # EXTEND: Add path normalization
    event-bus.ts             # EXTEND: MCEvent payload for conflicts
  routes/
    sessions.ts              # EXTEND: Call conflict check after heartbeat
    risks.ts                 # EXTEND: Include conflict findings in risk feed
  db/queries/
    sessions.ts              # EXTEND: Add relationship metadata to list response
packages/shared/src/schemas/
    session.ts               # EXTEND: listSessionsQuery with relationship response
packages/web/src/
  hooks/
    use-sse.ts               # EXTEND: Add onSessionConflict handler
    use-risks.ts             # MINOR: Refetch on conflict event
  components/risk-feed/
    risk-card.tsx             # EXTEND: Session conflict card variant with icon badge
```

### Pattern 1: Conflict Detector as Pure Service Function

**What:** A synchronous function that queries active sessions for a given project, compares their `filesJson` arrays, and returns detected conflicts. No side effects -- the caller decides what to emit.

**When to use:** Every time a heartbeat updates `filesJson` (after debounce, after `updateSessionHeartbeat` completes).

**Example:**
```typescript
// packages/api/src/services/conflict-detector.ts

import { eq, and } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { resolve } from "node:path";

export interface SessionConflict {
  projectSlug: string;
  sessionA: string;
  sessionB: string;
  conflictingFiles: string[];
}

/**
 * Normalize file path to absolute using session cwd as base.
 * If already absolute, returns as-is.
 */
function normalizePath(filePath: string, cwd: string): string {
  if (filePath.startsWith("/")) return filePath;
  return resolve(cwd, filePath);
}

/**
 * Detect file-level conflicts across active sessions on the same project.
 * Returns array of conflicts (empty if none).
 *
 * Called after heartbeat updates filesJson for a given session.
 * Only compares the triggering session against other active sessions
 * on the same project (not all-vs-all).
 */
export function detectConflicts(
  db: DrizzleDb,
  triggeringSessionId: string,
  projectSlug: string
): SessionConflict[] {
  // Get all active sessions for this project
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

  if (activeSessions.length < 2) return [];

  const triggering = activeSessions.find((s) => s.id === triggeringSessionId);
  if (!triggering || !triggering.filesJson) return [];

  const triggeringFiles = new Set(
    (JSON.parse(triggering.filesJson) as string[]).map((f) =>
      normalizePath(f, triggering.cwd)
    )
  );

  const conflicts: SessionConflict[] = [];

  for (const other of activeSessions) {
    if (other.id === triggeringSessionId) continue;
    if (!other.filesJson) continue;

    const otherFiles = (JSON.parse(other.filesJson) as string[]).map((f) =>
      normalizePath(f, other.cwd)
    );

    const overlapping = otherFiles.filter((f) => triggeringFiles.has(f));

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
```

### Pattern 2: Extended MCEvent Payload for Conflict Data

**What:** The current `MCEvent` interface has only `type` and `id`. Conflict events need richer payload (both session IDs, project slug, conflicting files). Extend the interface with an optional `data` field.

**When to use:** When emitting `session:conflict` events through the event bus.

**Critical design decision:** The event bus currently serializes events as `{ type, id }` in the SSE route (`routes/events.ts`). For conflicts, the SSE data payload needs to include the full conflict info. Two options:

1. **Add optional `data` field to MCEvent** -- backward-compatible, SSE serialization includes it when present
2. **Keep MCEvent minimal, use a separate conflict notification mechanism** -- more complex, unnecessary

Option 1 is the right approach. Existing SSE consumers ignore unknown fields in the JSON data, so adding a `data` field is safe.

```typescript
// Extend MCEvent interface
export interface MCEvent {
  type: MCEventType;
  id: string;
  data?: Record<string, unknown>;  // Optional payload for rich events
}

// Emission in heartbeat handler
eventBus.emit("mc:event", {
  type: "session:conflict",
  id: conflict.sessionA,  // Use triggering session as the primary ID
  data: {
    sessionB: conflict.sessionB,
    projectSlug: conflict.projectSlug,
    conflictingFiles: conflict.conflictingFiles,
  },
});
```

### Pattern 3: Risk Feed Extension with Session Conflict Cards

**What:** The risk feed currently renders git health findings from `GET /api/risks`. Session conflicts need to appear alongside these as risk cards. Two approaches:

1. **Persist conflicts to `project_health` table** -- reuses existing query infrastructure, conflicts auto-resolve when sessions end, risk feed works unchanged
2. **Return conflicts as a separate array in the risks response** -- requires frontend changes to merge two data sources

**Recommended: Option 1 (persist to project_health).** Insert conflict findings with `checkType: "session_file_conflict"` and `severity: "warning"`. Auto-resolve when either session ends or files no longer overlap. This reuses the entire existing risk infrastructure.

```typescript
// Insert conflict as a health finding
upsertHealthFinding(db, sqlite, {
  projectSlug: conflict.projectSlug,
  checkType: "session_file_conflict",
  severity: "warning",
  detail: `${conflict.conflictingFiles.length} file(s) being edited in parallel`,
  metadata: {
    sessionA: conflict.sessionA,
    sessionB: conflict.sessionB,
    files: conflict.conflictingFiles,
    type: "session",  // Distinguishes from git health findings
  },
});
```

This requires extending `healthCheckTypeEnum` in shared schemas to include `"session_file_conflict"`.

The risk card component then checks `metadata.type === "session"` to render a terminal icon badge instead of the git-related action hint.

### Pattern 4: Session Relationship Metadata in List Response

**What:** Extend `GET /api/sessions` to include relationship metadata when filtering by project.

```typescript
// Extended response shape
{
  sessions: [...],
  total: 5,
  relationships: {
    activeCount: 2,
    recentCompletedCount: 1,  // completed within last hour
    summary: "2 active sessions, 1 completed in last hour"
  }
}
```

### Anti-Patterns to Avoid

- **All-vs-all comparison on every heartbeat:** Only compare the triggering session against others. Don't query all sessions and do N^2 comparisons.
- **Storing conflicts in memory only:** If the API restarts, conflicts disappear. Persisting to `project_health` survives restarts.
- **Conflict event flooding:** If sessions A and B overlap on file X, don't re-emit `session:conflict` on every subsequent heartbeat. Use the upsert pattern from health findings -- if the conflict finding already exists (same project + same checkType + unresolved), just update the metadata.
- **Not resolving stale conflicts:** When a session ends or is reaped, check if any conflict findings should be resolved (the overlapping session pair no longer both active).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Health finding persistence | Custom conflict table | Existing `project_health` table + `upsertHealthFinding` | Same resolution lifecycle, same risk feed rendering |
| Event streaming | Custom WebSocket | Existing SSE via `streamSSE` + `eventBus` | Already works, already has reconnection logic |
| Risk feed rendering | Separate conflict UI section | Existing `RiskFeed` + `RiskCard` with type badge | Reuses severity grouping, new badge, styling |
| Session querying by project | Custom query function | Existing `listSessions` with `projectSlug` filter | Already supports this exact filter |

**Key insight:** Phase 14 is almost entirely about connecting existing pieces. The session data is already there, the event bus is ready, the risk feed is waiting. The new code is the conflict detection logic and the glue between heartbeat and risk emission.

## Common Pitfalls

### Pitfall 1: Conflict Detection Runs on Debounced Heartbeats

**What goes wrong:** Heartbeat debouncing (10-second window in `session-service.ts`) means files are buffered but the DB is not updated. If conflict detection runs on the debounced path, it checks stale data.

**Why it happens:** The heartbeat endpoint returns `{ debounced: true }` early without calling `updateSessionHeartbeat`. The file is buffered in memory but not in SQLite.

**How to avoid:** Only run conflict detection after a non-debounced heartbeat that actually writes to the DB. The current code already has this structure -- `updateSessionHeartbeat` is only called when not debounced. Put conflict detection right after that call.

**Warning signs:** Conflicts detected with significant delay (10+ seconds after a file is touched in both sessions).

### Pitfall 2: Relative File Paths Break Comparison

**What goes wrong:** Claude Code hooks may report relative paths (e.g., `src/index.ts`) while another session reports absolute paths (`/Users/ryanstern/mission-control/src/index.ts`). These don't match despite being the same file.

**Why it happens:** The `tool_input.file_path` from Claude Code PostToolUse hooks can be relative or absolute depending on the tool and context.

**How to avoid:** Normalize all paths to absolute before storing in `filesJson`. Use `path.resolve(session.cwd, filePath)` for relative paths, passthrough for already-absolute paths. Do this at buffer/heartbeat time, not at comparison time, so the data is clean from the start.

**Warning signs:** Sessions clearly editing the same file but no conflict detected.

### Pitfall 3: MCEvent Interface Extension Breaks SSE Serialization

**What goes wrong:** Adding a `data` field to MCEvent but not updating the SSE serialization in `routes/events.ts`. The SSE route currently serializes as `JSON.stringify({ type: event.type, id: event.id })` -- this would DROP the `data` field.

**Why it happens:** The SSE route manually constructs the JSON payload instead of serializing the full event object.

**How to avoid:** Update the SSE route to serialize the entire event: `JSON.stringify(event)` instead of `JSON.stringify({ type: event.type, id: event.id })`. This is backward-compatible because existing events only have `type` and `id`.

**Warning signs:** Client receives `session:conflict` event but with no conflict details in the data.

### Pitfall 4: Conflict Findings Not Auto-Resolved When Sessions End

**What goes wrong:** A conflict card stays in the risk feed forever because neither session ending triggers resolution of the conflict health finding.

**Why it happens:** The session stop/reaper code emits `session:ended` / `session:abandoned` but doesn't check for conflict findings to resolve.

**How to avoid:** When a session ends (via stop hook or reaper), resolve any `session_file_conflict` findings where that session is one of the pair. Check `metadata.sessionA` or `metadata.sessionB` matching the ended session ID.

**Warning signs:** Risk feed shows "2 files being edited in parallel" long after both sessions have ended.

### Pitfall 5: healthCheckTypeEnum Validation Rejects New Check Type

**What goes wrong:** The shared `healthCheckTypeEnum` is a Zod enum with a fixed set of values. Adding `"session_file_conflict"` to the database without updating the enum causes validation failures when the API reads findings back.

**Why it happens:** The `healthFindingSchema` in shared schemas uses `healthCheckTypeEnum` for validation. If the DB contains a value not in the enum, any response that uses this schema will fail.

**How to avoid:** Add `"session_file_conflict"` to `healthCheckTypeEnum` in `packages/shared/src/schemas/health.ts` before inserting any conflict findings. Also update `getActionCommand` in `packages/web/src/lib/action-hints.ts` to handle the new check type (return empty string -- no git command for session conflicts).

**Warning signs:** API returns 500 on `GET /api/risks` after the first conflict is detected.

## Code Examples

Verified patterns from the existing codebase:

### Heartbeat Integration Point
```typescript
// In packages/api/src/routes/sessions.ts, heartbeat handler
// AFTER the updateSessionHeartbeat call (line ~198):

// Get session to check project
try {
  const session = getSession(db, hook.session_id);
  if (session.projectSlug) {
    const conflicts = detectConflicts(db, hook.session_id, session.projectSlug);
    for (const conflict of conflicts) {
      // Persist as health finding (upsert avoids duplicates)
      upsertHealthFinding(db, getInstance().sqlite, {
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
      // Emit SSE event
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
} catch {
  // Conflict detection is best-effort -- don't fail the heartbeat
}
```

### SSE Client Handler Extension
```typescript
// In packages/web/src/hooks/use-sse.ts, add to SSEOptions interface:
onSessionConflict?: (data: { id: string; sessionB: string; projectSlug: string; conflictingFiles: string[] }) => void;

// Add event listener in connect():
eventSource.addEventListener("session:conflict", (e: MessageEvent) => {
  try {
    const data = JSON.parse(e.data);
    optionsRef.current.onSessionConflict?.(data);
  } catch {
    // Ignore malformed events
  }
});
```

### Risk Card Session Badge
```typescript
// In packages/web/src/components/risk-feed/risk-card.tsx
// Check metadata.type to render session icon instead of git action hint:
const isSessionConflict = finding.metadata?.type === "session";

// Render a terminal/session icon badge:
{isSessionConflict && (
  <span className="text-[9px] uppercase font-semibold bg-blue-status/15 text-blue-status rounded px-1 leading-tight">
    sessions
  </span>
)}
```

### Session Relationship Metadata
```typescript
// In packages/api/src/db/queries/sessions.ts, extend listSessions:
// After fetching sessions, if projectSlug filter is active, compute relationships:

const activeCount = db
  .select({ count: sql<number>`count(*)` })
  .from(sessions)
  .where(and(
    eq(sessions.projectSlug, query.projectSlug!),
    eq(sessions.status, "active")
  ))
  .get()?.count ?? 0;

const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
const recentCompleted = db
  .select({ count: sql<number>`count(*)` })
  .from(sessions)
  .where(and(
    eq(sessions.projectSlug, query.projectSlug!),
    eq(sessions.status, "completed"),
    sql`${sessions.endedAt} > ${Math.floor(oneHourAgo.getTime() / 1000)}`
  ))
  .get()?.count ?? 0;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No session awareness | Sessions tracked via hooks (Phase 12) | v1.2 Phase 12 | Foundation for conflict detection |
| MCEvent: type + id only | MCEvent: type + id + optional data | Phase 14 | Richer SSE payloads for conflicts |
| Risk feed: git health only | Risk feed: git health + session conflicts | Phase 14 | Unified "attention feed" concept |

## Open Questions

1. **Conflict deduplication key**
   - What we know: `upsertHealthFinding` uses projectSlug + checkType as the dedup key. If two different pairs of sessions conflict on the same project, the second conflict would overwrite the first.
   - What's unclear: Should the dedup key include the session pair? Or is one conflict finding per project sufficient?
   - Recommendation: Use `session_file_conflict` as checkType -- one finding per project is sufficient. The metadata stores the latest conflicting sessions. Multiple concurrent conflicts on the same project are unlikely for a single-user setup, and the detail text already conveys the important info ("N files being edited in parallel").

2. **Conflict resolution trigger timing**
   - What we know: Conflicts should resolve when sessions end or files no longer overlap.
   - What's unclear: Should resolution happen on every heartbeat (check if conflict still exists) or only on session stop/reap?
   - Recommendation: Resolve on session stop/reap only. Checking on every heartbeat adds unnecessary queries. Once a conflict is detected, it stays until one session ends -- the user should coordinate, not wait for MC to clear it.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3+ |
| Config file | `vitest.config.ts` (root workspace) + `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTL-01 | Conflict detection finds overlapping files across active sessions on same project | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/conflict-detector.test.ts -x` | Wave 0 |
| INTL-01 | No conflict when sessions on different projects | unit | (same file) | Wave 0 |
| INTL-01 | Path normalization resolves relative paths | unit | (same file) | Wave 0 |
| INTL-01 | No conflict with fewer than 2 active sessions | unit | (same file) | Wave 0 |
| INTL-02 | SSE emits session:conflict event with full payload | integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/routes/sessions.test.ts -x` | Extend existing |
| INTL-02 | Conflict finding persisted to project_health table | integration | (same file) | Extend existing |
| INTL-02 | SSE data includes sessionB, projectSlug, conflictingFiles | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/event-bus.test.ts -x` | Extend existing |
| INTL-03 | GET /api/sessions?projectSlug=X returns relationship metadata | integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/routes/sessions.test.ts -x` | Extend existing |
| INTL-03 | Relationship metadata includes active count and recent completed count | integration | (same file) | Extend existing |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/services/conflict-detector.test.ts` -- covers INTL-01 (pure detection logic)
- [ ] Extend `packages/api/src/__tests__/routes/sessions.test.ts` -- covers INTL-02 (heartbeat triggers conflict), INTL-03 (relationship metadata)
- [ ] Extend `packages/shared/src/schemas/health.ts` -- add `session_file_conflict` to `healthCheckTypeEnum`
- [ ] Extend `packages/web/src/lib/action-hints.ts` -- handle new check type (return empty string)

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `packages/api/src/services/session-service.ts` -- heartbeat debounce, file buffering, reaper patterns
- Codebase inspection: `packages/api/src/services/event-bus.ts` -- MCEvent interface, `session:conflict` already in type union
- Codebase inspection: `packages/api/src/routes/sessions.ts` -- heartbeat handler integration point
- Codebase inspection: `packages/api/src/routes/events.ts` -- SSE serialization (currently drops extra fields)
- Codebase inspection: `packages/api/src/db/queries/sessions.ts` -- `updateSessionHeartbeat`, `listSessions`
- Codebase inspection: `packages/api/src/db/queries/health.ts` -- `upsertHealthFinding`, `getActiveFindings`
- Codebase inspection: `packages/api/src/db/schema.ts` -- sessions table with `filesJson`, `projectSlug`, `cwd`
- Codebase inspection: `packages/web/src/components/risk-feed/` -- RiskFeed, RiskCard components
- Codebase inspection: `packages/web/src/hooks/use-sse.ts` -- SSE event listener pattern
- Codebase inspection: `packages/web/src/hooks/use-risks.ts` -- fetchCounter refetch pattern
- Codebase inspection: `packages/shared/src/schemas/health.ts` -- healthCheckTypeEnum needs extension
- Codebase inspection: `packages/web/src/App.tsx` -- SSE handler wiring, risk feed rendering

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` -- push-in architecture pattern, SSE flow confirmation
- `.planning/research/PITFALLS.md` -- heartbeat flooding, abandoned session, cwd resolution pitfalls

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all patterns from existing codebase
- Architecture: HIGH -- extends existing services, routes, and components with verified integration points
- Pitfalls: HIGH -- SSE serialization gap and path normalization identified from direct code inspection

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable -- internal codebase patterns, no external dependency concerns)
