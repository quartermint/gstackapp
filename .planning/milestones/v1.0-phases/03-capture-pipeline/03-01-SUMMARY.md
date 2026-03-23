---
phase: 03-capture-pipeline
plan: 01
subsystem: api
tags: [ai-sdk, vercel-ai, open-graph-scraper, drizzle, sqlite, enrichment, categorization]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Captures CRUD API, Drizzle ORM + SQLite, Zod schemas, DI pattern"
provides:
  - "AI categorization service (categorizeCapture) with Vercel AI SDK structured output"
  - "Link metadata extractor (extractUrls, containsUrl, extractLinkMetadata) via open-graph-scraper"
  - "Enrichment orchestrator (enrichCapture) wiring AI + link extraction"
  - "Extended captures DB schema with 9 AI/link metadata columns"
  - "Stale captures query (getStaleCaptures) for triage"
  - "Fire-and-forget enrichment trigger on capture creation"
  - "Manual re-enrichment endpoint (POST /api/enrichment/:id)"
  - "Stale captures endpoint (GET /api/captures/stale)"
affects: [03-capture-pipeline, 04-search-intelligence, 05-dashboard-enrichments]

# Tech tracking
tech-stack:
  added: [ai@6.x, "@ai-sdk/openai", "@ai-sdk/anthropic", open-graph-scraper@6.x]
  patterns: [fire-and-forget enrichment via queueMicrotask, structured AI output with Zod schema, internal vs API update functions]

key-files:
  created:
    - packages/api/src/services/ai-categorizer.ts
    - packages/api/src/services/link-extractor.ts
    - packages/api/src/services/enrichment.ts
    - packages/api/src/routes/enrichment.ts
    - packages/api/drizzle/0002_capture_enrichment.sql
    - packages/api/src/__tests__/services/ai-categorizer.test.ts
    - packages/api/src/__tests__/services/link-extractor.test.ts
    - packages/api/src/__tests__/services/enrichment.test.ts
  modified:
    - packages/api/src/db/schema.ts
    - packages/api/src/db/queries/captures.ts
    - packages/shared/src/schemas/capture.ts
    - packages/api/src/routes/captures.ts
    - packages/api/src/app.ts
    - packages/api/package.json

key-decisions:
  - "updateCaptureEnrichment: separate internal update function bypassing Zod string-to-Date conversion for timestamp columns"
  - "queueMicrotask for fire-and-forget enrichment -- simpler than job queue for v1 single-user"
  - "Confidence threshold applied inside categorizer (not caller) -- 0.6 boundary"
  - "Stale route registered before :id param route to avoid Hono route collision"

patterns-established:
  - "Internal vs API update functions: updateCapture (API boundary, Zod types) vs updateCaptureEnrichment (internal, native types)"
  - "Fire-and-forget async background work via queueMicrotask with error logging"
  - "AI structured output: generateText + Output.object() with Zod schema for typed AI responses"
  - "URL_REGEX with lastIndex reset for global regex reuse in containsUrl"

requirements-completed: [CAPT-02, CAPT-06, CAPT-09]

# Metrics
duration: 9min
completed: 2026-03-09
---

# Phase 03 Plan 01: Enrichment Pipeline Summary

**AI categorization + link metadata extraction pipeline with Vercel AI SDK, OG scraper, and async fire-and-forget enrichment on capture creation**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-09T17:33:06Z
- **Completed:** 2026-03-09T17:42:11Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Built complete "persist first, enrich later" pipeline: captures saved immediately as "raw", enriched asynchronously with AI categorization and link metadata
- AI categorizer uses Vercel AI SDK with structured Zod output for provider-agnostic project matching (gpt-4o-mini default, configurable via AI_MODEL env)
- Link extractor detects URLs via regex and fetches Open Graph metadata with 5-second timeout and graceful fallback
- Extended captures DB schema with 9 new nullable columns for AI confidence, project slug, reasoning, and link metadata

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend DB schema and create enrichment services** - `0b6d278` (test), `1e1de33` (feat)
2. **Task 2: Wire enrichment trigger into capture creation flow** - `64d97b7` (feat)

_Note: Task 1 followed TDD with RED (failing tests) then GREEN (implementation) commits_

## Files Created/Modified
- `packages/api/src/services/ai-categorizer.ts` - AI categorization using Vercel AI SDK with structured Zod output
- `packages/api/src/services/link-extractor.ts` - URL detection and Open Graph metadata extraction
- `packages/api/src/services/enrichment.ts` - Enrichment orchestrator wiring AI + link extraction
- `packages/api/src/routes/enrichment.ts` - Manual re-enrichment endpoint (POST /api/enrichment/:id)
- `packages/api/drizzle/0002_capture_enrichment.sql` - Migration adding 9 AI/link metadata columns
- `packages/api/src/db/schema.ts` - Extended captures table with AI and link columns
- `packages/api/src/db/queries/captures.ts` - Added getStaleCaptures and updateCaptureEnrichment
- `packages/shared/src/schemas/capture.ts` - Extended Zod schemas with AI/link fields and stale filter
- `packages/api/src/routes/captures.ts` - Fire-and-forget enrichment trigger + stale captures endpoint
- `packages/api/src/app.ts` - Registered enrichment routes

## Decisions Made
- **Internal vs API update functions:** Created `updateCaptureEnrichment` that accepts native `Date` objects for Drizzle timestamp columns, separate from the Zod-boundary `updateCapture` that converts ISO strings. Prevents type mismatches between API and internal callers.
- **queueMicrotask over setImmediate:** Used `queueMicrotask` for fire-and-forget enrichment since it's simpler and works identically in Node.js for this single-user use case.
- **Threshold in categorizer:** Confidence threshold (0.6) applied inside `categorizeCapture` rather than the caller, keeping the threshold logic centralized.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed enrichedAt type mismatch between Zod string and Drizzle Date**
- **Found during:** Task 1 (enrichment service implementation)
- **Issue:** Drizzle `integer("enriched_at", { mode: "timestamp" })` expects `Date` objects, but `UpdateCapture` Zod type has `enrichedAt` as `z.string().datetime()`. Passing ISO string to Drizzle caused `value.getTime is not a function` error.
- **Fix:** Created `updateCaptureEnrichment` function with native `EnrichmentUpdate` interface accepting `Date`. Updated `updateCapture` to convert `enrichedAt` string to Date before passing to Drizzle.
- **Files modified:** `packages/api/src/db/queries/captures.ts`, `packages/api/src/services/enrichment.ts`
- **Verification:** All 62 tests pass, typecheck clean
- **Committed in:** 1e1de33 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed extractUrls mock missing in enrichment test**
- **Found during:** Task 1 (test implementation)
- **Issue:** `extractUrls` was mocked at module level but not configured in the link metadata test case, causing `Cannot read properties of undefined (reading 'length')`.
- **Fix:** Added `mockExtractUrls.mockReturnValueOnce(["https://example.com/article"])` to the test.
- **Files modified:** `packages/api/src/__tests__/services/enrichment.test.ts`
- **Verification:** Test passes with proper mock setup
- **Committed in:** 1e1de33 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required. AI categorization will use the `OPENAI_API_KEY` environment variable when available (already expected for AI features). The `AI_MODEL` env var can optionally override the default `gpt-4o-mini` model.

## Next Phase Readiness
- Enrichment pipeline backend is complete -- ready for frontend capture UI (Phase 3 Plan 2)
- All three services exported and tested with mocks
- Fire-and-forget enrichment trigger already wired into capture creation flow
- Stale captures query ready for triage UI

## Self-Check: PASSED

All 8 created files verified on disk. All 3 task commits verified in git log.

---
*Phase: 03-capture-pipeline*
*Completed: 2026-03-09*
