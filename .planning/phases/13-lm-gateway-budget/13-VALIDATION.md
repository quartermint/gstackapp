---
phase: 13
slug: lm-gateway-budget
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/api/vitest.config.ts`, `packages/shared/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @mission-control/api test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | GATE-01, GATE-02, GATE-03 | unit | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | BUDG-02, BUDG-03 | unit | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 1 | API-05 | integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 1 | API-06 | integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 13-03-01 | 03 | 2 | BUDG-04 | unit+integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/services/lm-studio.test.ts` — LM Studio health probe + three-state derivation
- [ ] `packages/api/src/__tests__/services/budget.test.ts` — Budget calculation + burn rate + tier routing
- [ ] `packages/api/src/__tests__/routes/models.test.ts` — GET /api/models route tests
- [ ] `packages/api/src/__tests__/routes/budget.test.ts` — GET /api/budget route tests

*Existing vitest infrastructure covers framework needs — no new installs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LM Studio live polling | GATE-01 | Requires real LM Studio running | Start LM Studio, verify MC detects model state |
| Hook response budget context | BUDG-04 | Requires live Claude Code session | Start session when burn rate > moderate, check hook response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
