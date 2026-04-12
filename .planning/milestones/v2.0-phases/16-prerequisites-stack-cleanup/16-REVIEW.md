---
phase: 16-prerequisites-stack-cleanup
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - CLAUDE.md
  - packages/api/package.json
  - packages/api/src/__tests__/autonomous-sse.test.ts
  - packages/api/src/routes/autonomous.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-04-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the autonomous execution route, its SSE test suite, the API package manifest, and project CLAUDE.md. The route code is well-structured with solid path-traversal mitigation for the projectPath field. The test helper and mock setup are clean.

Key concerns in priority order:

1. **Error event schema mismatch** — the SSE error emitted in the catch block uses `{ type, message }` but the `AutonomousSSEEvent` type defines the error event as `{ type, error }`. The test for "unknown run" checks `errorData.error`, so it would pass, but the catch-block error uses `message` instead. One of these is wrong and a consumer relying on the type definition will hit `undefined` at runtime.
2. **Stale ghost dependencies** — `package.json` lists `better-sqlite3` and `sqlite-vec` as production dependencies even though CLAUDE.md documents the migration to Neon Postgres (commit c1fc394). These still install C-extension native modules on every `npm install`, slow builds, and can cause hard-to-diagnose failures on machines that lack the native build toolchain.
3. **Missing `resetTestDb` call in SSE tests** — the test file calls `seedAutonomousRun()` in each `it()` but never calls `resetTestDb()`. The shared `beforeEach` in `test-db.ts` does call it, so this is safe IF the test file sets up the helper as a Vitest `setupFile`. If it does not (the test only imports `getTestDb`, not `resetTestDb`), rows accumulate across tests and the "id" uniqueness assertions on `idLines.length >= mockEvents.length` become unreliable.
4. Minor: `CLAUDE.md` stack table still documents the old SQLite stack in the introductory section (above the GSD-managed block) while the GSD-managed block is correct.

---

## Critical Issues

### CR-01: SSE error event `message` vs `error` field mismatch

**File:** `packages/api/src/routes/autonomous.ts:120`

**Issue:** The catch block in the `/stream/:runId` handler emits `{ type: 'autonomous:error', message }`, but `AutonomousSSEEvent` defines the error variant as `{ type: 'autonomous:error'; message: string }` — wait, that matches. However the "Run not found" path at line 89 emits `{ type: 'autonomous:error', error: 'Run not found' }` using the field name `error`. These two code paths use different field names (`error` vs `message`) for the same event type, making the shape inconsistent. The test at line 117 of the test file asserts `errorData.error` (the "not found" path), while consumers listening to catch-path errors would receive `errorData.message` (undefined if they check `.error`). The `AutonomousSSEEvent` type only defines `message`, so the "Run not found" SSE at line 89 is the non-conforming one.

**Fix:**
```typescript
// autonomous.ts line 89 — change `error:` to `message:` to match the type
await stream.writeSSE({
  data: JSON.stringify({ type: 'autonomous:error', message: 'Run not found' }),
  id: '0',
})

// autonomous-sse.test.ts line 117 — update assertion accordingly
const errorData = JSON.parse(dataLines[0].replace(/^data:\s*/, ''))
expect(errorData.type).toBe('autonomous:error')
expect(errorData.message).toBe('Run not found')
```

---

## Warnings

### WR-01: Ghost production dependencies (`better-sqlite3`, `sqlite-vec`) after Neon migration

**File:** `packages/api/package.json:25,33`

**Issue:** `better-sqlite3` (a C native addon) and `sqlite-vec` (a C extension) remain as production dependencies after the SQLite → Neon Postgres migration documented in CLAUDE.md. On any machine that lacks Python/node-gyp/build tools, `npm install` will fail to compile these. They are dead weight on the production image and introduce a binary compilation step with zero runtime benefit. (The `@types/better-sqlite3` devDependency at line 37 is similarly orphaned.)

**Fix:** Remove from `dependencies` and `devDependencies`:
```diff
- "better-sqlite3": "^11.8",
- "sqlite-vec": "^0.1.8",

devDependencies:
- "@types/better-sqlite3": "^7.6",
```
Verify nothing in `packages/api/src/` still imports from these packages before removing. (The harness package may legitimately use `better-sqlite3` — check `@gstackapp/harness` before removing it there too.)

### WR-02: Test isolation relies on implicit `setupFile` wiring — not verified in the test file itself

**File:** `packages/api/src/__tests__/autonomous-sse.test.ts:43-51`

**Issue:** `seedAutonomousRun()` inserts rows into `autonomous_runs` in every `it()` block. The `resetTestDb()` / `beforeEach` cleanup lives in `test-db.ts`. For that cleanup to run, `test-db.ts` must be registered as a Vitest `setupFile` in `vitest.config.ts`. If someone adds a new test file or changes the Vitest config, the cleanup silently stops and tests become order-dependent. The file also never imports `resetTestDb` directly, so there is no local safety net.

**Fix:** Add a local `beforeEach` in this test file as a belt-and-suspenders guard:
```typescript
import { resetTestDb } from './helpers/test-db'

beforeEach(async () => {
  await resetTestDb()
})
```

### WR-03: `cancel` endpoint sets `status: 'failed'` semantically incorrectly

**File:** `packages/api/src/routes/autonomous.ts:181-183`

**Issue:** A user-initiated cancellation is recorded as `status: 'failed'`. This conflates two distinct terminal states — a run that errored and a run that was intentionally stopped. Any downstream query that counts failures (e.g., for dashboards or alerts) will miscount user cancellations as errors.

**Fix:** Add a `'cancelled'` status value:
```typescript
await db.update(autonomousRuns)
  .set({ status: 'cancelled', completedAt: new Date() })
  .where(eq(autonomousRuns.id, runId))
```
Also update the schema enum/check constraint for `autonomous_runs.status` to include `'cancelled'` and update any status-checking logic in the frontend or executor that handles terminal states.

---

## Info

### IN-01: CLAUDE.md stack table above GSD block still references SQLite/`better-sqlite3`

**File:** `CLAUDE.md:59-65` (lines inside the GSD-managed `<!-- GSD:stack-start -->` block)

**Issue:** The stack table correctly documents Neon under `### Database & ORM` inside the GSD block, but the non-managed preamble section above the block (the large copy-pasted table starting at line 49) still references the old SQLite decisions in the "Alternatives Considered" section and carries orphaned notes. This creates reader confusion about which stack is canonical.

**Fix:** The GSD-managed block is the authoritative source; the copy-pasted table above it is stale. Either remove it or update it. A `/gsd:quick` doc task is appropriate here.

### IN-02: `ideationContext` is always a simplified stub — comment should explain the limitation

**File:** `packages/api/src/routes/autonomous.ts:94-97`

**Issue:** The `ideationContext` field is populated with only a session ID string (`"Ideation session: ${run.ideationSessionId}"`). The comment says "gracefully skip if not available," but the real issue is that the actual ideation artifacts are never fetched. This silently degrades the quality of autonomous execution for runs linked to ideation sessions. There is no logging, no TODO, and no indication to future developers that this is intentionally incomplete.

**Fix:** At minimum, add a logger warning and a TODO:
```typescript
if (run.ideationSessionId) {
  // TODO(DASH-XX): Fetch actual ideation artifacts from ideation_artifacts table
  // For now, pass only the session ID as a placeholder.
  logger.warn({ ideationSessionId: run.ideationSessionId }, 'Ideation artifacts not fetched — using stub context')
  ideationContext = `Ideation session: ${run.ideationSessionId}`
}
```

### IN-03: `@electric-sql/pglite` is a production dependency but should be dev-only

**File:** `packages/api/package.json:17`

**Issue:** `@electric-sql/pglite` is listed under `dependencies` (production) but is only used in `src/__tests__/helpers/test-db.ts`. It should be a `devDependency` to avoid shipping test infrastructure into production builds.

**Fix:**
```diff
dependencies:
- "@electric-sql/pglite": "^0.4.4",

devDependencies:
+ "@electric-sql/pglite": "^0.4.4",
```

---

_Reviewed: 2026-04-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
