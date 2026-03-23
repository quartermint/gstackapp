---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [monorepo, pnpm, turbo, hono, react, vite, tailwind, zod, typescript, drizzle, sqlite]

# Dependency graph
requires: []
provides:
  - "Clean monorepo structure with packages/api, packages/web, packages/shared"
  - "Shared Zod schemas for captures, projects, API responses, search"
  - "TypeScript types derived from Zod schemas"
  - "Hono app skeleton with health endpoint"
  - "React + Vite web scaffold"
  - "mc.config.example.json project registry shape"
  - "AppError typed error class with factory functions"
  - "Config loader with Zod validation"
affects: [01-02, 01-03, 02-dashboard-core, 03-capture-pipeline, 04-search]

# Tech tracking
tech-stack:
  added: [hono, "@hono/node-server", "@hono/zod-validator", drizzle-orm, better-sqlite3, nanoid, tsx, react-19, react-dom-19, vite-6, tailwindcss-4, "@tailwindcss/vite", vitest, zod, turbo]
  patterns: [pnpm-workspaces, turbo-tasks, typescript-project-references, zod-schema-first-types, esm-throughout]

key-files:
  created:
    - mc.config.example.json
    - packages/shared/src/schemas/capture.ts
    - packages/shared/src/schemas/project.ts
    - packages/shared/src/schemas/api.ts
    - packages/shared/src/types/index.ts
    - packages/shared/src/index.ts
    - packages/api/src/index.ts
    - packages/api/src/app.ts
    - packages/api/src/lib/errors.ts
    - packages/api/src/lib/config.ts
    - packages/web/src/main.tsx
    - packages/web/src/App.tsx
    - packages/web/vite.config.ts
    - packages/web/index.html
  modified:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - tsconfig.base.json
    - .gitignore
    - CLAUDE.md

key-decisions:
  - "ESM throughout -- all packages use type: module"
  - "Removed CLAUDE.md from .gitignore so project instructions are tracked"
  - "Web tsconfig uses bundler moduleResolution for Vite compatibility"
  - "Zod schema-first approach: TypeScript types derived from schemas via z.infer"

patterns-established:
  - "Schema-first types: define Zod schema, derive TS type with z.infer"
  - "Barrel exports: packages/shared/src/index.ts re-exports all schemas and types"
  - "TypeScript project references: api references shared, web references api"
  - "Config via file: mc.config.json loaded with Zod validation, path overridable via MC_CONFIG_PATH"
  - "AppError class with code/status for typed error handling"

requirements-completed: [FOUND-01, PLAT-01, PLAT-02, PLAT-03]

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 1 Plan 1: Monorepo Scaffold Summary

**Clean-slate monorepo with Hono API, React/Vite dashboard, and shared Zod schemas defining capture/project/search contracts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T14:36:08Z
- **Completed:** 2026-03-09T14:40:29Z
- **Tasks:** 2
- **Files modified:** 24 new + 6 updated root configs (3000+ old files deleted)

## Accomplishments
- Wiped entire ZeroClaw codebase (hub, worker, compute, swift, apps, convex, dashboard, scripts, infra, docs)
- Scaffolded clean pnpm monorepo with packages/api (Hono), packages/web (React/Vite), packages/shared (Zod)
- Created shared Zod schemas for captures, projects, API responses, and search with userId field (PLAT-02)
- Rewrote CLAUDE.md to reflect Mission Control identity and architecture

## Task Commits

Each task was committed atomically:

1. **Task 1: Wipe old code and scaffold monorepo structure** - `6408c82` (feat)
2. **Task 2: Implement shared Zod schemas and TypeScript types** - `cdbb9e8` (feat)

## Files Created/Modified
- `package.json` - Updated to Mission Control identity, pnpm 9.15, ESM
- `pnpm-workspace.yaml` - Removed convex entry
- `turbo.json` - Kept existing task definitions
- `tsconfig.base.json` - Added composite: true for project references
- `.gitignore` - Added mc.config.json, data/, removed Convex/Xcode/Wrangler entries
- `CLAUDE.md` - Complete rewrite for Mission Control
- `mc.config.example.json` - Project registry shape documentation
- `packages/shared/src/schemas/capture.ts` - Capture CRUD schemas with userId
- `packages/shared/src/schemas/project.ts` - Project schemas with host enum
- `packages/shared/src/schemas/api.ts` - Error, health, search schemas
- `packages/shared/src/types/index.ts` - z.infer derived types
- `packages/shared/src/index.ts` - Barrel exports for all schemas and types
- `packages/api/src/index.ts` - Hono server entry with graceful shutdown
- `packages/api/src/app.ts` - Hono app with logger, CORS, health endpoint
- `packages/api/src/lib/errors.ts` - AppError class with factory functions
- `packages/api/src/lib/config.ts` - mc.config.json loader with Zod validation
- `packages/web/src/main.tsx` - React 19 createRoot entry
- `packages/web/src/App.tsx` - Proof-of-life component
- `packages/web/vite.config.ts` - React + Tailwind plugins, API proxy
- `packages/web/index.html` - Minimal HTML shell

## Decisions Made
- ESM throughout: all packages set `"type": "module"` for consistent module system
- Removed CLAUDE.md from .gitignore -- project instructions should be version-controlled for the new Mission Control project
- Web tsconfig uses `bundler` moduleResolution (required by Vite) while API/shared use `NodeNext`
- Zod schema-first approach: all TypeScript types derived from schemas, ensuring runtime validation and compile-time types stay in sync

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed web tsconfig rootDir conflict with vite.config.ts**
- **Found during:** Task 1 (Scaffold monorepo structure)
- **Issue:** `rootDir: "src"` in web tsconfig conflicted with `vite.config.ts` being included but living outside `src/`
- **Fix:** Removed `rootDir` constraint and removed `vite.config.ts` from `include` array (Vite handles its own config independently)
- **Files modified:** `packages/web/tsconfig.json`
- **Verification:** `pnpm typecheck` passes
- **Committed in:** `6408c82` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor tsconfig adjustment for Vite compatibility. No scope creep.

## Issues Encountered
None beyond the auto-fixed tsconfig issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Monorepo structure ready for Plan 01-02 (SQLite database, captures CRUD, FTS5 search)
- Shared schemas define the API contract that route handlers will validate against
- Config loader ready for project scanner in Plan 01-03
- `pnpm install` and `pnpm typecheck` both pass cleanly

## Self-Check: PASSED

All 14 created files verified on disk. Both task commits (6408c82, cdbb9e8) verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-09*
