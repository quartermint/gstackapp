---
phase: 33-capture-intelligence-engine
plan: "03"
subsystem: api
tags: [capacities, crawl4ai, zip-import, tweet-fetch, gray-matter, node-stream-zip, batch-processing]

requires:
  - phase: 33-capture-intelligence-engine (plan 01)
    provides: "Enhanced capture schema with sourceType and enrichment pipeline"
provides:
  - "Capacities ZIP import service with content-hash dedup"
  - "Tweet content fetcher via Crawl4AI with OG scraper fallback"
  - "POST /api/captures/import/capacities endpoint"
  - "POST /api/captures/import/tweets endpoint"
  - "ambientCapture config section in mc.config.json schema"
affects: [capture-intelligence-engine, dashboard-enrichments]

tech-stack:
  added: []
  patterns: ["Direct Drizzle insert for batch import (bypass per-item enrichment)", "Content-hash SHA-256 dedup with CRLF normalization", "Fire-and-forget async import via queueMicrotask", "Crawl4AI POST /crawl with OG scraper fallback chain"]

key-files:
  created:
    - packages/api/src/services/capacities-importer.ts
    - packages/api/src/services/tweet-fetcher.ts
    - packages/api/src/__tests__/services/capacities-importer.test.ts
    - packages/api/src/__tests__/services/tweet-fetcher.test.ts
  modified:
    - packages/api/src/lib/config.ts
    - packages/api/src/routes/captures.ts

key-decisions:
  - "Direct Drizzle insert bypasses createCapture to avoid per-item enrichment on 800+ items"
  - "Content-hash dedup uses SHA-256 with CRLF normalization (same as knowledge aggregator)"
  - "eventBus uses capture:created type with data.subtype for import progress (no new event types needed)"
  - "Tweet import endpoint queries unfetched tweets by checking isNull(linkTitle) for Capacities captures"
  - "No gray-matter or node-stream-zip install needed -- already in package.json dependencies"

patterns-established:
  - "Batch import pattern: direct DB insert + content-hash dedup + SSE progress events"
  - "External service fallback chain: primary (Crawl4AI) -> fallback (OG scraper) -> graceful failure"
  - "ambientCapture config section for external data source integration settings"

requirements-completed: [CAP-08, CAP-10, CAP-11]

duration: 11min
completed: 2026-03-23
---

# Phase 33 Plan 03: Ambient Capture Bridge Summary

**Capacities ZIP import with content-hash dedup and tweet URL resolution via Crawl4AI with OG scraper fallback**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-23T10:40:35Z
- **Completed:** 2026-03-23T10:51:43Z
- **Tasks:** 2
- **Files modified:** 6 created/modified

## Accomplishments
- Capacities importer parses ZIP archives, extracts markdown with YAML frontmatter, classifies entries by path (tweets/weblinks/daily notes/people), creates captures with content-hash dedup
- Tweet fetcher resolves URLs via Crawl4AI POST /crawl with 30s timeout, falls back to OG scraper, batch processes with p-limit concurrency of 2 and 1-second delay
- Config schema extended with ambientCapture section supporting capacities backup dir/schedule and crawl4ai URL/enabled settings
- Two new API endpoints: POST /api/captures/import/capacities (fire-and-forget async) and POST /api/captures/import/tweets (batch tweet fetch)

## Task Commits

Each task was committed atomically:

1. **Task 1: Capacities importer service + config extension + import endpoint** - `b2b41a1` (feat)
2. **Task 2: Tweet content fetcher via Crawl4AI + startup wiring** - `8eab529` (feat)

## Files Created/Modified
- `packages/api/src/services/capacities-importer.ts` - ZIP parsing, content-hash dedup, batch import with SSE progress
- `packages/api/src/services/tweet-fetcher.ts` - Crawl4AI integration, OG scraper fallback, batch processing with rate limiting
- `packages/api/src/__tests__/services/capacities-importer.test.ts` - 19 tests: hashing, classification, content building, ZIP import, dedup
- `packages/api/src/__tests__/services/tweet-fetcher.test.ts` - 14 tests: URL pattern, availability, content fetch, batch processing
- `packages/api/src/lib/config.ts` - ambientCapture schema (capacities + crawl4ai settings)
- `packages/api/src/routes/captures.ts` - POST /api/captures/import/capacities and /api/captures/import/tweets endpoints

## Decisions Made
- Direct Drizzle insert bypasses createCapture to avoid triggering per-item enrichment on 800+ batch items (same approach as knowledge aggregator batch)
- Content-hash dedup reuses the SHA-256 + CRLF normalization pattern established in Phase 24
- No new MCEventType values needed -- import progress uses `capture:created` with `data.subtype` discriminator
- gray-matter and node-stream-zip already installed from prior work (no dependency changes)
- Tweet import finds unfetched tweets by checking isNull(linkTitle) for Capacities-sourced link captures matching tweet URL patterns

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added ambientCapture to existing MCConfig test fixtures**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Adding `ambientCapture` to mcConfigSchema made it required in the inferred MCConfig type, breaking 8 existing test files that construct MCConfig literals
- **Fix:** Added `ambientCapture: {}` to all test MCConfig objects across sessions, budget, models, knowledge, and model-tier tests
- **Files modified:** 6 existing test files (sessions.test.ts, session-service.test.ts, budget.test.ts, models.test.ts, knowledge.test.ts, model-tier.test.ts, knowledge-aggregator.test.ts)
- **Verification:** `pnpm typecheck` passes clean, all 721 tests pass
- **Committed in:** b2b41a1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary type-safety fix from schema extension. No scope creep.

## Issues Encountered
None -- plan executed cleanly after the type fix.

## Known Stubs
None -- all services are fully implemented with real integration points.

## User Setup Required
None -- no external service configuration required. Crawl4AI and Capacities backup paths use sensible defaults from mc.config.json.

## Next Phase Readiness
- Capacities import and tweet fetch ready for API consumption
- Dashboard could add import trigger buttons in future plans
- Rate limiting and backoff patterns established for external service integration

---
*Phase: 33-capture-intelligence-engine*
*Completed: 2026-03-23*
