---
phase: 20-ryan-power-dashboard
plan: 03
subsystem: gbrain-knowledge-intelligence
tags: [gbrain, mcp, knowledge-console, cross-repo-intelligence, rest-api]
dependency_graph:
  requires: ["20-01"]
  provides: ["gbrain-rest-api", "knowledge-console-ui", "intelligence-feed"]
  affects: ["packages/api/src/routes", "packages/web/src/components/power", "packages/web/src/App.tsx"]
tech_stack:
  added: []
  patterns: ["graceful-degradation", "two-column-console", "cross-repo-aggregation"]
key_files:
  created:
    - packages/api/src/routes/gbrain.ts
    - packages/api/src/routes/intelligence.ts
    - packages/api/src/__tests__/gbrain-routes.test.ts
    - packages/api/src/__tests__/intelligence-route.test.ts
    - packages/web/src/hooks/useGbrain.ts
    - packages/web/src/hooks/useIntelligence.ts
    - packages/web/src/components/power/GbrainConsole.tsx
    - packages/web/src/components/power/GbrainSearchInput.tsx
    - packages/web/src/components/power/GbrainResultCard.tsx
    - packages/web/src/components/power/GbrainEntityDetail.tsx
    - packages/web/src/components/power/IntelligenceView.tsx
    - packages/web/src/components/power/PatternCard.tsx
  modified:
    - packages/api/src/index.ts
    - packages/web/src/api/client.ts
    - packages/web/src/App.tsx
    - packages/api/src/__tests__/helpers/test-db.ts
decisions:
  - "Used inline Zod validation instead of @hono/zod-validator middleware (not installed in project)"
  - "Added finding_embeddings DDL to test-db helper for intelligence route PGlite tests"
  - "GbrainClient instantiated per-request with connect/disconnect lifecycle for isolation"
metrics:
  duration: 6min
  completed: 2026-04-11
---

# Phase 20 Plan 03: Gbrain Knowledge Console & Cross-Repo Intelligence Summary

Gbrain REST API routes with graceful MCP degradation, two-column knowledge console UI, and cross-repo intelligence feed with pattern detection from findingEmbeddings.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build gbrain REST API routes, intelligence feed route, and tests | 0ff204f | gbrain.ts, intelligence.ts, 2 test files, index.ts, test-db.ts |
| 2 | Build GbrainConsole, IntelligenceView, hooks, and wire into App | 1162a3a | 8 new components/hooks, client.ts, App.tsx |

## Implementation Details

### Task 1: API Routes + Tests

**Gbrain routes** (`/api/gbrain/search|entity|related`):
- Wraps GbrainClient MCP with per-request SSH lifecycle
- Returns `{ available: false }` when MCP server is unreachable (no crash)
- Zod validation on search query (1-500 chars, T-20-06), slug cap at 200 chars (T-20-07)

**Intelligence feed** (`/api/intelligence/feed`):
- Groups findingEmbeddings by title, filtering for 2+ distinct repos
- Uses `string_agg(DISTINCT ...)` for Postgres cross-repo aggregation
- Returns alerts sorted by occurrence count, capped at 50

**Tests**: 13 total — 10 gbrain route tests (mocked GbrainClient), 3 intelligence PGlite integration tests.

### Task 2: Frontend Components

**GbrainConsole**: Two-column layout (55/45 split). Left: search input + result cards. Right: entity detail with summary, related entities, compiled truth. Graceful degradation warning when MCP unavailable.

**IntelligenceView**: Cross-repo pattern feed with warm gold (#FFD166) accent. Active alerts sorted by count, pattern detection grouped by stage. Empty state for no patterns.

**Hooks**: `useGbrainSearch`, `useGbrainEntity`, `useGbrainRelated`, `useIntelligenceFeed` — all with staleTime caching and graceful error handling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used inline Zod validation instead of @hono/zod-validator**
- **Found during:** Task 1
- **Issue:** Plan specified `@hono/zod-validator` but package is not installed as dependency
- **Fix:** Used inline `z.safeParse()` with manual 400 error response
- **Files modified:** packages/api/src/routes/gbrain.ts

**2. [Rule 3 - Blocking] Added finding_embeddings to test-db DDL**
- **Found during:** Task 1
- **Issue:** Test helper PGlite DDL missing finding_embeddings table needed for intelligence route tests
- **Fix:** Added CREATE TABLE + cleanup to test-db.ts
- **Files modified:** packages/api/src/__tests__/helpers/test-db.ts

## Verification

- 13 API tests passing (gbrain-routes + intelligence-route)
- TypeScript compiles clean (only pre-existing TS2688 type definition warnings)
- All acceptance criteria met per plan

## Self-Check: PASSED

All 12 created files exist. Both commit hashes (0ff204f, 1162a3a) verified in git log.
