---
phase: 35-active-intelligence-daemon
plan: 02
subsystem: api, ui
tags: [llm, narrative, ai-generation, zod, constrained-output, cache, react, hero-card, intelligence]

# Dependency graph
requires:
  - phase: 35-01-intelligence-cache-foundation
    provides: intelligence cache (getFromCache, writeToCache, acquireGenerationLock, releaseGenerationLock), context adapter (buildNarrativeContext, getContextBudget), event bus types
provides:
  - Narrative generator service with Zod-constrained LM Studio output
  - Cache-first getNarrative with async regeneration via queueMicrotask
  - Intelligence API route (GET /api/intelligence/:slug/narrative)
  - useNarrative React hook for dashboard consumption
  - NarrativePanel component with TV-recap style rendering
  - Hero card integration showing AI narrative between commit timeline and captures
affects: [35-03-digest-generator, 35-04-routing-intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns: [cache-first-async-regen, output-object-constrained-generation, narrative-panel-fallback]

key-files:
  created:
    - packages/api/src/services/narrative-generator.ts
    - packages/api/src/routes/intelligence.ts
    - packages/api/src/__tests__/services/narrative-generator.test.ts
    - packages/api/src/__tests__/routes/intelligence.test.ts
    - packages/web/src/hooks/use-narrative.ts
    - packages/web/src/components/hero/narrative-panel.tsx
  modified:
    - packages/api/src/app.ts
    - packages/web/src/components/hero/hero-card.tsx

key-decisions:
  - "Cache-first serving via getNarrative: returns cached or null, triggers async regeneration via queueMicrotask (never blocks API response per D-05)"
  - "Output.object with narrativeSchema for constrained generation -- same pattern as solution-extractor (per D-03, D-06)"
  - "NarrativePanel renders nothing when narrative is null -- existing commit breadcrumbs serve as fallback, zero visual regression"
  - "useNarrative uses plain fetch (not Hono RPC client) to /api/intelligence/:slug/narrative -- follows fetchCounter convention"

patterns-established:
  - "Cache-first async regen: getFromCache -> if miss, queueMicrotask(regenerate) -> return null immediately"
  - "Intelligence route pattern: createIntelligenceRoutes factory wired in app.ts chain"
  - "Narrative panel fallback: null narrative = no render, loading = skeleton shimmer"

requirements-completed: [DAEMON-01, DAEMON-02]

# Metrics
duration: 8min
completed: 2026-03-23
---

# Phase 35 Plan 02: Narrative Generator Summary

**TV-recap style narrative generator via LM Studio with Zod-constrained output, cache-first API serving, and hero card integration showing AI "Previously on..." panel**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-23T12:50:46Z
- **Completed:** 2026-03-23T12:59:16Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Narrative generator service producing constrained JSON (summary, highlights, openThreads, suggestedFocus) via LM Studio
- Cache-first serving with async background regeneration -- API never blocks on LLM calls
- Intelligence API route at GET /api/intelligence/:slug/narrative returning cached narrative or null
- Dashboard NarrativePanel component with TV-recap styling: AI badge, amber open-thread indicators, terracotta focus callout
- Hero card integrates narrative between commit timeline and captures sections
- 854 API tests passing (12 new), web builds clean

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for narrative generator and intelligence routes** - `0bf0af5` (test)
2. **Task 1 (GREEN): Narrative generator service + intelligence API routes** - `65c6b42` (feat)
3. **Task 2: Dashboard narrative panel + hero card integration** - `943a4f1` (feat)

## Files Created/Modified
- `packages/api/src/services/narrative-generator.ts` - narrativeSchema, generateProjectNarrative, getNarrative, regenerateNarrative
- `packages/api/src/routes/intelligence.ts` - GET /intelligence/:slug/narrative
- `packages/api/src/app.ts` - Wired createIntelligenceRoutes in route chain
- `packages/api/src/__tests__/services/narrative-generator.test.ts` - 9 tests: schema validation, cache behavior, health check, Output.object pattern
- `packages/api/src/__tests__/routes/intelligence.test.ts` - 3 tests: cache miss, cache hit, slug validation
- `packages/web/src/hooks/use-narrative.ts` - useNarrative hook with slug-based fetching
- `packages/web/src/components/hero/narrative-panel.tsx` - AI narrative panel with skeleton, highlights, open threads, focus callout
- `packages/web/src/components/hero/hero-card.tsx` - Integrated useNarrative hook and NarrativePanel component

## Decisions Made
- Cache-first serving via getNarrative: returns cached or null, triggers async regeneration via queueMicrotask (never blocks API response per D-05)
- Output.object with narrativeSchema for constrained generation -- same pattern as solution-extractor (per D-03, D-06)
- NarrativePanel renders nothing when narrative is null -- existing commit breadcrumbs serve as fallback, zero visual regression
- useNarrative uses plain fetch (not Hono RPC client) to /api/intelligence/:slug/narrative -- follows fetchCounter convention
- Generation lock prevents duplicate concurrent LLM calls for the same project narrative

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors in narrative-generator.test.ts**
- **Found during:** Task 2 (after web integration)
- **Issue:** Unused imports (z, getFromCache, releaseGenerationLock) and incorrect mock return type shape for generateText
- **Fix:** Removed unused imports, cast mock return value with `as never` instead of matching full type
- **Files modified:** packages/api/src/__tests__/services/narrative-generator.test.ts
- **Verification:** typecheck passes for new files, all 12 tests pass
- **Committed in:** 943a4f1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test cleanup. No scope creep.

## Issues Encountered
- Pre-existing typecheck errors in routing-advisor.ts (out of scope for this plan, not introduced by our changes)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Intelligence API route established at /api/intelligence/ -- ready for digest endpoint (35-03) and routing suggestions (35-04)
- NarrativePanel pattern reusable for future intelligence UI components (digest panel, routing suggestions)
- Cache-first async-regen pattern proven and ready for digest generator to follow same approach

## Known Stubs
None - all data flows are wired end-to-end. Narrative returns null when LM Studio is unavailable (intentional graceful degradation, not a stub).

## Self-Check: PASSED

All 8 created/modified files verified on disk. All 3 task commits (0bf0af5, 65c6b42, 943a4f1) confirmed in git log. 854 API tests passing, web builds clean.

---
*Phase: 35-active-intelligence-daemon*
*Completed: 2026-03-23*
