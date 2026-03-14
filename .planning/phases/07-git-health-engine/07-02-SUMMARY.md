---
phase: 07-git-health-engine
plan: 02
subsystem: api
tags: [git, health-scanner, multi-copy, p-limit, ssh-batch, isPublic-cache]

# Dependency graph
requires:
  - phase: 07-git-health-engine
    provides: HealthScanData interface, normalizeRemoteUrl function
  - phase: 06-data-foundation
    provides: project_copies table, upsertCopy, getCopiesByProject, MultiCopyEntry config type
provides:
  - collectLocalHealthData: single sh -c call for all health fields per local repo
  - parseHealthFromSshOutput: extracts HealthScanData from extended SSH batch output
  - fetchIsPublic: queries GitHub API for repo visibility, cached in project_copies
  - flattenToScanTargets: normalizes multi-copy config entries into flat ScanTarget array
  - getCollectedHealthData: exports health data map for Plan 03 post-scan consumption
  - health:changed and copy:diverged event bus types
  - p-limit bounded concurrency (10 parallel scans)
affects: [07-03 health scan scheduler, 08 health API]

# Tech tracking
tech-stack:
  added: [p-limit@7]
  patterns: [section-delimited SSH batch with shared parsing, module-level health data store, multi-copy config flattening]

key-files:
  created: []
  modified:
    - packages/api/src/services/event-bus.ts
    - packages/api/src/services/project-scanner.ts

key-decisions:
  - "SSH batch script and parsing refactored into buildSshBatchScript and parseSshScanResult shared helpers to avoid duplication"
  - "SSH failures skip copy upsert entirely (preserves stale lastCheckedAt for COPY-04 detection)"
  - "isPublic fetched via gh api only when null in DB, cached for subsequent scans"
  - "Health data keyed as slug:host for multi-copy disambiguation"
  - "Project record upserted once per slug, not once per copy, for multi-copy entries"

patterns-established:
  - "ScanTarget interface: flattened representation of both single-host and multi-copy config entries"
  - "Module-level Map<string, HealthScanData> store with getCollectedHealthData() accessor"
  - "parseHealthFromSections: shared parser between local delimited output and SSH section-delimited output"

requirements-completed: [HLTH-01, HLTH-02, HLTH-03, HLTH-04, HLTH-05, HLTH-06, COPY-01, COPY-04]

# Metrics
duration: 11min
completed: 2026-03-14
---

# Phase 7 Plan 2: Git Scanner Health Data Collection Summary

**Extended project scanner with local/SSH health data collection, multi-copy config normalization, copy upsert with isPublic cache, and p-limit bounded concurrency**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-14T19:10:07Z
- **Completed:** 2026-03-14T19:21:54Z
- **Tasks:** 3
- **Files modified:** 3 (event-bus.ts, project-scanner.ts, package.json)

## Accomplishments
- Event bus extended with health:changed and copy:diverged event types
- Local repos produce HealthScanData via collectLocalHealthData in a single sh -c invocation
- SSH repos produce HealthScanData via extended batch script with 7 new sections
- Multi-copy config entries flattened into individual ScanTargets for independent scanning
- Copy records upserted with normalized remote URL, HEAD commit, branch, and isPublic
- isPublic fetched via gh API on first scan, cached in DB for subsequent scans
- SSH failures preserve existing copy data (critical for COPY-04 stale detection)
- scanAllProjects uses p-limit(10) for bounded concurrency
- Refactored SSH batch script into shared helpers (buildSshBatchScript, parseSshScanResult)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add health event types to event bus** - `0839913` (feat)
2. **Task 2: Add health data collection functions and extend SSH batch** - `d0ce3da` (feat)
3. **Task 3: Multi-copy normalization, isPublic cache, and scanAllProjects integration** - `c128ed3` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `packages/api/src/services/event-bus.ts` - Added health:changed and copy:diverged to MCEventType union
- `packages/api/src/services/project-scanner.ts` - Extended with health data collection, multi-copy normalization, copy upsert, isPublic cache, p-limit concurrency, SSH batch refactoring

## Decisions Made
- SSH batch script and parsing extracted into shared helpers (buildSshBatchScript, parseSshScanResult) to eliminate duplication between scanRemoteProject and scanAllProjects
- SSH failures skip copy upsert entirely to preserve stale lastCheckedAt for COPY-04 detection
- isPublic fetched via gh api only when null in existing DB record, then cached
- Health data keyed as `${slug}:${host}` to disambiguate multi-copy entries
- Project record upserted once per slug (not once per copy) for multi-copy entries to avoid redundant writes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Refactored SSH batch into shared helpers to avoid code duplication**
- **Found during:** Task 3 (scanAllProjects integration)
- **Issue:** SSH batch script was duplicated between scanRemoteProject and inline scanAllProjects code
- **Fix:** Extracted buildSshBatchScript() and parseSshScanResult() shared helpers, used by both paths
- **Files modified:** packages/api/src/services/project-scanner.ts
- **Verification:** All 226 tests pass, full typecheck clean
- **Committed in:** `c128ed3` (Task 3 commit)

**2. [Rule 1 - Bug] Fixed GSD section parsing to stop at ===REMOTE=== delimiter**
- **Found during:** Task 2 (SSH batch extension)
- **Issue:** After adding health sections to SSH batch, GSD section parsing would include REMOTE and subsequent sections
- **Fix:** Changed GSD section split to stop at ===REMOTE=== delimiter
- **Files modified:** packages/api/src/services/project-scanner.ts
- **Verification:** Existing scanner tests pass unchanged
- **Committed in:** `d0ce3da` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- getCollectedHealthData() exports the health data map for Plan 03's post-scan health check phase
- All health data collection and copy upsert logic is wired into the scan cycle
- Event bus ready for health:changed and copy:diverged emissions in Plan 03
- escalateDirtySeverity (from Plan 01) ready for post-scan dirty age re-evaluation

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 07-git-health-engine*
*Completed: 2026-03-14*
