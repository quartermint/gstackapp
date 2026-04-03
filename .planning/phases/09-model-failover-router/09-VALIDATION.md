---
phase: 9
slug: model-failover-router
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 09-01-01 | 01 | 1 | RTR-01,RTR-02 | unit | `npm test --workspace=packages/harness` | Wave 0 | pending |
| 09-01-02 | 01 | 1 | RTR-03,RTR-04 | unit | `npm test --workspace=packages/harness` | Wave 0 | pending |
| 09-02-01 | 02 | 2 | RTR-05,RTR-06,RTR-07 | unit | `npm test --workspace=packages/harness` | Wave 0 | pending |
| 09-02-02 | 02 | 2 | RTR-08,RTR-09 | integration | `npm run test --workspace=packages/api --workspace=packages/harness` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

| Test File | Created By | Tests |
|-----------|------------|-------|
| `packages/harness/src/__tests__/router.test.ts` | TDD in tasks | Reactive failover, error detection, provider chain |
| `packages/harness/src/__tests__/burn-rate.test.ts` | TDD in tasks | Token tracking, prediction, cap detection |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real 429 from Anthropic triggers failover | RTR-01 | Requires real API call hitting rate limit | Send rapid requests until 429, verify failover |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
