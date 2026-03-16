---
phase: 12-session-ingestion
plan: 01
subsystem: api
tags: [hono, session-tracking, claude-code-hooks, heartbeat-debounce, session-reaper]

# Dependency graph
requires:
  - phase: 11-data-foundation
    provides: "Sessions table schema, session query module, model tier derivation, event bus with session event types"
provides:
  - "Session service with project resolution from cwd, heartbeat debounce, file buffering, and session reaper"
  - "Session hook endpoints (start/heartbeat/stop) accepting Claude Code native payloads"
  - "GET /sessions canonical list endpoint with status/projectSlug/source filtering"
  - "Session reaper timer integrated into server lifecycle"
affects: [12-session-ingestion, 13-lm-gateway-budget, 14-intelligence, 15-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: ["hook payload schemas inline (not shared -- Claude Code specific)", "queueMicrotask for fire-and-forget event emission", "heartbeat debounce with file path buffering"]

key-files:
  created:
    - packages/api/src/services/session-service.ts
    - packages/api/src/routes/sessions.ts
  modified:
    - packages/api/src/db/queries/sessions.ts
    - packages/api/src/app.ts
    - packages/api/src/index.ts

key-decisions:
  - "Hook payload schemas defined inline in routes file, not in shared package -- they are Claude Code specific, not API contracts"
  - "Resume detection checks existing session status: active sessions get heartbeat update, completed/abandoned sessions create new entry"
  - "Session reaper runs unconditionally (not gated by config) since sessions can exist without project scanning"

patterns-established:
  - "Hook endpoint pattern: .passthrough() Zod schemas for external tool payloads, silently catch missing sessions"
  - "Fire-and-forget pattern: synchronous DB write + queueMicrotask for event emission"
  - "Debounce with buffering: file paths accumulate during debounce window, flush on next non-debounced heartbeat"

requirements-completed: [SESS-01, SESS-03, SESS-04, SESS-06, API-01, API-02, API-03, API-04]

# Metrics
duration: 4min
completed: 2026-03-16
---

# Phase 12 Plan 01: Session Ingestion API Summary

**Session lifecycle API with Claude Code hook endpoints, cwd-based project resolution, 10s heartbeat debounce with file buffering, and 15-minute session reaper on 3-minute timer**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T14:49:27Z
- **Completed:** 2026-03-16T14:53:28Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Session service module with project resolution (exact + prefix match against mc.config.json, supports multi-copy entries), heartbeat debounce (10s window), file path buffering, and automatic reaper (15-minute stale threshold)
- Three hook endpoints accepting Claude Code native payloads (SessionStart, PostToolUse, Stop) with resume detection and fire-and-forget event emission
- GET /sessions canonical endpoint with status, projectSlug, and source filtering via zValidator
- Reaper timer starts on server boot (3-minute interval) and cleans up on graceful shutdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Create session service with project resolution, heartbeat debounce, and reaper** - `a9d8a18` (feat)
2. **Task 2: Create session routes with hook endpoints, wire into app and server lifecycle** - `823c07a` (feat)

## Files Created/Modified
- `packages/api/src/services/session-service.ts` - Project resolution, heartbeat debounce, file buffering, session reaper
- `packages/api/src/routes/sessions.ts` - Hook endpoints (start/heartbeat/stop) and canonical GET /sessions
- `packages/api/src/db/queries/sessions.ts` - Extended createSession to accept optional projectSlug
- `packages/api/src/app.ts` - Registered session routes in Hono app chain
- `packages/api/src/index.ts` - Session reaper timer lifecycle (start + shutdown cleanup)

## Decisions Made
- Hook payload schemas defined inline in routes file (not shared package) because they are Claude Code specific, not API contracts
- Resume detection: active sessions get heartbeat update (200), completed/abandoned allow session_id reuse (201)
- Session reaper runs unconditionally (not gated by config like the project scanner) since sessions can exist without project scanning enabled
- Heartbeat silently catches missing sessions (hook may fire before start completes)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Session ingestion API is fully operational -- ready for Plan 02 (session route tests) and Plan 03 (hook script installation)
- All 301 existing API tests continue to pass
- TypeScript compiles cleanly across all packages

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 12-session-ingestion*
*Completed: 2026-03-16*
