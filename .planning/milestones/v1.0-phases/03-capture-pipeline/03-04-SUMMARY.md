---
phase: 03-capture-pipeline
plan: 04
subsystem: ui
tags: [react, triage, stale-captures, archive, modal, cache-ttl, ai-enrichment, env-config]

# Dependency graph
requires:
  - phase: 03-capture-pipeline
    provides: "Capture hooks (useStaleCount, useCaptures), capture CRUD API, enrichment pipeline, capture cards and correction dropdown"
  - phase: 02-dashboard-core
    provides: "Dashboard layout, header, theme toggle, departure board with project grouping"
provides:
  - "TriageBadge component showing stale capture count in dashboard header"
  - "TriageView modal with one-at-a-time act/archive/dismiss flow"
  - "useStaleCaptures hook for fetching stale capture details"
  - "Cache TTL fix ensuring project scan data survives between poll intervals"
  - "Graceful AI enrichment skip when OPENAI_API_KEY is not configured"
  - ".env.example documenting API environment variables"
affects: [04-search-intelligence, 05-dashboard-enrichments]

# Tech tracking
tech-stack:
  added: []
  patterns: [modal overlay with scrim, one-at-a-time card flow, graceful API key detection, cache TTL alignment with poll interval]

key-files:
  created:
    - packages/web/src/components/triage/triage-badge.tsx
    - packages/web/src/components/triage/triage-view.tsx
    - packages/api/.env.example
  modified:
    - packages/web/src/components/layout/dashboard-layout.tsx
    - packages/web/src/App.tsx
    - packages/web/src/hooks/use-captures.ts
    - packages/api/src/services/cache.ts
    - packages/api/src/services/project-scanner.ts
    - packages/api/src/services/ai-categorizer.ts
    - packages/api/src/services/enrichment.ts
    - packages/api/src/index.ts
    - packages/api/src/__tests__/services/enrichment.test.ts

key-decisions:
  - "Cache TTL (600s) set to 2x poll interval (300s) so scan data never expires between polls"
  - "AI enrichment skipped entirely when no API key -- no silent network failures, meaningful reasoning message"
  - "Enrichment preserves user-set projectId when AI returns null to prevent async overwrite of explicit assignments"
  - "Startup warning logged when OPENAI_API_KEY missing for immediate visibility"

patterns-established:
  - "API key guard pattern: isAIAvailable() check before AI calls, graceful skip with documented reasoning"
  - "Cache TTL > poll interval: prevents stale window where cache returns undefined between polls"
  - ".env.example convention for documenting required/optional environment variables"

requirements-completed: [CAPT-07, CAPT-08]

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 03 Plan 04: Stale Capture Triage Summary

**Triage badge and modal for stale capture act/archive/dismiss flow, plus cache TTL fix, AI enrichment graceful skip, and .env.example**

## Performance

- **Duration:** 3 min (continuation from checkpoint -- tasks 1-2 completed in prior session)
- **Started:** 2026-03-09T18:25:36Z
- **Completed:** 2026-03-09T18:28:38Z
- **Tasks:** 3 (2 from prior session + 1 bug fix task)
- **Files modified:** 12

## Accomplishments
- Built TriageBadge (stale count pill in header) and TriageView (modal with one-at-a-time act/archive/dismiss flow)
- Fixed cache TTL bug causing all projects to appear stale after 60 seconds (TTL now 600s, 2x poll interval)
- Added graceful AI enrichment skip when OPENAI_API_KEY is missing (startup warning + meaningful reasoning)
- Fixed enrichment race condition where async AI result overwrote user-set projectId
- Created .env.example documenting all API environment variables

## Task Commits

Each task was committed atomically:

1. **Task 1: Build triage badge and triage view** - `22b98f7` (feat)
2. **Task 2: Wire triage into dashboard header and App.tsx** - `5ea3ff9` (feat)
3. **Task 3: Bug fixes from visual verification** - `a824dc6` (fix)

## Files Created/Modified
- `packages/web/src/components/triage/triage-badge.tsx` - Stale count badge pill with terracotta styling, hidden when count is 0
- `packages/web/src/components/triage/triage-view.tsx` - Modal overlay with one-at-a-time capture display, act/archive/dismiss actions, progress indicator
- `packages/web/src/components/layout/dashboard-layout.tsx` - Added staleCount and onTriageClick props, badge placement in header
- `packages/web/src/App.tsx` - Wired TriageView modal and stale count into dashboard
- `packages/web/src/hooks/use-captures.ts` - Added useStaleCaptures hook for triage view data
- `packages/api/src/services/cache.ts` - TTL default changed from 60s to 600s
- `packages/api/src/services/project-scanner.ts` - Explicit cache TTL set to 600s with comment
- `packages/api/src/services/ai-categorizer.ts` - Added isAIAvailable() export for API key detection
- `packages/api/src/services/enrichment.ts` - Skip AI when no key, preserve user-set projectId
- `packages/api/src/index.ts` - Startup warning when OPENAI_API_KEY not set
- `packages/api/src/__tests__/services/enrichment.test.ts` - Updated mock to include isAIAvailable
- `packages/api/.env.example` - Documents PORT, HOST, OPENAI_API_KEY, AI_MODEL, MC_CONFIG_PATH

## Decisions Made
- **Cache TTL 2x poll interval:** Set TTL to 600,000ms (10 min) vs poll at 300,000ms (5 min). This provides a safety margin ensuring scan data is always available between polls. The previous 60s TTL meant data expired after 1 minute, leaving a 4-minute gap where all projects showed no commits and appeared "stale."
- **Graceful AI skip vs error:** When OPENAI_API_KEY is missing, enrichment now skips AI entirely with a meaningful reasoning message rather than attempting a network call that silently fails. Captures still get link metadata extraction and "enriched" status.
- **Preserve user-set projectId:** If a user creates a capture with an explicit projectId, async AI enrichment returning null no longer overwrites it. The resolved projectId falls back: AI suggestion > user-set value > null.
- **Startup warning pattern:** Console.warn at server startup gives immediate visibility that AI features are disabled, rather than requiring a user to capture something and wonder why categorization didn't work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cache TTL causing all projects to appear stale**
- **Found during:** Task 3 (user verification)
- **Issue:** TTL cache expired scan data after 60s but polls run every 300s, creating a 4-minute window with no commit data. Projects with null lastCommitDate grouped as "stale" by groupProjectsByActivity.
- **Fix:** Changed cache TTL from 60,000ms to 600,000ms (10 min, 2x poll interval)
- **Files modified:** packages/api/src/services/cache.ts, packages/api/src/services/project-scanner.ts
- **Verification:** pnpm typecheck && pnpm test pass
- **Committed in:** a824dc6

**2. [Rule 1 - Bug] AI enrichment silently failing without API key**
- **Found during:** Task 3 (user verification)
- **Issue:** ai-categorizer.ts attempted OpenAI API call without OPENAI_API_KEY, caught error, returned null. No visibility that AI was disabled.
- **Fix:** Added isAIAvailable() check, startup warning, graceful skip with documented reasoning
- **Files modified:** packages/api/src/services/ai-categorizer.ts, packages/api/src/services/enrichment.ts, packages/api/src/index.ts, packages/api/.env.example
- **Verification:** pnpm typecheck && pnpm test pass
- **Committed in:** a824dc6

**3. [Rule 1 - Bug] Async enrichment overwriting user-set projectId**
- **Found during:** Task 3 (test failure investigation)
- **Issue:** When AI categorization returned null (skipped or low confidence), enrichment set projectId to null even if user had explicitly set it during capture creation. Race condition exposed by faster skip path.
- **Fix:** Enrichment now resolves projectId as: AI result > existing capture.projectId > null
- **Files modified:** packages/api/src/services/enrichment.ts
- **Verification:** pnpm test -- captures filter-by-projectId test passes
- **Committed in:** a824dc6

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes necessary for correct dashboard behavior. No scope creep.

## Issues Encountered
- Enrichment test mock needed updating to include new isAIAvailable export -- standard mock maintenance when adding exports to mocked modules.

## User Setup Required
**OPENAI_API_KEY needed for AI enrichment.** See `packages/api/.env.example` for:
- `OPENAI_API_KEY` -- required for AI auto-categorization of captures
- `AI_MODEL` -- optional, defaults to gpt-4o-mini
- Without the key, captures still work but won't be auto-categorized to projects

## Next Phase Readiness
- Phase 3 (Capture Pipeline) is now complete -- all 4 plans executed
- Full capture lifecycle: type -> submit -> persist -> enrich -> display -> correct -> triage
- Ready for Phase 4 (Search & Intelligence) which builds on the FTS5 search and captured content
- Triage system prevents capture graveyard -- stale captures are surfaced for user action
- AI enrichment infrastructure in place -- just needs API key configuration

## Self-Check: PASSED

All files exist, all commits verified:
- triage-badge.tsx, triage-view.tsx, .env.example, 03-04-SUMMARY.md
- Commits: 22b98f7, 5ea3ff9, a824dc6

---
*Phase: 03-capture-pipeline*
*Completed: 2026-03-09*
