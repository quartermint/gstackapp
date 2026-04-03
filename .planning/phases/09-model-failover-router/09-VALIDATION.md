---
phase: 9
slug: model-failover-router
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-03
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/harness/vitest.config.ts |
| **Quick run command** | `npm test --workspace=packages/harness` |
| **Full suite command** | `npm run test --workspace=packages/api --workspace=packages/harness` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test --workspace=packages/harness`
- **After every plan wave:** Run full suite across api + harness
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | RTR-01,RTR-02,RTR-04,RTR-09 | unit | `cd packages/harness && npx vitest run src/__tests__/router-infra.test.ts -x` | Wave 0 | pending |
| 09-01-02 | 01 | 1 | RTR-02,RTR-07 | unit | `cd packages/harness && npx vitest run src/__tests__/usage-buffer.test.ts -x` | Wave 0 | pending |
| 09-02-01 | 02 | 2 | RTR-01,RTR-02,RTR-05,RTR-06,RTR-08 | unit | `cd packages/harness && npx vitest run src/__tests__/model-router.test.ts -x` | Wave 0 | pending |
| 09-02-02 | 02 | 2 | RTR-03,RTR-08 | integration | `cd packages/harness && npx vitest run src/__tests__/router-integration.test.ts src/__tests__/index.test.ts -x` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

| Test File | Created By | Tests |
|-----------|------------|-------|
| `packages/harness/src/__tests__/router-infra.test.ts` | Plan 01 Task 1 (TDD) | Error types, config loading, cross-SDK error detection |
| `packages/harness/src/__tests__/usage-buffer.test.ts` | Plan 01 Task 2 (TDD) | DB client, token usage schema, usage buffer flush |
| `packages/harness/src/__tests__/model-router.test.ts` | Plan 02 Task 1 (TDD) | Reactive failover, predictive switching, quality-aware routing, boundaries, observability |
| `packages/harness/src/__tests__/router-integration.test.ts` | Plan 02 Task 2 (TDD) | Registry wiring, proactive poller, end-to-end failover |

All test files are created as part of TDD tasks (tests written before implementation). Wave 0 is satisfied by the TDD workflow in each task.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real 429 from Anthropic triggers failover | RTR-01 | Requires real API call hitting rate limit | Send rapid requests until 429, verify failover |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
