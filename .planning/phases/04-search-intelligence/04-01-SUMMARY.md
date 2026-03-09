---
phase: 04-search-intelligence
plan: 01
subsystem: database
tags: [fts5, sqlite, search, commits, bm25, drizzle]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: SQLite + Drizzle ORM + FTS5 infrastructure
  - phase: 03-capture-pipeline
    provides: Captures table, enrichment pipeline, project scanner
provides:
  - Commits table with dedup by (project_slug, hash)
  - Unified search_index FTS5 table replacing captures_fts and project_metadata_fts
  - searchUnified function returning mixed BM25-ranked results
  - Index population functions (indexCapture, indexProject, indexCommit)
  - Scanner persists last 50 commits per project to SQLite
affects: [04-02, 04-03, 05-enrichments]

# Tech tracking
tech-stack:
  added: []
  patterns: [unified FTS5 index, contentful FTS5 with UNINDEXED metadata, manual search indexing replacing triggers]

key-files:
  created:
    - packages/api/drizzle/0003_commits_and_unified_search.sql
    - packages/api/src/db/queries/commits.ts
    - packages/api/src/__tests__/db/queries/commits.test.ts
  modified:
    - packages/api/src/db/schema.ts
    - packages/api/src/db/queries/search.ts
    - packages/api/src/services/project-scanner.ts
    - packages/api/src/routes/search.ts
    - packages/api/src/routes/captures.ts
    - packages/api/src/index.ts
    - packages/api/drizzle/meta/_journal.json
    - packages/api/src/__tests__/routes/search.test.ts

key-decisions:
  - "FTS5 regular mode (not contentless) for column retrieval and snippet() support"
  - "Manual search indexing replaces FTS5 content-sync triggers for unified multi-source index"
  - "Scanner expanded from 5 to 50 commits per project for search depth"
  - "Deprecated searchCaptures bridges to searchUnified for backward compat"

patterns-established:
  - "Unified search index: single FTS5 table with source_type discriminator for multi-entity search"
  - "Index population: explicit indexCapture/indexCommit/indexProject calls at write time"
  - "UNINDEXED columns for metadata filtering without index bloat"

requirements-completed: [SRCH-01, SRCH-02]

# Metrics
duration: 7min
completed: 2026-03-09
---

# Phase 04 Plan 01: Unified Search Foundation Summary

**Commits table with dedup, unified FTS5 search_index replacing per-table FTS, BM25-ranked mixed search across captures/commits/projects**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-09T20:49:59Z
- **Completed:** 2026-03-09T20:57:20Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Commits table persists git commits with deduplication by (project_slug, hash), supporting rebase message updates
- Unified search_index FTS5 table replaces separate captures_fts and project_metadata_fts, enabling cross-source BM25-ranked search
- searchUnified returns mixed capture/commit/project results with snippet highlighting, source_type and project_slug filtering
- Scanner expanded from 5 to 50 commits per project and now persists them to SQLite on each poll cycle
- All 76 tests pass (20 new), typecheck clean across all packages

## Task Commits

Each task was committed atomically (TDD: test then feat):

1. **Task 1: Commits table schema, migration, and unified search_index FTS5**
   - `295ddd7` test(04-01): add failing tests for commits table CRUD
   - `739cf28` feat(04-01): commits table, unified search_index FTS5, commit queries
2. **Task 2: Unified search query function, search index population, and scanner integration**
   - `2424c7b` test(04-01): add failing tests for unified search and index functions
   - `1848f89` feat(04-01): unified search, index functions, scanner commit persistence

## Files Created/Modified

- `packages/api/drizzle/0003_commits_and_unified_search.sql` - Migration: commits table, drop old FTS, create unified search_index
- `packages/api/src/db/schema.ts` - Added commits table Drizzle schema with unique composite index
- `packages/api/src/db/queries/commits.ts` - upsertCommits (dedup + search index), getCommitsByProject
- `packages/api/src/db/queries/search.ts` - searchUnified, indexCapture, deindexCapture, indexProject, indexCommit
- `packages/api/src/services/project-scanner.ts` - Persists commits to SQLite, indexes projects in search, 50-commit depth
- `packages/api/src/routes/search.ts` - Updated to use searchUnified
- `packages/api/src/routes/captures.ts` - Wired indexCapture on create, deindexCapture on delete
- `packages/api/src/index.ts` - Passes sqlite to scanner for commit persistence
- `packages/api/src/__tests__/db/queries/commits.test.ts` - 5 tests for commit CRUD and dedup
- `packages/api/src/__tests__/routes/search.test.ts` - 15 tests for unified search including mixed results and filters

## Decisions Made

- **FTS5 regular mode over contentless:** Plan specified `content='', contentless_delete=1` but contentless FTS5 returns NULL for all columns including UNINDEXED metadata. Switched to regular FTS5 which stores content, enabling snippet() function and UNINDEXED column filtering. Tradeoff is slightly more disk usage but correct functionality.
- **Manual indexing replaces triggers:** Old FTS tables used content-sync triggers. Unified search_index uses explicit index functions called at write time since it aggregates multiple source tables.
- **Deprecated searchCaptures preserved:** Old function bridges to searchUnified with sourceType='capture' filter for backward compat during route migration.
- **Scanner signature extended:** Added optional `sqlite` parameter to scanAllProjects/startBackgroundPoll rather than switching to DatabaseInstance to minimize caller changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FTS5 contentless mode returns NULL for all columns**
- **Found during:** Task 2 (Unified search implementation)
- **Issue:** Plan specified `content='', contentless_delete=1` for search_index FTS5 table. Contentless FTS5 tables return NULL for all column values (including UNINDEXED), making snippet generation, source_type filtering, and result retrieval impossible.
- **Fix:** Removed `content=''` and `contentless_delete=1` from migration, using regular FTS5 which stores content and supports snippet() and UNINDEXED column filtering.
- **Files modified:** packages/api/drizzle/0003_commits_and_unified_search.sql, packages/api/src/db/queries/search.ts
- **Verification:** All 15 search tests pass including source_type filter, project_slug filter, and snippet tests
- **Committed in:** 1848f89 (Task 2 commit)

**2. [Rule 1 - Bug] TypeScript unused variable errors**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `db` parameter in upsertCommits declared but unused (function uses raw sqlite), `DatabaseInstance` import unused in project-scanner.ts
- **Fix:** Prefixed `db` as `_db`, removed unused import
- **Files modified:** packages/api/src/db/queries/commits.ts, packages/api/src/services/project-scanner.ts
- **Verification:** `pnpm typecheck` passes clean
- **Committed in:** 1848f89 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** FTS5 mode change was essential for correct functionality. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Unified search foundation complete, ready for Plan 02 (search API endpoint + route updates)
- searchUnified supports all filter parameters needed by future search UI
- Scanner commit persistence active, populating search_index on each poll cycle

## Self-Check: PASSED

- All 11 files verified (4 created, 7 modified)
- All 4 commits verified (295ddd7, 739cf28, 2424c7b, 1848f89)
- 76/76 tests passing
- Typecheck clean across all packages

---
*Phase: 04-search-intelligence*
*Completed: 2026-03-09*
