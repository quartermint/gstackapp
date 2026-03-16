---
phase: 11-data-foundation
plan: 01
subsystem: database
tags: [drizzle, zod, sqlite, session-tracking, model-tier, event-bus]

# Dependency graph
requires:
  - phase: 10-dashboard-enrichments
    provides: existing Drizzle schema, event bus, config patterns
provides:
  - Zod session lifecycle schemas (create, heartbeat, stop, response, query)
  - Drizzle sessions table with migration SQL
  - Model tier derivation function (deriveModelTier)
  - Config modelTiers extension for regex-based tier mapping
  - Session event types in MCEventType union
affects: [11-data-foundation, 12-session-ingestion, 13-lm-gateway-budget, 14-intelligence, 15-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [config-driven regex model tier mapping, session lifecycle enums]

key-files:
  created:
    - packages/shared/src/schemas/session.ts
    - packages/api/drizzle/0006_sessions.sql
    - packages/api/src/lib/model-tier.ts
  modified:
    - packages/shared/src/types/index.ts
    - packages/shared/src/index.ts
    - packages/api/src/db/schema.ts
    - packages/api/drizzle/meta/_journal.json
    - packages/api/src/lib/config.ts
    - packages/api/src/services/event-bus.ts

key-decisions:
  - "Model tier defaults baked into config schema with .default() for backward compatibility"
  - "Built-in prefix matching as fallback even without config — deriveModelTier always works standalone"

patterns-established:
  - "Session enums (source, status, tier) defined as Zod enums in shared, reused in Drizzle schema"
  - "Config-driven regex patterns for extensible model tier mapping"

requirements-completed: [SESS-02, BUDG-01]

# Metrics
duration: 6min
completed: 2026-03-16
---

# Phase 11 Plan 01: Data Foundation Summary

**Zod session schemas, Drizzle sessions table with 4 indexes, config-driven model tier derivation, and session event bus types**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T14:05:01Z
- **Completed:** 2026-03-16T14:10:43Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Session lifecycle type contracts defined in shared package (create, heartbeat, stop, response, list query)
- Sessions table with 15 columns and 4 indexes ready for migration
- Model tier derivation handles null->unknown, claude-opus->opus, claude-sonnet->sonnet, other->local
- Event bus extended with 5 session/budget event types for SSE integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zod session schemas and register in shared package exports** - `368c878` (feat)
2. **Task 2: Add sessions table to Drizzle schema and create migration SQL** - `aa1f0a4` (feat)
3. **Task 3: Add config modelTiers extension, model tier derivation function, and event bus session types** - `e9abc05` (feat)

## Files Created/Modified
- `packages/shared/src/schemas/session.ts` - Zod enums and schemas for session lifecycle
- `packages/shared/src/types/index.ts` - Type aliases for all session schemas
- `packages/shared/src/index.ts` - Barrel exports for session schemas and types
- `packages/api/src/db/schema.ts` - Drizzle sessions table definition
- `packages/api/drizzle/0006_sessions.sql` - Migration SQL with 4 indexes
- `packages/api/drizzle/meta/_journal.json` - Journal entry for migration 0006
- `packages/api/src/lib/config.ts` - modelTiers config extension with defaults
- `packages/api/src/lib/model-tier.ts` - deriveModelTier function
- `packages/api/src/services/event-bus.ts` - Session and budget event types

## Decisions Made
- Used `.default([...])` on modelTiers config field so existing mc.config.json files parse without changes
- Built-in prefix matching as fallback in deriveModelTier means the function works even without config object

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All type contracts ready for session CRUD queries (Plan 11-02)
- Migration SQL ready to apply on next API startup
- Event bus types available for SSE session broadcasting
- Model tier derivation ready for session creation flow

## Self-Check: PASSED

All 3 created files verified on disk. All 3 task commits verified in git log.

---
*Phase: 11-data-foundation*
*Completed: 2026-03-16*
