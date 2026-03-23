---
phase: 35-active-intelligence-daemon
plan: 04
subsystem: api, ui
tags: [tool-calling, zod-discriminated-union, daemon-orchestrator, daily-digest, node-cron, intelligence]

requires:
  - phase: 35-01
    provides: intelligence cache with TTL and generation locks
  - phase: 35-02
    provides: context adapter and narrative generator
  - phase: 35-03
    provides: routing advisor and digest generator with cron scheduling
provides:
  - tool calling via structured output with discriminated union schema
  - intelligence daemon orchestrator (startup, scheduling, shutdown)
  - daily digest dashboard panel with priority-ordered sections
  - server boot integration with graceful shutdown
affects: [v2.0-intelligence-engine, future-mcp-tools, dashboard]

tech-stack:
  added: [node-cron (already present)]
  patterns: [discriminated-union-tool-dispatch, daemon-orchestrator, collapsible-sections]

key-files:
  created:
    - packages/api/src/services/intelligence-tools.ts
    - packages/api/src/services/intelligence-daemon.ts
    - packages/web/src/hooks/use-digest.ts
    - packages/web/src/components/digest/daily-digest.tsx
    - packages/api/src/__tests__/services/intelligence-tools.test.ts
    - packages/api/src/__tests__/services/intelligence-daemon.test.ts
  modified:
    - packages/api/src/index.ts
    - packages/web/src/App.tsx

key-decisions:
  - "z.discriminatedUnion for tool dispatch -- type-safe switching without native function calling (Qwen3-Coder issue)"
  - "Sequential narrative generation (not parallel) to avoid LM Studio overload"
  - "Digest panel placed between compound score and hero card for morning briefing flow"
  - "Low priority sections collapsible by default to reduce visual noise"

patterns-established:
  - "Tool calling via structured output: define AVAILABLE_TOOLS registry + discriminated union schema + switch-based execution"
  - "Daemon orchestrator pattern: cron + intervals + initial pass with stop() cleanup"
  - "CollapsibleSection pattern for low-priority dashboard content"

requirements-completed: [DAEMON-05]

duration: 7min
completed: 2026-03-23
---

# Phase 35 Plan 04: Daemon Orchestrator + Tool Calling + Digest Panel Summary

**Tool calling via z.discriminatedUnion with 4 MC tools, daemon orchestrator tying together narrative/digest/cache lifecycle, and daily digest dashboard panel with priority-ordered sections**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-23T13:04:48Z
- **Completed:** 2026-03-23T13:12:07Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Tool calling service with 4 tools (search, project_lookup, capture_stats, knowledge_query) using discriminated union schema
- Intelligence daemon orchestrator: digest cron, 30min narrative refresh, 1h cache cleanup, initial generation for 5 active projects
- Server boot integration with 5s delay and graceful shutdown cleanup
- Daily digest dashboard panel with priority-ordered sections, collapsible low-priority, action items checklist, project highlights
- 18 new tests (tool schema validation, tool execution, daemon lifecycle)

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): Failing tests** - `937a730` (test)
2. **Task 1 (TDD GREEN): Tool calling + daemon orchestrator** - `359c8c6` (feat)
3. **Task 2: Daily digest panel + hook + integration** - `c8d236b` (feat)

_TDD task had RED + GREEN commits. No refactor phase needed._

## Files Created/Modified
- `packages/api/src/services/intelligence-tools.ts` - Tool calling via structured output with discriminated union
- `packages/api/src/services/intelligence-daemon.ts` - Daemon orchestrator: startup, scheduling, shutdown
- `packages/api/src/index.ts` - Server boot integration with daemon startup and shutdown cleanup
- `packages/web/src/hooks/use-digest.ts` - React hook fetching daily digest with 5min refresh
- `packages/web/src/components/digest/daily-digest.tsx` - Daily digest panel component
- `packages/web/src/App.tsx` - Digest panel integrated between compound score and hero card
- `packages/api/src/__tests__/services/intelligence-tools.test.ts` - 13 tests for schema + tool execution
- `packages/api/src/__tests__/services/intelligence-daemon.test.ts` - 5 tests for daemon lifecycle

## Decisions Made
- Used z.discriminatedUnion for tool dispatch rather than native function calling (per Qwen3-Coder reliability issue)
- Sequential narrative generation during initial pass and refresh to avoid LM Studio overload
- Digest panel placed between compound score and hero card for morning briefing flow
- Low priority digest sections default collapsed to reduce visual noise
- useDigest uses plain fetch with 5min refresh (matches fetchCounter convention)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `vi` import in intelligence-tools.test.ts**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** TypeScript strict mode flagged unused import
- **Fix:** Removed `vi` from import statement
- **Files modified:** `packages/api/src/__tests__/services/intelligence-tools.test.ts`
- **Verification:** `pnpm typecheck` passes
- **Committed in:** `c8d236b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial import cleanup. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data sources wired to real API endpoints and database queries.

## Next Phase Readiness
- Phase 35 (Active Intelligence Daemon) is now complete with all 4 plans shipped
- Intelligence cache, context adapter, narrative generator, routing advisor, digest generator, tool calling, and daemon orchestrator all operational
- Dashboard has narrative panel (per-project) and daily digest panel (global morning briefing)
- Ready for v2.0 milestone completion or next phase work

---
*Phase: 35-active-intelligence-daemon*
*Completed: 2026-03-23*
