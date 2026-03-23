---
phase: 01-foundation
plan: 03
subsystem: api, frontend
tags: [git, child_process, ttl-cache, project-scanner, hono-rpc, react, tailwind, vite, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Monorepo structure, shared Zod schemas, Hono app skeleton, config loader"
  - phase: 01-02
    provides: "SQLite database layer, Drizzle schema for projects table, app factory pattern, test infrastructure"
provides:
  - "Project scanner that reads git status, branch, dirty files, recent commits from local repos via child_process.execFile"
  - "TTL cache for scan results with configurable expiry"
  - "Background poll that refreshes project data every 5 minutes"
  - "Project API routes: GET /api/projects, GET /api/projects/:slug, POST /api/projects/refresh"
  - "Project database queries: upsertProject, listProjects, getProject"
  - "GSD state reader that parses .planning/STATE.md from scanned repos"
  - "Hono RPC type-safe client for browser-to-API communication"
  - "Minimal React dashboard scaffold showing live project data"
  - "End-to-end proof: browser -> React -> Vite proxy -> Hono API -> SQLite -> response -> rendered"
affects: [02-dashboard-core, 03-capture-pipeline, 05-enrichments]

# Tech tracking
tech-stack:
  added: [hono/client]
  patterns: [child_process-execFile-for-git, ttl-cache-with-map, background-poll-setInterval, hono-rpc-type-safe-client, vite-dev-proxy]

key-files:
  created:
    - packages/api/src/services/project-scanner.ts
    - packages/api/src/services/cache.ts
    - packages/api/src/db/queries/projects.ts
    - packages/api/src/routes/projects.ts
    - packages/api/src/__tests__/services/project-scanner.test.ts
    - packages/api/src/__tests__/routes/projects.test.ts
    - packages/web/src/api/client.ts
    - packages/web/src/app.css
    - packages/web/src/vite-env.d.ts
  modified:
    - packages/api/src/app.ts
    - packages/api/src/index.ts
    - packages/api/package.json
    - packages/web/src/App.tsx
    - packages/web/package.json
    - pnpm-lock.yaml
    - .gitignore

key-decisions:
  - "child_process.execFile over simple-git library for git scanning -- lighter, no dependency, per research recommendation"
  - "TTL cache as simple Map with timestamp entries -- no external cache dependency needed for single-node"
  - "Background poll via setInterval with graceful shutdown on SIGTERM/SIGINT"
  - "Hono RPC client (hc) for type-safe API calls from React -- same hono version in web and api packages"
  - "Plain fetch fallback in App.tsx for pragmatic proof-of-life over strict RPC typing"

patterns-established:
  - "Git scanning: execFile with promisify, 10s timeout, parallel commands via Promise.allSettled"
  - "TTL cache: generic Map-based cache with configurable TTL, invalidate/invalidateAll"
  - "Background poll: setInterval in server entry, clearInterval on shutdown signals"
  - "Hono RPC client: import type AppType from api, create hc<AppType> client for type-safe calls"
  - "Dev proxy: Vite proxies /api/* to localhost:3000 for unified development experience"

requirements-completed: [FOUND-04, FOUND-05, PLAT-01, PLAT-03]

# Metrics
duration: ~15min
completed: 2026-03-09
---

# Phase 1 Plan 3: Project Scanner & Web Scaffold Summary

**Git repo scanner with TTL cache and background polling, project API routes, and React dashboard scaffold proving full-stack connectivity via Hono RPC**

## Performance

- **Duration:** ~15 min (across checkpoint)
- **Started:** 2026-03-09T15:00:00Z
- **Completed:** 2026-03-09T15:15:00Z
- **Tasks:** 3 (Task 1 TDD: RED + GREEN, Task 2 auto, Task 3 human-verify checkpoint)
- **Files modified:** 16 (9 created + 7 modified)

## Accomplishments
- Project scanner reads git status, branch, dirty files, last 5 commits, and GSD state from local repos using child_process.execFile
- TTL cache prevents redundant scans; background poll refreshes every 5 minutes with graceful shutdown
- Project API routes serve list, detail, and refresh endpoints with Zod validation
- Minimal React dashboard renders live project data from the API, proving browser -> Vite proxy -> Hono -> SQLite end-to-end
- 13 new tests (scanner unit + project route integration) pass alongside existing 24 tests

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for project scanner, TTL cache, and project routes** - `96faccf` (test)
2. **Task 1 GREEN: Project scanner, TTL cache, queries, and API routes** - `daaf1d4` (feat)
3. **Task 2: Web scaffold with Hono RPC client and end-to-end proof-of-life** - `7cfb984` (feat)

_Task 3 was a human-verify checkpoint -- approved by user._

## Files Created/Modified
- `packages/api/src/services/project-scanner.ts` - Git repo scanning via execFile, GSD state reader, background poll
- `packages/api/src/services/cache.ts` - Generic TTL cache with configurable expiry
- `packages/api/src/db/queries/projects.ts` - Upsert, list (with host filter), and get-by-slug queries
- `packages/api/src/routes/projects.ts` - GET /projects, GET /projects/:slug, POST /projects/refresh
- `packages/api/src/__tests__/services/project-scanner.test.ts` - Unit tests for scanner and TTL cache with temp git repos
- `packages/api/src/__tests__/routes/projects.test.ts` - Integration tests for project routes
- `packages/api/src/app.ts` - Registered project routes on /api path
- `packages/api/src/index.ts` - Added initial scan, background poll, and graceful shutdown
- `packages/web/src/api/client.ts` - Hono RPC client with AppType import
- `packages/web/src/App.tsx` - Dashboard scaffold showing project list with health indicator
- `packages/web/src/app.css` - Tailwind import and minimal custom styles
- `packages/web/src/vite-env.d.ts` - Vite client type declarations
- `packages/web/package.json` - Added hono dependency for RPC client
- `packages/api/package.json` - Added glob dependency for scanner
- `pnpm-lock.yaml` - Updated lockfile
- `.gitignore` - Added data/ directory

## Decisions Made
- **child_process.execFile over simple-git:** Per research recommendation, execFile is lighter with no external dependency. Git commands run in parallel with Promise.allSettled and 10-second timeouts.
- **Simple Map-based TTL cache:** No need for an external cache library -- a Map with timestamp entries and configurable TTL handles the single-node use case perfectly.
- **Background poll with graceful shutdown:** setInterval refreshes project data every 5 minutes. Server entry registers SIGTERM/SIGINT handlers to clearInterval before exit.
- **Hono RPC client in web package:** Web imports `hc<AppType>` from hono/client for type-safe API calls. Same hono version across packages prevents type mismatch (per research pitfall).
- **Plain fetch as pragmatic fallback:** App.tsx uses direct fetch for the proof-of-life scaffold since RPC type inference can be fragile during early development. Phase 2 can tighten this.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None -- no external service configuration required. Users should create `mc.config.json` from `mc.config.example.json` with their project paths (documented in example file).

## Next Phase Readiness
- Phase 1 Foundation is complete: API server, SQLite/FTS5 database, captures CRUD, search, project scanner, and web scaffold all working
- Phase 2 (Dashboard Core) can build the real departure board UI on top of the web scaffold and project API
- All 37 tests pass across packages, typecheck passes cleanly
- Project scanner provides the data Phase 2 needs for project rows: name, branch, dirty status, commits, GSD state

## Self-Check: PASSED

All 9 created files verified on disk. All 3 task commits (96faccf, daaf1d4, 7cfb984) verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-09*
