---
phase: 33-capture-intelligence-engine
plan: "04"
subsystem: api
tags: [imessage, chat-db, better-sqlite3, ambient-capture, apple-timestamp, polling]

requires:
  - phase: 33-capture-intelligence-engine/03
    provides: ambientCaptureSchema with capacities and crawl4ai sections
provides:
  - iMessage monitor service polling chat.db for new messages from configured contacts
  - Apple nanosecond timestamp conversion (convertAppleTimestamp, dateToAppleNanos)
  - attributedBody binary plist text extraction for NULL text column
  - Config schema extension with imessage section (chatDbPath, contacts, pollIntervalMinutes, enabled)
  - Server startup wiring with graceful shutdown
affects: [dashboard-captures, ios-companion, mcp-tools]

tech-stack:
  added: []
  patterns: [readonly-sqlite-connection, apple-epoch-offset, binary-plist-extraction, interval-polling-with-cleanup]

key-files:
  created:
    - packages/api/src/services/imessage-monitor.ts
    - packages/api/src/__tests__/services/imessage-monitor.test.ts
  modified:
    - packages/api/src/lib/config.ts
    - packages/api/src/index.ts

key-decisions:
  - "Readonly better-sqlite3 connection with busy_timeout=1000 for concurrent access safety"
  - "Binary plist extraction uses NSString marker regex + longest printable run fallback"
  - "TCC/FDA errors auto-disable polling to prevent log spam"
  - "24-hour lookback on first run to catch recent messages"

patterns-established:
  - "Apple timestamp conversion: APPLE_EPOCH_OFFSET=978307200, divide by 1e9 for seconds"
  - "Chat.db access pattern: open readonly, query, close immediately (no persistent connection)"
  - "FDA error detection via SQLITE_CANTOPEN/EPERM with clearInterval self-disable"

requirements-completed: [CAP-09]

duration: 5min
completed: 2026-03-23
---

# Phase 33 Plan 04: iMessage Monitor Summary

**Passive iMessage chat.db polling with Apple timestamp conversion, attributedBody extraction, and config-driven enable/disable toggle**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T10:54:29Z
- **Completed:** 2026-03-23T11:00:06Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files modified:** 4

## Accomplishments
- iMessage monitor service polls chat.db readonly for messages from configured contacts
- Apple nanosecond timestamps correctly converted to/from JS Dates (2001-01-01 epoch offset)
- attributedBody binary plist extraction handles NULL text column with NSString marker regex and printable-run fallback
- Config schema extended with imessage section; server wires startup and shutdown cleanly
- TCC/Full Disk Access errors detected and disable further polling automatically
- 15 new tests, 749 total API tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: iMessage monitor service (TDD RED)** - `ad16073` (test)
2. **Task 1: iMessage monitor service (TDD GREEN)** - `263c1eb` (feat)
3. **Task 2: Config extension + server wiring** - `c666890` (feat)

_Task 3 (checkpoint: Full Disk Access verification) auto-approved per autonomous mode._

## Files Created/Modified
- `packages/api/src/services/imessage-monitor.ts` - iMessage chat.db polling service with timestamp conversion, attributedBody extraction, and interval-based monitoring
- `packages/api/src/__tests__/services/imessage-monitor.test.ts` - 15 tests covering timestamps, text extraction, polling, and enable/disable guards
- `packages/api/src/lib/config.ts` - Added imessage sub-schema to ambientCaptureSchema
- `packages/api/src/index.ts` - Wired startIMessageMonitor at startup, imessageTimer cleanup at shutdown

## Decisions Made
- Readonly better-sqlite3 connection with `busy_timeout = 1000` for concurrent access safety (iMessage may be writing while we read)
- Binary plist extraction: NSString marker regex as primary strategy, longest printable ASCII run as fallback
- TCC/FDA errors (SQLITE_CANTOPEN, EPERM) auto-disable polling via clearInterval to prevent log spam
- 24-hour lookback on first startup to catch recent messages
- Captures use `sourceType: "imessage"` (already in schema from v1.3 planning)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported DEFAULT_POLL_INTERVAL_MS to fix TS6133**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** TypeScript strict mode flagged unused constant
- **Fix:** Changed to `export const` since it may be useful for consumers
- **Files modified:** packages/api/src/services/imessage-monitor.ts
- **Verification:** Typecheck passes for all plan 33-04 files

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor TypeScript strictness fix. No scope creep.

## Human Verification Required

**Full Disk Access (FDA)** must be granted manually before iMessage monitoring works:
1. Open System Settings > Privacy & Security > Full Disk Access
2. Add Terminal.app (or the node process) to the allowed list
3. Enable `ambientCapture.imessage.enabled: true` in mc.config.json with contact identifiers
4. Restart the API server
5. Verify: `curl http://localhost:3000/api/captures?limit=5` shows captures with `sourceType: "imessage"`

The service handles FDA absence gracefully -- it logs an actionable error and disables itself.

## Issues Encountered
- Pre-existing typecheck errors in `prompt-validator.test.ts` (headCommit property) unrelated to this plan -- logged but not addressed (out of scope)

## Next Phase Readiness
- iMessage monitoring ready for production once FDA is granted and contacts configured
- Captures flow through existing enrichment pipeline (AI categorization, extraction, grounding)
- SSE events emitted for real-time dashboard updates via `capture:created` with `imessage` subtype

---
*Phase: 33-capture-intelligence-engine*
*Completed: 2026-03-23*
