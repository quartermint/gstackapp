---
phase: 01-foundation
plan: 02
subsystem: database, api
tags: [sqlite, drizzle-orm, better-sqlite3, fts5, hono, zod, vitest, nanoid, bm25]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Monorepo structure, shared Zod schemas, Hono app skeleton, AppError class"
provides:
  - "SQLite database layer with WAL mode, Drizzle schema, and migrations"
  - "FTS5 full-text search with BM25 ranking and auto-sync triggers"
  - "Captures CRUD API (POST, GET, GET/:id, PATCH/:id, DELETE/:id)"
  - "Search API endpoint (GET /api/search?q=)"
  - "Health endpoint (GET /api/health)"
  - "Test infrastructure with in-memory SQLite and Vitest forks pool"
  - "App factory pattern (createApp) for dependency-injected testing"
affects: [01-03, 02-dashboard-core, 03-capture-pipeline, 04-search]

# Tech tracking
tech-stack:
  added: [better-sqlite3, drizzle-orm, drizzle-kit, nanoid, vitest]
  patterns: [drizzle-schema-as-code, fts5-custom-migration, app-factory-di, tdd-integration-tests, statement-breakpoint-migrations]

key-files:
  created:
    - packages/api/src/db/schema.ts
    - packages/api/src/db/index.ts
    - packages/api/src/db/queries/captures.ts
    - packages/api/src/db/queries/search.ts
    - packages/api/drizzle.config.ts
    - packages/api/drizzle/0000_initial_schema.sql
    - packages/api/drizzle/0001_fts5_search.sql
    - packages/api/drizzle/meta/_journal.json
    - packages/api/src/routes/health.ts
    - packages/api/src/routes/captures.ts
    - packages/api/src/routes/search.ts
    - packages/api/vitest.config.ts
    - packages/api/src/__tests__/helpers/setup.ts
    - packages/api/src/__tests__/routes/health.test.ts
    - packages/api/src/__tests__/routes/captures.test.ts
    - packages/api/src/__tests__/routes/search.test.ts
    - vitest.config.ts
  modified:
    - packages/api/src/app.ts

key-decisions:
  - "App factory pattern (createApp) for dependency injection -- production uses file-backed singleton, tests use in-memory SQLite"
  - "FTS5 queries use raw better-sqlite3 instance (not Drizzle) since Drizzle has no virtual table support"
  - "FTS5 migration uses Drizzle statement-breakpoint markers for compatibility with migrator"
  - "Vitest forks pool for test isolation with native better-sqlite3 module"
  - "Captures CRUD uses parameter injection (db passed to query functions) for testability"

patterns-established:
  - "App factory: createApp(instance?) returns configured Hono app for production or testing"
  - "Query function DI: all query functions accept db as first parameter"
  - "FTS5 custom migration: virtual tables defined in SQL files, NOT in Drizzle schema"
  - "Statement breakpoints: use --> statement-breakpoint to separate SQL statements in Drizzle migrations"
  - "Test isolation: each test file creates its own in-memory database via createTestDb()"
  - "FTS5 query sanitization: strip operators, wrap terms in quotes for safe matching"

requirements-completed: [FOUND-01, FOUND-02, FOUND-03, FOUND-04, PLAT-01, PLAT-02]

# Metrics
duration: 7min
completed: 2026-03-09
---

# Phase 1 Plan 2: Database & API Routes Summary

**SQLite database with Drizzle ORM, FTS5 full-text search with BM25 ranking, captures CRUD API, and 24 integration tests using in-memory database injection**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-09T14:44:24Z
- **Completed:** 2026-03-09T14:52:10Z
- **Tasks:** 2 (Task 2 was TDD: RED + GREEN)
- **Files modified:** 18 created + 1 modified

## Accomplishments
- SQLite database layer with WAL mode, performance pragmas, and Drizzle schema for captures and projects tables
- FTS5 virtual tables (captures_fts + project_metadata_fts) with auto-sync triggers for insert/update/delete
- Full captures CRUD API with Zod validation: create, read, list with filters (projectId, status, userId), update, delete
- FTS5 search endpoint with BM25 ranking, query sanitization, and configurable limits
- Test infrastructure with in-memory SQLite databases and app factory dependency injection
- 24 integration tests covering all endpoints, error cases, and validation

## Task Commits

Each task was committed atomically:

1. **Task 1: SQLite database layer with Drizzle schema, migrations, and FTS5** - `0d317ea` (feat)
2. **Task 2 RED: Integration tests for health, captures CRUD, and FTS5 search** - `37e644e` (test)
3. **Task 2 GREEN: API routes for health, captures CRUD, and FTS5 search** - `3afd6e3` (feat)

## Files Created/Modified
- `packages/api/src/db/schema.ts` - Drizzle table definitions for captures and projects with indexes
- `packages/api/src/db/index.ts` - Database factory with WAL mode, pragmas, and migration runner
- `packages/api/src/db/queries/captures.ts` - CRUD query functions with nanoid ID generation
- `packages/api/src/db/queries/search.ts` - FTS5 search with BM25 ranking and query sanitization
- `packages/api/drizzle.config.ts` - Drizzle Kit configuration for SQLite
- `packages/api/drizzle/0000_initial_schema.sql` - Generated migration for captures + projects tables
- `packages/api/drizzle/0001_fts5_search.sql` - Custom migration for FTS5 virtual tables and triggers
- `packages/api/drizzle/meta/_journal.json` - Migration journal tracking both migrations
- `packages/api/src/routes/health.ts` - Health endpoint returning status, timestamp, version
- `packages/api/src/routes/captures.ts` - Captures CRUD with Zod validation and error handling
- `packages/api/src/routes/search.ts` - FTS5 search endpoint with Zod validation
- `packages/api/src/app.ts` - Updated with createApp factory, route registration, global error handler
- `packages/api/vitest.config.ts` - Vitest config with forks pool for native module isolation
- `packages/api/src/__tests__/helpers/setup.ts` - Test database and app creation helpers
- `packages/api/src/__tests__/routes/health.test.ts` - 3 health endpoint tests
- `packages/api/src/__tests__/routes/captures.test.ts` - 15 captures CRUD integration tests
- `packages/api/src/__tests__/routes/search.test.ts` - 6 FTS5 search integration tests
- `vitest.config.ts` - Root vitest config with projects array for monorepo

## Decisions Made
- **App factory pattern:** `createApp(instance?)` allows tests to inject in-memory databases while production uses file-backed singleton. This avoids global state and makes each test file fully isolated.
- **FTS5 via raw SQL:** FTS5 queries use `better-sqlite3` directly (not Drizzle) because Drizzle has no virtual table support. The `searchCaptures` function accepts the raw `sqlite` instance.
- **Statement breakpoints in FTS5 migration:** Drizzle's migrator splits on `--> statement-breakpoint` markers and executes each chunk individually. Without these markers, the entire file is passed as one statement, which fails.
- **Vitest forks pool:** `better-sqlite3` is a native Node.js module that doesn't work well with Vitest's threads pool. Using `forks` ensures each test file runs in its own process.
- **Query function DI:** All query functions accept `db` as a first parameter rather than importing a singleton. This makes them testable with any database instance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed FTS5 migration format for Drizzle migrator compatibility**
- **Found during:** Task 2 (TDD RED -- tests failed on database creation)
- **Issue:** FTS5 migration SQL file lacked `--> statement-breakpoint` markers between statements. Drizzle's migrator passed the entire file as a single SQL statement to `session.run()`, which failed because SQLite's `run()` can only execute one statement at a time.
- **Fix:** Added `--> statement-breakpoint` after each SQL statement (CREATE VIRTUAL TABLE, CREATE TRIGGER) in `0001_fts5_search.sql`
- **Files modified:** `packages/api/drizzle/0001_fts5_search.sql`
- **Verification:** `pnpm --filter @mission-control/api test` passes all 24 tests
- **Committed in:** `3afd6e3` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration format fix was essential for database initialization. No scope creep.

## Issues Encountered
None beyond the auto-fixed migration format issue.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Database and API layer complete, ready for Plan 01-03 (project scanner, project routes, web dashboard scaffold)
- Captures CRUD and search are functional -- dashboard can fetch and display data
- Test infrastructure established -- Plan 01-03 can add tests following the same pattern
- `pnpm --filter @mission-control/api test` passes 24 tests, `pnpm typecheck` passes cleanly

## Self-Check: PASSED

All 18 created files verified on disk. All 3 task commits (0d317ea, 37e644e, 3afd6e3) verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-09*
