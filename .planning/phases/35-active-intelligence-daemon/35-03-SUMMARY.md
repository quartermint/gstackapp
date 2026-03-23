---
phase: 35-active-intelligence-daemon
plan: 03
subsystem: api
tags: [routing-advisor, digest, cron, lm-studio, zod, constrained-generation, intelligence-cache]

# Dependency graph
requires:
  - phase: 35-01
    provides: "intelligence-cache.ts (getFromCache, writeToCache, acquireGenerationLock, releaseGenerationLock), context-adapter.ts"
provides:
  - "Routing advisor service with tier-vs-outcome analysis (getRoutingSuggestion, computeTierStats, buildRuleBasedSuggestion)"
  - "Daily digest generator with cron scheduling (generateDailyDigest, getDigest, scheduleDigestGeneration)"
  - "GET /api/intelligence/digest endpoint"
  - "Session hook/start enriched with routingSuggestion"
affects: [35-04, dashboard, mcp]

# Tech tracking
tech-stack:
  added: []
  patterns: [cache-first-with-async-enrichment, rule-based-with-ai-upgrade, cron-scheduled-generation]

key-files:
  created:
    - packages/api/src/services/routing-advisor.ts
    - packages/api/src/services/digest-generator.ts
    - packages/api/src/__tests__/services/routing-advisor.test.ts
    - packages/api/src/__tests__/services/digest-generator.test.ts
  modified:
    - packages/api/src/routes/sessions.ts
    - packages/api/src/routes/intelligence.ts

key-decisions:
  - "Rule-based suggestions as sync fallback; AI enrichment is fire-and-forget async upgrade"
  - "Hot burn rate Rule D uses burnRate parameter for advisory downgrade suggestion"
  - "Digest route placed BEFORE :slug/narrative route to avoid slug-matching conflict"
  - "gatherDigestData uses epoch seconds for session/capture timestamps (Drizzle timestamp mode)"

patterns-established:
  - "Cache-first sync return with async AI upgrade via generation lock"
  - "Cron scheduling returns { stop } cleanup function for lifecycle management"
  - "Tier stats computation from last 20 completed sessions per project"

requirements-completed: [DAEMON-03, DAEMON-04]

# Metrics
duration: 10min
completed: 2026-03-23
---

# Phase 35 Plan 03: Routing Advisor + Daily Digest Summary

**Routing advisor with historical tier-vs-outcome analysis, rule-based fallback, and daily digest generator with 6am cron schedule via node-cron**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-23T12:50:21Z
- **Completed:** 2026-03-23T13:00:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Routing advisor computes per-tier stats (duration, commits, files) from last 20 completed sessions and generates AI-enhanced or rule-based suggestions cached with 30min TTL
- Session hook/start response enriched with routingSuggestion field (advisory only, never restricts model choice)
- Daily digest generator queries overnight commits, captures, sessions, and health findings, then produces constrained JSON output via LM Studio
- Digest cached with 12h TTL, cron schedule triggers at 6am daily, GET /api/intelligence/digest serves cached digest
- 21 new tests, 854 total tests pass, typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Routing advisor service** - `3f61ff4` (test: RED), `1bd2726` (feat: GREEN)
2. **Task 2: Daily digest generator** - `398ed76` (test: RED), `4dcb1ab` (feat: GREEN)

## Files Created/Modified
- `packages/api/src/services/routing-advisor.ts` - Tier stats computation, rule-based + AI routing suggestions, cache-first orchestrator
- `packages/api/src/services/digest-generator.ts` - Overnight data gathering, LM Studio digest generation, cron scheduling
- `packages/api/src/routes/intelligence.ts` - Added GET /intelligence/digest endpoint
- `packages/api/src/routes/sessions.ts` - Session hook/start enriched with routingSuggestion
- `packages/api/src/__tests__/services/routing-advisor.test.ts` - 10 tests for routing advisor
- `packages/api/src/__tests__/services/digest-generator.test.ts` - 11 tests for digest generator

## Decisions Made
- Rule-based suggestions returned synchronously as cache-first fallback; AI enrichment fires async and upgrades cache when LM Studio is available
- Added Rule D (hot burn rate) to buildRuleBasedSuggestion to properly use the burnRate parameter and satisfy TS strict mode
- Digest route registered before :slug/narrative in intelligence routes to prevent "digest" from being captured as a slug param
- gatherDigestData uses epoch seconds for session/capture timestamp comparisons (matching Drizzle integer timestamp mode)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable TS errors in strict mode**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `burnRate` param unused in buildRuleBasedSuggestion, unused `commits` import and `mockGenerateText` in test
- **Fix:** Added Rule D using burnRate for hot burn rate suggestion; removed unused test imports
- **Files modified:** routing-advisor.ts, routing-advisor.test.ts
- **Verification:** `pnpm typecheck` passes clean
- **Committed in:** 4dcb1ab

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor — added Rule D for burn rate usage is consistent with plan intent. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Intelligence cache (35-01), narrative generator (35-02), routing advisor (35-03), and digest generator (35-03) all complete
- Plan 35-04 (weekly pattern analysis + daemon wiring) can proceed
- All services use consistent cache-first + async AI upgrade pattern
- node-cron is installed and digest cron schedule ready for daemon startup wiring

---
*Phase: 35-active-intelligence-daemon*
*Completed: 2026-03-23*
