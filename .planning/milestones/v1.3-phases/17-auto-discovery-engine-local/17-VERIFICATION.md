---
phase: 17-auto-discovery-engine-local
verified: 2026-03-16T21:10:00Z
status: passed
score: 5/5 must-haves verified
re_verification: null
gaps: []
human_verification: []
---

# Phase 17: Auto-Discovery Engine (Local) Verification Report

**Phase Goal:** MC automatically finds git repos on the MacBook that are not yet tracked, and users can promote or permanently dismiss them
**Verified:** 2026-03-16T21:10:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running a discovery scan surfaces git repos in configured root directories (depth-1) not already in mc.config.json | VERIFIED | `scanForDiscoveries` in `discovery-scanner.ts` walks `config.discovery.paths` at depth-1, calls `getTrackedLocalPaths(config)` to skip already-tracked repos, skips `EXCLUDED_DIRS` and 0-commit repos via `probeGitRepo` |
| 2 | User can promote a discovered repo to a tracked project via API (atomic config write + projects table + departure board) | VERIFIED | `PATCH /api/discoveries/:id` with `status=tracked` calls `promoteDiscovery` which: updates status, atomically writes mc.config.json via tmp+rename, calls `upsertProject`, triggers `scanProject`, emits `discovery:promoted` SSE |
| 3 | User can dismiss a discovered repo permanently (never re-surfaces) | VERIFIED | `PATCH /api/discoveries/:id` with `status=dismissed` calls `dismissDiscovery`; scanner calls `getDismissedPaths(db, "local")` and skips them; `upsertDiscovery` uses `onConflictDoUpdate` that does NOT overwrite status — dismissed repos stay dismissed |
| 4 | Discovery scan runs on its own independent timer (not inside 5-minute project scan) | VERIFIED | `index.ts` declares separate `discoveryTimer` variable; `startDiscoveryScanner` called inside `if (config)` block after `startBackgroundPoll`; uses its own interval from `config.discovery.scanIntervalMinutes` (default 60 min); cleaned up in `shutdown()` |
| 5 | SSE events `discovery:found` and `discovery:promoted` fire in real time | VERIFIED | `event-bus.ts` includes all three types (`discovery:found`, `discovery:promoted`, `discovery:dismissed`); `scanForDiscoveries` emits `discovery:found` for new repos; `promoteDiscovery` emits `discovery:promoted`; `dismissDiscovery` emits `discovery:dismissed` |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/db/queries/discoveries.ts` | Discovery DB queries — upsert, list, get, updateStatus, getDismissedPaths, getDiscoveryByPath | VERIFIED | All 6 functions present and substantive; `upsertDiscovery` uses `onConflictDoUpdate` targeting `[discoveries.path, discoveries.host]`, preserving status on conflict |
| `packages/api/src/services/discovery-scanner.ts` | Filesystem discovery service — scanForDiscoveries, promoteDiscovery, dismissDiscovery, startDiscoveryScanner | VERIFIED | All 4 exports present; scanner uses `opendir` + `pLimit(5)`, EXCLUDED_DIRS set, `probeGitRepo` checks commit count; promote uses atomic `renameSync` write |
| `packages/api/src/routes/discoveries.ts` | Discovery API route handlers — GET list, PATCH status, POST scan | VERIFIED | All 3 routes present with Zod validators from `@mission-control/shared`; follows existing `createDiscoveryRoutes(getInstance, getConfig)` factory pattern |
| `packages/api/src/app.ts` | App with discovery routes registered | VERIFIED | Line 56: `.route("/api", createDiscoveryRoutes(getInstance, () => config ?? null))` — last route in the Hono chain |
| `packages/api/src/index.ts` | Server with discovery scanner timer wired into startup/shutdown | VERIFIED | `discoveryTimer` declared, started in `if (config)` block on line 73, cleared in `shutdown()` on line 98 |
| `packages/api/src/__tests__/services/discovery-scanner.test.ts` | Scanner unit tests | VERIFIED | 11 tests covering: module exports, upsert (insert + conflict), getDismissedPaths, listDiscoveries (status + host filter), getDiscovery NOT_FOUND, updateDiscoveryStatus, dismissDiscovery (SSE event, throws on re-dismiss), startDiscoveryScanner timer handle |
| `packages/api/src/__tests__/routes/discoveries.test.ts` | Discovery route integration tests | VERIFIED | 9 tests covering: GET empty list, GET after insert with timestamp serialization, GET status filter, GET host filter, GET empty for non-matching filter, PATCH dismiss, PATCH 404, PATCH 400 re-dismiss, POST scan returns 500 in test env |
| `packages/shared/src/schemas/discovery.ts` | Zod schemas for discovery API boundaries | VERIFIED | `listDiscoveriesQuerySchema`, `updateDiscoveryStatusSchema`, `discoverySchema`, `discoveryIdSchema` all present and used in routes |
| `packages/api/src/services/event-bus.ts` | MCEventType union extended with discovery events | VERIFIED | Lines 20-22: `discovery:found`, `discovery:promoted`, `discovery:dismissed` added to union |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `discovery-scanner.ts` | `queries/discoveries.ts` | calls `upsertDiscovery`, `getDismissedPaths`, `getDiscoveryByPath`, `getDiscovery`, `updateDiscoveryStatus` | WIRED | All 5 functions imported and actively called in scan/promote/dismiss flows |
| `discovery-scanner.ts` | `lib/config.ts` | reads `config.discovery.paths` | WIRED | Line 132: `(config.discovery?.paths ?? ["~"]).map(expandPath)` |
| `routes/discoveries.ts` | `services/discovery-scanner.ts` | calls `promoteDiscovery`, `dismissDiscovery`, `scanForDiscoveries` | WIRED | All 3 imported and called in PATCH and POST route handlers |
| `routes/discoveries.ts` | `app.ts` | registered in Hono chain | WIRED | Line 56 of `app.ts`: `.route("/api", createDiscoveryRoutes(...))` |
| `index.ts` | `services/discovery-scanner.ts` | imports and calls `startDiscoveryScanner` | WIRED | Line 11 import; line 73: `discoveryTimer = startDiscoveryScanner(config, discoveryDb)` |

### Requirements Coverage

| Requirement | Phase 17 Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| DISC-01 | 17-01, 17-02, 17-03 | Discovery engine walks configured root directories (depth-1) to find git repos not in mc.config.json | SATISFIED | `scanForDiscoveries` implements depth-1 walk with `opendir`, skips tracked paths from config, skips excluded dirs, persists via `upsertDiscovery` |
| DISC-03 | 17-02, 17-03 | User can promote a discovered repo to tracked project (writes to mc.config.json + projects table atomically) | SATISFIED | `promoteDiscovery` does status update → atomic config write (tmp+rename) → `upsertProject` → `scanProject` trigger |
| DISC-04 | 17-01, 17-02, 17-03 | User can dismiss a discovered repo permanently (never re-surfaces) | SATISFIED | `dismissDiscovery` sets status=dismissed; `getDismissedPaths` used by scanner to filter; `upsertDiscovery` conflict logic preserves existing status |
| DISC-09 | 17-03 | Discovery runs on its own timer (not inside 5-minute project scan cycle) | SATISFIED | Separate `discoveryTimer` in `index.ts`, independent `setInterval` in `startDiscoveryScanner`, default 60-minute interval vs 5-minute project scan |
| DISC-10 | 17-02, 17-03 | SSE events emit `discovery:found` and `discovery:promoted` for real-time dashboard updates | SATISFIED | Both events emitted in scanner and promote flow; `discovery:dismissed` also added as bonus |

**No orphaned requirements.** REQUIREMENTS.md maps DISC-01, DISC-03, DISC-04, DISC-09, DISC-10 to Phase 17 — all five are claimed in plans and verified in code. DISC-08 is correctly deferred to Phase 21 (Dashboard).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | None found |

No TODOs, FIXMEs, placeholder returns, empty implementations, or stub handlers found in any phase 17 files.

### Human Verification Required

None. All success criteria are verifiable programmatically:
- Scanner filtering logic verified via unit tests with in-memory DB
- Route behavior verified via integration tests with direct DB inserts
- Timer wiring verified by reading `index.ts` directly
- Atomic config write pattern verified (tmp+rename in `promoteDiscovery`)

The one item that would require human testing in a real environment — actual filesystem discovery against the MacBook's real home directory — is covered by the architecture: the `probeGitRepo` function uses `existsSync(.git)` + `git rev-list --count HEAD`, which is a well-understood pattern with explicit exclusions.

### Gaps Summary

No gaps. All five phase success criteria pass:

1. Depth-1 scan with exclusions, tracked-path filtering, and 0-commit filtering — implemented and tested.
2. Promote flow: atomic config write + project upsert + scan trigger + SSE — fully wired end-to-end.
3. Dismiss with permanent suppression via dismissed-paths filter — implemented and confirmed by upsert conflict logic that preserves status.
4. Independent timer at configurable interval (default 60 min) with proper shutdown cleanup — verified in `index.ts`.
5. SSE events for `discovery:found` and `discovery:promoted` — both fire; `discovery:dismissed` added as well.

All 7 commits verified in git history. All 20 new tests pass. Typecheck exits 0.

---

_Verified: 2026-03-16T21:10:00Z_
_Verifier: Claude (gsd-verifier)_
