---
phase: 37-proactive-intelligence
plan: 02
subsystem: api, services
tags: [insights, pattern-detection, rule-based, daemon, content-hash, dedup, proactive-intelligence]

# Dependency graph
requires:
  - phase: 37-proactive-intelligence plan 01
    provides: insights table with content-hash dedup and CRUD queries
provides:
  - 4 rule-based pattern detectors (stale captures, activity gaps, session patterns, cross-project)
  - generateAllInsights orchestrator function
  - Daemon-scheduled insight generation (30min interval + startup)
  - Parameterized getStaleCaptures with configurable threshold
affects: [37-03 insight API enhancements, 37-04 dashboard insights panel]

# Tech tracking
tech-stack:
  added: []
  patterns: [content-hash dedup per day for insight idempotency, term frequency analysis for cross-project detection, epoch-second timestamp comparison for capture age queries]

key-files:
  created:
    - packages/api/src/services/insight-generator.ts
    - packages/api/src/__tests__/services/insight-generator.test.ts
  modified:
    - packages/api/src/db/queries/captures.ts
    - packages/api/src/services/intelligence-daemon.ts

key-decisions:
  - "Local hours (getHours) for session pattern peak hour detection -- user's timezone, not UTC"
  - "Term frequency minimum of 2 occurrences per project for cross-project overlap -- prevents noise from single mentions"
  - "Infinity sentinel for projects with zero commits in activity gap detection -- treated as worst-case gap"
  - "generateAllInsights is synchronous (no LLM) -- rule-based detectors only, no lock needed"

patterns-established:
  - "Pattern detector pattern: count/query data, compute content-hash with today's ISO date, createInsight with dedup"
  - "Cross-project term analysis: split+lowercase+filter stop words (length>=4), require >=2 occurrences per project"
  - "Daemon schedule extension: add config field, DEFAULTS entry, setInterval, clearInterval in stop()"

requirements-completed: [PROACT-02, PROACT-03, PROACT-04, PROACT-05]

# Metrics
duration: 8min
completed: 2026-03-23
---

# Phase 37 Plan 02: Insight Generator Summary

**4 rule-based pattern detectors (stale captures, activity gaps, session patterns, cross-project term overlap) wired into daemon on 30min schedule with content-hash dedup**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-23T14:31:15Z
- **Completed:** 2026-03-23T14:39:15Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- 4 pattern detectors with documented thresholds: 7d stale captures, 3-capture/7d-commit activity gap gate, 10-session minimum for patterns, 3-shared-term cross-project minimum
- Content-hash dedup with today's ISO date prevents duplicate insights per day
- Intelligence daemon extended with insightGenerationIntervalMs (30min default) + initial generation on boot
- Parameterized getStaleCaptures (daysThreshold, default 14d for backward compat)
- 16 new tests covering happy path, no-data, dedup, archived exclusion, and edge cases (914 total API tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Insight generator with 4 pattern detectors** - `3c46ed5` (feat, TDD)
2. **Task 2: Wire insight generator into daemon** - `bc32a96` (feat)

## Files Created/Modified
- `packages/api/src/services/insight-generator.ts` - 4 pattern detectors + orchestrator with constants, stop words, term frequency analysis
- `packages/api/src/__tests__/services/insight-generator.test.ts` - 16 tests for all detectors including dedup and edge cases
- `packages/api/src/db/queries/captures.ts` - Parameterized getStaleCaptures with daysThreshold
- `packages/api/src/services/intelligence-daemon.ts` - insightGenerationIntervalMs config, insightTimer, initial insights on boot

## Decisions Made
- Local hours (`getHours()`) for session peak hour detection: user cares about their local timezone patterns, not UTC
- Term frequency requires >= 2 occurrences per project: prevents noise from single-mention terms in cross-project detection
- Infinity sentinel for projects with zero commits: treated as worst-case activity gap (always triggers if captures exist)
- generateAllInsights is synchronous: all 4 detectors are pure SQL/rule-based, no LM Studio dependency, no lock needed
- Initial insight generation runs inside runInitialGeneration but does NOT depend on LM Studio health check (unlike narratives)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed UTC vs local hour in session pattern detection**
- **Found during:** Task 1 (session pattern tests)
- **Issue:** Plan code used `getUTCHours()` but sessions are created in local time; test expected local-hour labels like "10am"
- **Fix:** Changed to `getHours()` for local timezone consistency
- **Files modified:** packages/api/src/services/insight-generator.ts
- **Verification:** Session pattern test passes with correct "10am" label
- **Committed in:** 3c46ed5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial timezone fix, no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 pattern detectors operational and running on daemon schedule
- Plan 03 can extend with additional detectors or LLM-enhanced summaries
- Plan 04 (dashboard) can read insights via GET /intelligence/insights (from Plan 01)
- 914 API tests passing, typecheck clean

---
*Phase: 37-proactive-intelligence*
*Completed: 2026-03-23*
