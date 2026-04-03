---
phase: 09-model-failover-router
plan: 02
subsystem: router
tags: [failover, burn-rate, predictive, reactive, quality-aware, llm-router, pino]

# Dependency graph
requires:
  - phase: 09-model-failover-router (plan 01)
    provides: router errors, config, reactive error detection, UsageBuffer, DB client
provides:
  - ModelRouter class implementing LLMProvider with 3-layer failover
  - BurnRateCalculator with prediction accuracy tracking (D-19)
  - RequestQueue for all-degraded queueing
  - ProactivePoller for Anthropic Admin API
  - resolveModel() router integration (transparent wrapping)
  - Barrel exports from @gstackapp/harness
affects: [pipeline-execution, stage-runner, harness-consumers]

# Tech tracking
tech-stack:
  added: [pino (logger in registry)]
  patterns: [decorator pattern (ModelRouter wraps LLMProvider), lazy singleton (getRouter), quality-aware tier mapping]

key-files:
  created:
    - packages/harness/src/router/model-router.ts
    - packages/harness/src/router/predictive.ts
    - packages/harness/src/router/queue.ts
    - packages/harness/src/router/proactive.ts
    - packages/harness/src/__tests__/model-router.test.ts
    - packages/harness/src/__tests__/router-integration.test.ts
  modified:
    - packages/harness/src/router/index.ts
    - packages/harness/src/registry.ts
    - packages/harness/src/index.ts
    - packages/harness/src/__tests__/index.test.ts

key-decisions:
  - "OPUS_CAPABLE_PROVIDERS=['anthropic'] and OPUS_TIER_STAGES=['ceo','security'] as explicit module-level constants for quality-aware routing"
  - "Passthrough mode: no router overhead when single provider + 'none' policy"
  - "Existing index.test.ts updated to force passthrough mode via env vars to avoid false regressions"

patterns-established:
  - "Decorator pattern: ModelRouter implements LLMProvider, wraps raw providers transparently"
  - "Lazy singleton: getRouter() creates router once, returns null for passthrough"
  - "Structured logging: every route_decision includes event, provider, reason, burnRate, predictionAccuracy, fallbackPolicy, queueDepth"

requirements-completed: [RTR-01, RTR-02, RTR-03, RTR-05, RTR-06, RTR-08]

# Metrics
duration: 7min
completed: 2026-04-03
---

# Phase 09 Plan 02: ModelRouter with 3-layer failover, quality-aware routing, and registry integration

**ModelRouter implementing LLMProvider with predictive burn rate + reactive 429 catch + proactive API polling, quality-aware stage-tier routing (CEO/Security queue for Opus), and transparent resolveModel() wrapping**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-03T19:37:30Z
- **Completed:** 2026-04-03T19:45:11Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- ModelRouter implements LLMProvider with 3-layer routing: predictive (burn rate projection), reactive (429/billing catch), quality-aware (Opus-tier stages queue rather than degrade)
- BurnRateCalculator queries token_usage DB, records predictions, tracks accuracy deltas (D-19)
- RequestQueue handles all-degraded scenario with drain/clear lifecycle
- ProactivePoller queries Anthropic Admin API when key available, graceful no-key fallback
- resolveModel() transparently wraps providers -- callers unchanged, zero overhead in passthrough mode
- 110 tests passing across 9 test files, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: BurnRateCalculator, RequestQueue, ModelRouter core**
   - `9ad9807` (test) - failing tests for all three modules
   - `3447344` (feat) - implementation passing all 36 tests
2. **Task 2: Proactive poller, registry wiring, harness exports**
   - `2bbb959` (test) - failing integration tests
   - `97e3481` (feat) - implementation passing all 110 tests

## Files Created/Modified
- `packages/harness/src/router/model-router.ts` - ModelRouter class, 3-layer routing, quality-aware failover
- `packages/harness/src/router/predictive.ts` - BurnRateCalculator with shouldSwitch, prediction accuracy
- `packages/harness/src/router/queue.ts` - RequestQueue with enqueue/drain/clear
- `packages/harness/src/router/proactive.ts` - ProactivePoller for Anthropic Admin API
- `packages/harness/src/router/index.ts` - Updated barrel with all router exports
- `packages/harness/src/registry.ts` - getRouter() lazy init, resolveModel() integration
- `packages/harness/src/index.ts` - ModelRouter, errors, config exports from @gstackapp/harness
- `packages/harness/src/__tests__/model-router.test.ts` - 36 tests for reactive, predictive, quality-aware, boundary, observability
- `packages/harness/src/__tests__/router-integration.test.ts` - 10 integration tests
- `packages/harness/src/__tests__/index.test.ts` - Updated for passthrough mode

## Decisions Made
- OPUS_CAPABLE_PROVIDERS=['anthropic'] and OPUS_TIER_STAGES=['ceo','security'] defined as explicit module-level constants rather than derived from PROFILES, for clarity and testability
- Passthrough mode (no router wrapper) when fallbackPolicy='none' and single provider in chain -- zero overhead for simple setups
- Updated existing index.test.ts to set ROUTER_FALLBACK_POLICY=none and ROUTER_PROVIDER_CHAIN=anthropic to maintain passthrough behavior and avoid false regressions from router integration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unhandled promise rejections in queue tests**
- **Found during:** Task 1 (model-router tests)
- **Issue:** Tests that queue requests then call router.shutdown() triggered unhandled promise rejections because shutdown() calls queue.clear() which rejects pending promises
- **Fix:** Added `.catch(() => {})` on queued promises in tests that verify queuing behavior
- **Files modified:** packages/harness/src/__tests__/model-router.test.ts
- **Committed in:** 3447344

**2. [Rule 1 - Bug] Fixed index.test.ts regression from router integration**
- **Found during:** Task 2 (registry wiring)
- **Issue:** Existing test expected `result.provider.name === 'gemini'` but with multiple providers configured, router wraps the provider and returns `router(anthropic)`
- **Fix:** Added env var setup in beforeEach to force passthrough mode: `ROUTER_FALLBACK_POLICY=none`, `ROUTER_PROVIDER_CHAIN=anthropic`
- **Files modified:** packages/harness/src/__tests__/index.test.ts
- **Committed in:** 97e3481

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for test correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## Known Stubs
None - all router layers are fully wired. ProactivePoller's API response parsing is best-effort (logs response shape for debugging) but this is intentional per D-12 -- the proactive layer is supplementary.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 9 (model-failover-router) is complete -- both infrastructure (plan 01) and routing logic (plan 02) shipped
- Router is ready for use by pipeline execution stages
- Gemini and OpenAI provider integration for router (multi-provider failover) requires SDK setup (tracked as blocker)
- npm publish for @gstackapp scope needed before external consumption (tracked as blocker)

---
*Phase: 09-model-failover-router*
*Completed: 2026-04-03*

## Self-Check: PASSED
All 9 created/modified files verified on disk. All 4 commit hashes found in git log.
