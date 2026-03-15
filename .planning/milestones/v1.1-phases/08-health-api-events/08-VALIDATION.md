---
phase: 8
slug: health-api-events
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `packages/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @mission-control/api test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-W0-01 | W0 | 0 | RISK-04 | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/risks.test.ts` | ❌ W0 | ⬜ pending |
| 08-W0-02 | W0 | 0 | RISK-05 | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/health-checks.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-01 | 01 | 1 | RISK-04,05 | integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/routes/health-checks.test.ts` — health check listing, severity filter, isNew flag
- [ ] `packages/api/src/__tests__/routes/risks.test.ts` — risk aggregation, riskCount
- [ ] `packages/api/src/__tests__/routes/copies.test.ts` — copy listing, per-project copies
- [ ] `packages/api/src/__tests__/routes/sprint-timeline.test.ts` — segment computation, focusedProject

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE events fire on health state change | implicit | Requires live scan cycle | Start API, trigger scan, watch SSE stream for `health:changed` event |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
