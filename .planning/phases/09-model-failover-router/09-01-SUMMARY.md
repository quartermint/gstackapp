---
phase: 09-model-failover-router
plan: 01
subsystem: infra
tags: [sqlite, drizzle, better-sqlite3, pino, error-detection, multi-provider, failover]

requires:
  - phase: 08-seam-cleanup-extract
    provides: harness package structure, provider adapters, registry

provides:
  - ProviderDegradedError and AllProvidersDegradedError error types
  - RouterConfig type and loadRouterConfig() from env vars
  - isProviderCapError() cross-SDK rate limit/billing error detection
  - extractRetryAfterMs() retry-after header parsing
  - tokenUsage Drizzle schema with provider+timestamp index
  - getHarnessDb() optional SQLite connection with WAL mode
  - UsageBuffer class with periodic flush and graceful degradation

affects: [09-02-model-router, 09-03-router-integration]

tech-stack:
  added: [better-sqlite3, drizzle-orm, pino, "@types/better-sqlite3", drizzle-kit]
  patterns: [graceful-db-degradation, cross-sdk-error-detection, env-var-config-with-defaults, in-memory-buffer-with-periodic-flush]

key-files:
  created:
    - packages/harness/src/router/errors.ts
    - packages/harness/src/router/config.ts
    - packages/harness/src/router/reactive.ts
    - packages/harness/src/router/index.ts
    - packages/harness/src/db/schema.ts
    - packages/harness/src/db/client.ts
    - packages/harness/src/db/usage-buffer.ts
    - packages/harness/src/__tests__/router-infra.test.ts
    - packages/harness/src/__tests__/usage-buffer.test.ts
  modified:
    - packages/harness/package.json

key-decisions:
  - "Used raw SQL for runtime table creation instead of drizzle-kit migrations (simpler deployment, no build-time dependency)"
  - "Anthropic billing error detection uses err.error.error.type path (SDK wraps body in .error property)"

patterns-established:
  - "Graceful DB degradation: null db means silently buffer, write errors retain records for retry"
  - "Cross-SDK error detection: instanceof checks against each SDK's error classes"
  - "Router config via ROUTER_* env vars with sensible defaults"

requirements-completed: [RTR-01, RTR-02, RTR-04, RTR-07, RTR-09]

duration: 4min
completed: 2026-04-03
---

# Phase 09 Plan 01: Router Infrastructure Summary

**Cross-SDK error detection, router config, token usage schema, and UsageBuffer with periodic SQLite flush**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T19:31:15Z
- **Completed:** 2026-04-03T19:35:36Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Router error types (ProviderDegradedError, AllProvidersDegradedError) for failover signaling
- Cross-SDK error detection identifying rate limit and billing errors from Anthropic, OpenAI, and Gemini
- Router config loading from 10 ROUTER_* env vars with sensible defaults
- Token usage SQLite schema with WAL mode and in-memory buffer flushing every 5 minutes
- 29 new tests (18 router-infra + 11 usage-buffer), all 64 harness tests passing

## Task Commits

1. **Task 1: Router infrastructure -- errors, config, error detection** - `1751da1` (feat)
2. **Task 2: Token usage DB schema and UsageBuffer with periodic flush** - `ca4f3b4` (feat)

## Files Created/Modified
- `packages/harness/src/router/errors.ts` - ProviderDegradedError and AllProvidersDegradedError classes
- `packages/harness/src/router/config.ts` - RouterConfig type and loadRouterConfig() from env vars
- `packages/harness/src/router/reactive.ts` - isProviderCapError() and extractRetryAfterMs() cross-SDK detection
- `packages/harness/src/router/index.ts` - Barrel export for router module
- `packages/harness/src/db/schema.ts` - Drizzle tokenUsage table with provider+timestamp index
- `packages/harness/src/db/client.ts` - getHarnessDb() optional SQLite with WAL mode
- `packages/harness/src/db/usage-buffer.ts` - UsageBuffer with periodic flush and graceful degradation
- `packages/harness/src/__tests__/router-infra.test.ts` - 18 tests for errors, config, error detection
- `packages/harness/src/__tests__/usage-buffer.test.ts` - 11 tests with real in-memory SQLite
- `packages/harness/package.json` - Added better-sqlite3, drizzle-orm, pino dependencies

## Decisions Made
- Used raw SQL for runtime table creation instead of drizzle-kit migrations (simpler deployment, no build-time dependency at runtime)
- Anthropic billing error detected via `err.error.error.type === 'billing_error'` (SDK wraps the API response body in an `.error` property)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Anthropic billing error body path**
- **Found during:** Task 1 (isProviderCapError implementation)
- **Issue:** Plan specified `(err as any)?.error?.type === 'billing_error'` but Anthropic SDK wraps body at `err.error.error.type`
- **Fix:** Changed to `body?.error?.type === 'billing_error'` where body is `(err as any)?.error`
- **Files modified:** packages/harness/src/router/reactive.ts
- **Verification:** Test with real Anthropic.BadRequestError passes
- **Committed in:** 1751da1

**2. [Rule 1 - Bug] Fixed SDK error constructor headers parameter**
- **Found during:** Task 1 (test writing)
- **Issue:** Anthropic and OpenAI SDK error constructors require a Headers object with `.get()`, not plain object
- **Fix:** Used `new Headers()` in tests
- **Files modified:** packages/harness/src/__tests__/router-infra.test.ts
- **Verification:** All SDK error instance checks pass
- **Committed in:** 1751da1

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Router infrastructure ready for Plan 02 (ModelRouter class)
- isProviderCapError() provides detection layer for RTR-01 reactive failover loop
- UsageBuffer provides data collection for RTR-02 burn rate prediction
- RouterConfig provides configurable fallback policies and provider chains

---
*Phase: 09-model-failover-router*
*Completed: 2026-04-03*
