# Phase 16: Prerequisites & Stack Cleanup - Research

**Researched:** 2026-04-11
**Domain:** Technical debt resolution, documentation accuracy, manual QA
**Confidence:** HIGH

## Summary

Phase 16 is a cleanup/gate phase with three concrete deliverables: resolve 4 eng review items (IDEA-05/06/07/08), pass 6 human UAT tests, and update documentation to reflect the SQLite-to-Neon Postgres migration. The good news is that significant work has already been done -- commit `54cec7a` addressed all four eng review items in code, but the requirement statuses were never updated and there is at least one remaining SSE bug in the autonomous routes that needs attention.

The documentation cleanup is straightforward but broad: CLAUDE.md's technology stack section contains 13+ stale SQLite references, PROJECT.md has 4 stale references, and the `db-init.ts` script is entirely obsolete (SQLite initialization for a now-Postgres database). The harness package legitimately uses better-sqlite3 for its own token tracking -- that is NOT stale.

**Primary recommendation:** Structure as 3 plans: (1) Eng review verification + SSE bug fix, (2) Human UAT execution + any fixes, (3) Documentation cleanup. Plan 1 is mostly verification that existing code is correct; Plan 3 is mechanical find-and-replace.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- no locked decisions. User confirmed this phase is mechanical.

### Claude's Discretion
- **D-01:** Eng review rework (IDEA-05/06/07/08) -- scope and depth of fixes for prompt rework, context truncation, SSE errors, DB persistence
- **D-02:** UAT testing -- approach for exercising the 6 human UAT items (manual browser, automated QA, or hybrid)
- **D-03:** Doc cleanup -- scope of documentation updates to reflect SQLite to Neon Postgres migration and v2.0 product reframe

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRE-01 | Phase 15 eng review items (IDEA-05/06/07/08) resolved and committed | Commit `54cec7a` already implemented all 4 fixes. Research found 1 remaining SSE bug in autonomous routes (named events not received by `onmessage`). Requirement status in v1.2-REQUIREMENTS.md needs updating. |
| PRE-02 | Phase 15 human UAT passes (6 test items in 15-HUMAN-UAT.md) | UAT file recovered from git (commit `0c74f76`). 6 items require browser testing. Research identified SSE named-event bug that may cause UAT item 3 (autonomous execution visualization) to fail. |
| PRE-03 | CLAUDE.md updated to reflect SQLite to Neon Postgres migration | Research identified 13+ stale SQLite references in CLAUDE.md, 4 in PROJECT.md, 1 obsolete script (`db-init.ts`). Harness SQLite usage is intentional and should NOT be changed. |
</phase_requirements>

## Standard Stack

No new libraries needed. This phase operates entirely within the existing stack.

### Existing Stack (relevant to this phase)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Hono | ^4.12 | HTTP server + SSE streaming | In use, SSE route needs fix |
| Drizzle ORM | ^0.45 | Postgres ORM (migrated from SQLite) | In use, schema correct |
| Vitest | ^3.1 | Test runner | In use, 342 tests passing |
| PGlite | (test infra) | In-memory Postgres for tests | In use since `f26444e` |

**Installation:** None needed.

## Architecture Patterns

### Current Ideation Pipeline Architecture
```
packages/api/src/ideation/
  orchestrator.ts       -- Async generator, yields IdeationSSEEvent
  skill-bridge.ts       -- Stage definitions, cumulative context (8K cap)
  prompts/              -- Purpose-built prompts (4 stages)
    index.ts            -- Registry
    office-hours.ts     -- Office Hours analysis prompt
    ceo-review.ts       -- CEO Review analysis prompt
    eng-review.ts       -- Eng Review analysis prompt
    design-consultation.ts -- Design Consultation prompt
  templates.ts          -- Repo scaffold templates
```

### SSE Event Flow Pattern (correct -- ideation)
```
Server: streamSSE() -> writeSSE({ data: JSON.stringify(event), id: counter })
Client: EventSource.onmessage -> JSON.parse(event.data)
```
No named `event` field -- data goes to `onmessage`. This is correct.

### SSE Event Flow Pattern (broken -- autonomous)
```
Server: writeSSE({ data: JSON.stringify(event), event: event.type, id: counter })
Client: EventSource.onmessage -> never receives named events
```
Named SSE events require `addEventListener('eventname', handler)`, NOT `onmessage`. The autonomous route sends ALL events as named events, but the frontend only listens on `onmessage`. [VERIFIED: codebase inspection]

### Anti-Patterns to Avoid
- **Named SSE events with onmessage listener:** EventSource.onmessage only receives events WITHOUT a named `event:` field. If you set `event: 'some-type'`, the client must use `addEventListener('some-type', handler)`. The fix is to remove the `event` field from `writeSSE` calls (send type in the JSON data instead), matching the ideation route pattern.

## Don't Hand-Roll

Not applicable -- this phase is cleanup/verification, not new feature development.

## Eng Review Items: Current Status

### IDEA-05: Purpose-built analysis prompts
**Status:** DONE [VERIFIED: commit 54cec7a, codebase inspection]
**Evidence:** `packages/api/src/ideation/prompts/` contains 4 extracted prompts (office-hours.ts, ceo-review.ts, eng-review.ts, design-consultation.ts). `skill-bridge.ts` no longer loads SKILL.md files. `prompts/index.ts` provides `getStagePrompt()` registry. 39 tests added.

### IDEA-06: Cumulative context hard truncation cap (8K tokens)
**Status:** DONE [VERIFIED: codebase inspection]
**Evidence:** `skill-bridge.ts` line 49: `MAX_CONTEXT_CHARS = 32_000` (32K chars ~ 8K tokens). `buildCumulativeContext()` truncates at section boundaries. Tests in `ideation-context.test.ts` verify truncation behavior (4 tests).

### IDEA-07: SSE error events reach the frontend
**Status:** PARTIALLY DONE [VERIFIED: codebase inspection]
**Evidence:** The ideation route (`routes/ideation.ts`) sends error events correctly as unnamed SSE data (no `event:` field), received by `onmessage`. However, the autonomous route (`routes/autonomous.ts`) still has 2 bugs:
1. Line 89: `event: 'error'` -- named 'error' event triggers EventSource's onerror, not onmessage
2. Line 114: `event: event.type` -- ALL autonomous events are named, so onmessage never receives them

The frontend `useAutonomous.ts` line 254 uses `source.onmessage = handleSSEEvent` which will never fire for named events.

**Fix needed:** Remove `event:` field from `autonomous.ts` writeSSE calls (lines 89, 114, 123), matching the ideation route pattern. The event type is already in the JSON data payload.

### IDEA-08: Full stage output persisted in DB for resume
**Status:** DONE [VERIFIED: codebase inspection]
**Evidence:** `schema.ts` line 239: `content: text('content')` column on `ideationArtifacts`. `orchestrator.ts` line 160-168: inserts full `text` into `content` field. Route `ideation.ts` line 96-105: loads existing artifacts for resume. Tests in `ideation-routes.test.ts` cover the route.

### Summary: What remains for PRE-01
1. Fix autonomous SSE named-event bug (remove `event:` field from writeSSE calls)
2. Add/update tests verifying the fix
3. Update v1.2-REQUIREMENTS.md statuses from OPEN to SATISFIED
4. Verify all 342+ tests still pass

## Human UAT Items: Analysis

The 6 UAT items from `15-HUMAN-UAT.md` (recovered from git commit `0c74f76`):

| # | Test | Risk Assessment | Notes |
|---|------|-----------------|-------|
| 1 | Ideation pipeline visual flow | LOW | SSE works correctly for ideation (no named-event bug). Visual animations are CSS-only. |
| 2 | Pipeline completion to scaffold modal | LOW | CTA wiring verified in Phase 15 verification. |
| 3 | Autonomous execution visualization | HIGH | SSE named-event bug means NO autonomous events reach the frontend. This will definitely fail until the bug is fixed. |
| 4 | Decision gate interaction | HIGH | Same SSE bug -- gate events use named SSE events. |
| 5 | Multi-tab session management | LOW | Tab state is client-side React state, no SSE dependency. |
| 6 | Repo scaffold form validation | MEDIUM | Form validation is client-side, but scaffold POST creates filesystem directories -- needs server running. |

**Recommendation (D-02):** Fix the SSE bug FIRST (Plan 1), then run UAT. Items 1, 2, 5 should pass as-is. Items 3, 4 will fail without the SSE fix. Item 6 needs server access. This is a sequential dependency -- Plan 1 before Plan 2.

**UAT approach:** Manual browser testing. The 6 items require visual verification (animations, modal transitions, tab state dots) and real server interaction (SSE streams, filesystem writes). Automated QA cannot verify these effectively. Document results in the UAT file with screenshots or pass/fail notes.

## Documentation Cleanup: Scope

### CLAUDE.md -- Stale SQLite References (13+ occurrences)
[VERIFIED: grep of CLAUDE.md]

| Line Area | Current Content | Should Be |
|-----------|----------------|-----------|
| Constraints | `Hono + SQLite + Drizzle + React` | `Hono + Postgres (Neon) + Drizzle + React` |
| Database & ORM table | `better-sqlite3 ^11.8` as SQLite driver | Remove or replace with `@neondatabase/serverless` / `postgres` driver |
| Database & ORM table | `sqlite-vec ^0.1.8` for vector embeddings | Replace with `pgvector` (if in use) or note as deferred |
| Drizzle row | `First-class better-sqlite3 driver` | `First-class Postgres driver` |
| Alternatives table | `SQLite + better-sqlite3` vs PostgreSQL | Invert -- Postgres is now primary |
| Alternatives table | `sqlite-vec` vs pgvector | Invert -- pgvector is now primary (if migrated) |
| Sources section | better-sqlite3, sqlite-vec links | Replace with Neon/Postgres links |

**Important distinction:** The `@gstackapp/harness` package legitimately uses better-sqlite3 for its own token usage tracking database. This is intentional -- the harness is an independently publishable package that should not depend on Neon Postgres. References to harness SQLite usage should remain accurate.

### PROJECT.md -- Stale References (4 occurrences)
[VERIFIED: grep of PROJECT.md]

| Line | Current | Should Be |
|------|---------|-----------|
| Line 32 | `Cross-repo findings embedded via sqlite-vec` | Update to reflect current embedding approach |
| Line 89 | `Backend: Hono + SQLite + Drizzle ORM` | `Backend: Hono + Postgres (Neon) + Drizzle ORM` |
| Line 92 | `Embeddings: sqlite-vec` | Update to current |
| Line 117 | `sqlite-vec is lightweight` decision | Add note about migration |

### Obsolete Script: `packages/api/scripts/db-init.ts`
[VERIFIED: codebase inspection]

This is a SQLite initialization script that creates tables using raw SQL via better-sqlite3. The main API now uses Drizzle with Postgres. This script is dead code -- Drizzle migrations handle schema management. Should be removed or marked as deprecated.

### Files NOT to change
- `packages/harness/src/db/client.ts` -- Legitimate SQLite usage for token tracking
- `packages/harness/package.json` -- better-sqlite3 is a real dependency
- `packages/harness/src/router/model-router.ts` -- Uses harness DB
- `packages/harness/src/__tests__/*` -- Tests for harness SQLite layer
- `docs/superpowers/plans/2026-03-31-*.md` -- Historical planning docs, not active

## Common Pitfalls

### Pitfall 1: Named SSE Events vs onmessage
**What goes wrong:** Server sends SSE events with `event: 'typename'` but client uses `onmessage` handler, which only receives unnamed events.
**Why it happens:** The SSE spec is counterintuitive -- `onmessage` is the default handler but only fires for events WITHOUT a named `event:` field.
**How to avoid:** Always send event type in the JSON data payload. Only use the SSE `event:` field when the client explicitly uses `addEventListener()` for that event name.
**Warning signs:** Frontend shows "running" but never receives any events. No errors in console.

### Pitfall 2: Updating Harness SQLite References
**What goes wrong:** Overzealous cleanup removes legitimate SQLite references in the harness package.
**Why it happens:** Grep finds "sqlite" everywhere and the instinct is to remove all of them.
**How to avoid:** Harness is an independent package with its own SQLite DB for token tracking. Only update references in `CLAUDE.md`, `PROJECT.md`, and `db-init.ts` (api package). Leave harness alone.
**Warning signs:** Harness tests fail after "cleanup."

### Pitfall 3: UAT Without Running Server
**What goes wrong:** Attempting browser UAT without a fully running dev server (api + web).
**Why it happens:** UAT items require SSE streaming, API calls, and filesystem operations.
**How to avoid:** Start both api and web dev servers before UAT. Verify `/api/health` responds.
**Warning signs:** Network errors in browser console, blank views.

## Code Examples

### Fix for Autonomous SSE Bug
```typescript
// packages/api/src/routes/autonomous.ts
// BEFORE (broken):
await stream.writeSSE({
  data: JSON.stringify(event),
  event: event.type,  // <-- named event, onmessage won't receive
  id: String(eventCounter),
})

// AFTER (correct, matching ideation pattern):
await stream.writeSSE({
  data: JSON.stringify(event),
  id: String(eventCounter),
  // No event field -- type is in the JSON payload
})
```
Source: Pattern from `packages/api/src/routes/ideation.ts` line 126-129 [VERIFIED: codebase]

### Test Pattern for SSE Event Delivery
```typescript
// Verify events arrive as unnamed messages (onmessage), not named events
it('sends autonomous events without named event field', async () => {
  // Use Hono testClient or supertest to hit /api/autonomous/stream/:id
  // Parse SSE response and verify no "event:" lines exist
  // All data should be in "data:" lines as JSON with type field
})
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1 |
| Config file | `vitest.config.ts` (workspace root) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRE-01a | Purpose-built prompts loaded (IDEA-05) | unit | `npx vitest run src/__tests__/ideation-prompts.test.ts` | Yes |
| PRE-01b | Context truncation at 8K (IDEA-06) | unit | `npx vitest run src/__tests__/ideation-context.test.ts` | Yes |
| PRE-01c | SSE errors reach frontend (IDEA-07) | integration | `npx vitest run src/__tests__/ideation-routes.test.ts` | Yes (ideation), needs new test for autonomous |
| PRE-01d | Full output persisted (IDEA-08) | integration | `npx vitest run src/__tests__/ideation-routes.test.ts` | Yes |
| PRE-02 | 6 UAT items pass in browser | manual-only | N/A -- requires running server + browser | N/A |
| PRE-03 | No stale SQLite refs in active docs | grep check | `grep -r 'sqlite\|SQLite' CLAUDE.md PROJECT.md` | Automated in plan |

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/autonomous-sse.test.ts` -- covers SSE event delivery for autonomous routes (verifies no named events)
- [ ] Update `autonomous-events.test.ts` to verify event format

## Security Domain

Not applicable. This phase is technical debt cleanup and documentation -- no new auth, inputs, or attack surfaces.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The autonomous SSE named-event bug is the cause of UAT items 3 and 4 failing | UAT Analysis | LOW -- the bug is verified in code; the only assumption is that this is the ONLY issue blocking those UAT items |
| A2 | `db-init.ts` is dead code and safe to remove | Doc Cleanup | LOW -- if it's still used in production, removing it breaks the init flow. Can verify by checking if any npm scripts reference it. |
| A3 | Cross-repo embeddings (sqlite-vec to pgvector) migration status is unclear | Doc Cleanup | MEDIUM -- the vector search tests are skipped. Need to verify whether pgvector is actually set up on Neon or if cross-repo search is currently broken. |

## Open Questions

1. **Cross-repo vector search status after migration**
   - What we know: `schema.ts` uses Postgres now. `cross-repo-search.test.ts` is skipped (requires pgvector on Neon). `db-init.ts` still references sqlite-vec.
   - What's unclear: Is pgvector actually enabled on the Neon database? Is cross-repo search functional post-migration or is it silently broken?
   - Recommendation: Document current state in CLAUDE.md honestly. If pgvector is not set up, note it as "deferred to Phase 20" (cross-repo intelligence is a DASH-05 requirement).

2. **UAT server requirements**
   - What we know: UAT requires both api and web dev servers running, plus a Neon database connection.
   - What's unclear: Whether the dev environment is configured on the machine where UAT will run.
   - Recommendation: Plan should include "start dev servers" as a prerequisite step for UAT plan.

## Sources

### Primary (HIGH confidence)
- Codebase inspection of all referenced files (orchestrator.ts, skill-bridge.ts, prompts/, routes/ideation.ts, routes/autonomous.ts, useIdeation.ts, useAutonomous.ts, schema.ts, db-init.ts)
- Git history: commits `54cec7a`, `c1fc394`, `f26444e`, `0c74f76`
- Test suite: 342 passing tests, 10 todo, 1 skipped file

### Secondary (MEDIUM confidence)
- v1.2-REQUIREMENTS.md status (created in same commit as the fixes, never updated)

## Metadata

**Confidence breakdown:**
- Eng review status: HIGH -- verified every item against the codebase
- SSE bug: HIGH -- code-level verification of the mismatch
- Doc cleanup scope: HIGH -- grep results are definitive
- UAT risk assessment: MEDIUM -- depends on A1 assumption
- Cross-repo search status: LOW -- skipped tests suggest it may be broken

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- no external dependencies changing)
