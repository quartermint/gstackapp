---
phase: 09-model-failover-router
verified: 2026-04-03T21:50:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 09: Model Failover Router Verification Report

**Phase Goal:** The harness automatically routes LLM requests across providers (Claude -> Gemini -> Qwen) using predictive burn rate analysis, proactive API polling, and reactive error catching -- so billing caps never kill a workflow
**Verified:** 2026-04-03T21:50:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                     | Status     | Evidence                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | When Claude returns 429/billing error, router retries on next provider without user intervention          | ✓ VERIFIED | `isProviderCapError()` in reactive.ts; `handleCapError()` in model-router.ts marks provider degraded, calls `retryOnProvider()`      |
| 2   | Token burn rate predicts cap exhaustion and proactively switches 30 min before projected cap              | ✓ VERIFIED | `BurnRateCalculator.shouldSwitch()` in predictive.ts queries token_usage DB, computes minutesToCap, records prediction for D-19      |
| 3   | Router NEVER switches providers mid-tool-loop -- failover only between createCompletion() calls           | ✓ VERIFIED | Non-cap errors re-thrown at line 116 of model-router.ts; RTR-06 comment + boundary test "on non-cap error, entire call fails"        |
| 4   | Fallback policy configurable per-context: gstackapp uses 'none' (default), harness standalone uses 'quality-aware' | ✓ VERIFIED | `loadRouterConfig()` defaults to 'none' via `ROUTER_FALLBACK_POLICY` env var; D-16 specifies gstackapp default = 'none', configurable |
| 5   | Every routing decision logged with structured observability: provider, reason, burn rate, prediction accuracy | ✓ VERIFIED | model-router.ts logs `{ event: 'route_decision', provider, reason, burnRate, predictionAccuracy, fallbackPolicy, queueDepth }` on every path |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                                         | Expected                                            | Status     | Details                                                             |
| ------------------------------------------------ | --------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| `packages/harness/src/router/errors.ts`          | ProviderDegradedError, AllProvidersDegradedError    | ✓ VERIFIED | Both classes extend Error with typed properties                     |
| `packages/harness/src/router/config.ts`          | RouterConfig type and loadRouterConfig()            | ✓ VERIFIED | All 10 ROUTER_* env vars read, sensible defaults                    |
| `packages/harness/src/router/reactive.ts`        | isProviderCapError() cross-SDK detection            | ✓ VERIFIED | Anthropic RateLimitError, BadRequestError (billing), OpenAI RateLimitError, GoogleGenerativeAIFetchError (429/403) |
| `packages/harness/src/router/model-router.ts`    | ModelRouter class implementing LLMProvider          | ✓ VERIFIED | `implements LLMProvider`, 3-layer routing, OPUS_CAPABLE_PROVIDERS, OPUS_TIER_STAGES constants |
| `packages/harness/src/router/predictive.ts`      | BurnRateCalculator with prediction accuracy         | ✓ VERIFIED | shouldSwitch(), getCurrentBurnRate(), recordPrediction(), checkPredictionAccuracy() |
| `packages/harness/src/router/proactive.ts`       | ProactivePoller for Anthropic Admin API             | ✓ VERIFIED | Polls /v1/organizations/usage, graceful no-key fallback, best-effort |
| `packages/harness/src/router/queue.ts`           | RequestQueue with enqueue/drain/clear               | ✓ VERIFIED | AllProvidersDegradedError on full queue, sequential drain, clear rejects all |
| `packages/harness/src/db/schema.ts`              | tokenUsage Drizzle table schema                     | ✓ VERIFIED | Columns: id, provider, timestamp, input_tokens, output_tokens, cost_estimate, stage + composite index |
| `packages/harness/src/db/client.ts`              | getHarnessDb() optional SQLite with WAL mode        | ✓ VERIFIED | Returns null for undefined path, WAL pragma, runtime table creation |
| `packages/harness/src/db/usage-buffer.ts`        | UsageBuffer class with periodic flush               | ✓ VERIFIED | 5-min default flush, error retention (unshift on failure), graceful null-db no-op |
| `packages/harness/src/registry.ts`               | resolveModel() returns router-wrapped provider      | ✓ VERIFIED | `getRouter()` lazy singleton, passthrough when single provider + 'none' policy |
| `packages/harness/src/index.ts`                  | Router types exported from @gstackapp/harness       | ✓ VERIFIED | Exports ModelRouter, RouterConfig, FallbackPolicy, ProviderDegradedError, AllProvidersDegradedError, loadRouterConfig |

### Key Link Verification

| From                                    | To                                       | Via                                   | Status     | Details                                                      |
| --------------------------------------- | ---------------------------------------- | ------------------------------------- | ---------- | ------------------------------------------------------------ |
| `packages/harness/src/db/usage-buffer.ts` | `packages/harness/src/db/schema.ts`    | imports tokenUsage table for inserts  | ✓ WIRED    | UsageBuffer uses raw SQL INSERT (not ORM), schema exported for Drizzle kit |
| `packages/harness/src/router/config.ts` | env vars                                 | process.env.ROUTER_*                  | ✓ WIRED    | All ROUTER_* vars read with parseInt/split                   |
| `packages/harness/src/router/model-router.ts` | `packages/harness/src/types.ts`    | implements LLMProvider                | ✓ WIRED    | `implements LLMProvider` at line 45                          |
| `packages/harness/src/router/model-router.ts` | `packages/harness/src/router/reactive.ts` | uses isProviderCapError           | ✓ WIRED    | `isProviderCapError(err)` at catch block line 110            |
| `packages/harness/src/router/model-router.ts` | `packages/harness/src/db/usage-buffer.ts` | records token usage after completion | ✓ WIRED   | `this.usageBuffer.record(providerName, result.usage, stage)` line 93 |
| `packages/harness/src/registry.ts`      | `packages/harness/src/router/model-router.ts` | resolveModel wraps in ModelRouter | ✓ WIRED  | `new ModelRouter(...)` in getRouter(), returned via `router ?? rawProvider` |

### Data-Flow Trace (Level 4)

| Artifact                  | Data Variable    | Source                                    | Produces Real Data | Status      |
| ------------------------- | ---------------- | ----------------------------------------- | ------------------ | ----------- |
| `model-router.ts`         | result.usage     | provider.createCompletion() -> SDK usage  | Yes — from SDK response | ✓ FLOWING |
| `predictive.ts`           | hourlyTokens     | SQLite token_usage table (real DB query)  | Yes — real DB rows     | ✓ FLOWING |
| `usage-buffer.ts`         | buffer records   | record() -> flush() -> SQLite INSERT      | Yes — transaction commit | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                               | Command                                                                  | Result          | Status   |
| -------------------------------------- | ------------------------------------------------------------------------ | --------------- | -------- |
| 110 tests pass (all router tests)      | `cd packages/harness && npx vitest run`                                  | 110/110 passed  | ✓ PASS   |
| Router module exports ModelRouter      | `node -e "const m=require('./packages/harness/dist/index.js'); console.log(typeof m.ModelRouter)"` | N/A (TS source, not built) | ? SKIP — TS source, verified via imports |
| isProviderCapError exists and exported | grep in reactive.ts                                                      | Found at line 16 | ✓ PASS  |
| All 6 commits exist in git log         | `git log --oneline`                                                      | 1751da1, ca4f3b4, 9ad9807, 3447344, 2bbb959, 97e3481 all found | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                    | Status      | Evidence                                                                   |
| ----------- | ----------- | ------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------- |
| RTR-01      | 09-01, 09-02 | Reactive layer catches 429/billing errors and triggers provider failover       | ✓ SATISFIED | `isProviderCapError()` in reactive.ts; `handleCapError()` in model-router.ts with retry chain |
| RTR-02      | 09-01, 09-02 | Predictive layer tracks token burn rate and switches 30min before projected cap | ✓ SATISFIED | `BurnRateCalculator.shouldSwitch()` queries last-hour token_usage, `predictiveThresholdMinutes` default 30 |
| RTR-03      | 09-02        | Proactive layer polls provider usage APIs to validate burn rate predictions    | ✓ SATISFIED | `ProactivePoller` polls Anthropic Admin API, calls `onRecalibrate()` when usage data available |
| RTR-04      | 09-01        | Router chains providers in configurable order (default: Claude -> Gemini -> Qwen) | ✓ SATISFIED | `ROUTER_PROVIDER_CHAIN` env var, default `['anthropic','gemini','openai']` in config.ts |
| RTR-05      | 09-02        | Quality-aware routing config specifies which tasks tolerate degradation vs queue | ✓ SATISFIED | `OPUS_CAPABLE_PROVIDERS=['anthropic']`, `OPUS_TIER_STAGES=['ceo','security']`; CEO/Security queue, others failover |
| RTR-06      | 09-02        | Router never switches providers mid-tool-loop (boundary: between conversations only) | ✓ SATISFIED | Non-cap errors re-thrown unconditionally; router wraps single createCompletion() call |
| RTR-07      | 09-01        | Token tracking uses WAL file + batch commit (flush every 5min, graceful degradation) | ✓ SATISFIED | WAL pragma in client.ts; UsageBuffer flushMs=5*60*1000; error handling retains records in buffer |
| RTR-08      | 09-02        | Every route decision logged with structured observability                      | ✓ SATISFIED | `{ event: 'route_decision', provider, reason, burnRate, predictionAccuracy, fallbackPolicy, queueDepth }` on all paths |
| RTR-09      | 09-01        | Fallback policy configurable: 'none' \| 'quality-aware' \| 'aggressive'       | ✓ SATISFIED | `FallbackPolicy` type, `ROUTER_FALLBACK_POLICY` env var, default 'none'   |

**All 9 requirements satisfied. No orphaned requirements.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | — | — | — | — |

No TODOs, FIXMEs, placeholder comments, or stub returns found in the router or db modules. The `return null` patterns in model-router.ts and predictive.ts are legitimate conditional guards (no provider found, no DB, no data), not stubs.

One design note: `ProactivePoller.poll()` includes a comment "exact shape may vary" and logs `dataKeys` for debugging. This is intentional per D-12 — the proactive layer is supplementary, best-effort, and the Anthropic usage API shape was not fully known at implementation time. The reactive and predictive layers carry the load.

### Human Verification Required

The VALIDATION.md identified one behavior requiring real API access:

**1. Real 429 Triggers Failover**

**Test:** Configure two providers, send rapid requests to Anthropic until a real 429 is returned
**Expected:** Router marks Anthropic as degraded with cooldown, retries request on Gemini/OpenAI, returns successful result without user intervention
**Why human:** Requires a real Anthropic API key hitting an actual rate limit — cannot simulate the real SDK error class in a non-test environment

All other behaviors are fully covered by 110 unit and integration tests.

### Gaps Summary

No gaps found. All 5 observable truths are verified, all 9 requirements are satisfied, all 12 artifacts are substantive and wired, and all 110 tests pass.

---

_Verified: 2026-04-03T21:50:00Z_
_Verifier: Claude (gsd-verifier)_
