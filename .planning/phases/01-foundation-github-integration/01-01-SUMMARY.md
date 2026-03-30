---
phase: 01-foundation-github-integration
plan: 01
subsystem: database, infra
tags: [npm-workspaces, typescript, drizzle-orm, sqlite, zod, hono, monorepo]

# Dependency graph
requires: []
provides:
  - npm workspaces monorepo with 3 packages (api, web, shared)
  - Shared Zod schemas for Verdict, Stage, PipelineStatus, Severity, StageResult, PipelineRun, Finding, Installation, Repository
  - 6-table Drizzle ORM schema (github_installations, repositories, pull_requests, pipeline_runs, stage_results, findings)
  - SQLite client with WAL mode and busy_timeout=5000
  - Zod-validated environment config with PEM key file resolution
  - TypeScript project references across all packages
affects: [01-02, 01-03, 02-pipeline-execution, 03-review-output, 04-dashboard]

# Tech tracking
tech-stack:
  added: [hono, "@hono/node-server", better-sqlite3, drizzle-orm, drizzle-kit, "@octokit/webhooks", "@octokit/rest", "@octokit/auth-app", zod, pino, nanoid, dotenv, tsx, vitest, smee-client]
  patterns: [npm-workspaces-monorepo, typescript-project-references, drizzle-schema-as-code, zod-validated-config, wal-mode-sqlite]

key-files:
  created:
    - package.json
    - tsconfig.json
    - .env.example
    - .gitignore
    - drizzle.config.ts
    - packages/api/package.json
    - packages/api/tsconfig.json
    - packages/api/src/db/schema.ts
    - packages/api/src/db/client.ts
    - packages/api/src/lib/config.ts
    - packages/web/package.json
    - packages/web/tsconfig.json
    - packages/shared/package.json
    - packages/shared/tsconfig.json
    - packages/shared/src/index.ts
    - packages/shared/src/schemas/verdicts.ts
    - packages/shared/src/schemas/pipeline.ts
    - packages/shared/src/schemas/findings.ts
    - packages/shared/src/schemas/github.ts
  modified: []

key-decisions:
  - "Zod 3.24 over Zod 4 for Phase 1 ecosystem compatibility with Hono/Drizzle/Anthropic SDK"
  - "Explicit DatabaseType annotation on rawDb export to satisfy TypeScript composite project references"
  - "existsSync guard on GITHUB_PRIVATE_KEY_PATH to gracefully handle missing PEM files"

patterns-established:
  - "Monorepo layout: packages/api (Hono backend), packages/web (React frontend), packages/shared (Zod schemas)"
  - "TypeScript project references with composite: true for cross-package type checking"
  - "Drizzle schema-as-code with sqliteTable, indexes, and uniqueIndex constraints"
  - "SQLite pragmas set at connection time before any operations"
  - "Environment config validated through Zod schema at module load"

requirements-completed: [GHUB-01, GHUB-02, GHUB-03, GHUB-04, GHUB-05]

# Metrics
duration: 4min
completed: 2026-03-30
---

# Phase 1 Plan 01: Monorepo Scaffold & Database Schema Summary

**npm workspaces monorepo with 3 packages, 6-table Drizzle schema, shared Zod domain schemas, and WAL-mode SQLite client**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-30T20:25:39Z
- **Completed:** 2026-03-30T20:29:38Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- npm workspaces monorepo with api, web, and shared packages all compiling cleanly via TypeScript project references
- 6-table Drizzle ORM schema with 3 unique indexes (delivery_id, pr_repo_number, stage_run_stage) and 6 regular indexes
- Shared Zod schemas exporting Verdict, Stage, PipelineStatus, Severity enums plus StageResult, PipelineRun, Finding, Installation, Repository object schemas
- SQLite client configured with WAL mode, busy_timeout=5000, foreign_keys=ON, and all performance pragmas
- Environment config with Zod validation and dual PEM key resolution (file path or inline)

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold monorepo, install dependencies, create shared Zod schemas** - `8064ffc` (feat)
2. **Task 2: Create Drizzle schema (6 tables), database client with WAL mode, and env config** - `99496f8` (feat)

## Files Created/Modified
- `package.json` - Root workspaces config with dev/build/test/db scripts
- `tsconfig.json` - Root TypeScript config with project references to all 3 packages
- `.env.example` - Environment variable template for GitHub App credentials
- `.gitignore` - Ignores for node_modules, dist, db files, secrets, tsbuildinfo
- `drizzle.config.ts` - Drizzle-kit config pointing to API schema for migrations
- `packages/api/package.json` - API package with Hono, Drizzle, Octokit, Zod dependencies
- `packages/api/tsconfig.json` - API TypeScript config referencing shared package
- `packages/api/src/db/schema.ts` - 6 Drizzle table definitions with indexes and constraints
- `packages/api/src/db/client.ts` - SQLite connection with WAL mode and performance pragmas
- `packages/api/src/lib/config.ts` - Zod-validated environment config with PEM key resolution
- `packages/web/package.json` - Web package placeholder for Phase 1
- `packages/web/tsconfig.json` - Web TypeScript config
- `packages/shared/package.json` - Shared package with Zod dependency
- `packages/shared/tsconfig.json` - Shared TypeScript config with composite: true
- `packages/shared/src/index.ts` - Re-exports all schema modules
- `packages/shared/src/schemas/verdicts.ts` - Verdict, Stage, PipelineStatus, Severity enums
- `packages/shared/src/schemas/pipeline.ts` - StageResult, PipelineRun schemas
- `packages/shared/src/schemas/findings.ts` - Finding schema with severity tiers
- `packages/shared/src/schemas/github.ts` - Installation, Repository schemas

## Decisions Made
- Used Zod 3.24 over Zod 4 for ecosystem compatibility (Hono, Drizzle, Anthropic SDK all tested against Zod 3.x)
- Added explicit `DatabaseType` annotation on `rawDb` export to satisfy TypeScript composite project reference emit requirements
- Added `existsSync` guard on GITHUB_PRIVATE_KEY_PATH to gracefully handle missing PEM files instead of crashing on readFileSync

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added explicit type annotation for rawDb export**
- **Found during:** Task 2 (Database client)
- **Issue:** TypeScript composite project references cannot infer the type of `rawDb` from the default export of `better-sqlite3`, causing TS4023 error
- **Fix:** Added `import { type Database as DatabaseType }` and explicit type annotation `rawDb: DatabaseType`
- **Files modified:** packages/api/src/db/client.ts
- **Verification:** `npx tsc --build packages/api` compiles cleanly
- **Committed in:** 99496f8 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added .tsbuildinfo to .gitignore**
- **Found during:** Task 2 (After TypeScript build)
- **Issue:** TypeScript project references generate .tsbuildinfo files that should not be committed
- **Fix:** Added `*.tsbuildinfo` pattern to .gitignore
- **Files modified:** .gitignore
- **Verification:** `git status` no longer shows tsbuildinfo files as untracked
- **Committed in:** 99496f8 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correct TypeScript compilation and clean git state. No scope creep.

## Issues Encountered
None - all dependencies installed cleanly, TypeScript compiled on first attempt after the rawDb type fix.

## User Setup Required
None - no external service configuration required for this plan.

## Next Phase Readiness
- Monorepo structure ready for Plan 02 (GitHub App webhook handler) and Plan 03 (Tailscale Funnel)
- Database schema ready for drizzle-kit push once env vars are configured
- Shared types ready for import in both API and future web packages
- GitHub App registration still needed before Plans 02-03 can execute (documented blocker in STATE.md)

## Self-Check: PASSED

All 19 created files verified present. Both task commits (8064ffc, 99496f8) verified in git log.

---
*Phase: 01-foundation-github-integration*
*Completed: 2026-03-30*
