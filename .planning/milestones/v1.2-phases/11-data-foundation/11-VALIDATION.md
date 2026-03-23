---
phase: 11
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/api/vitest.config.ts`, `packages/shared/vitest.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | SESS-02 | unit | `pnpm --filter @mission-control/shared test` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | BUDG-01 | unit | `pnpm --filter @mission-control/shared test` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 1 | SESS-02 | unit+integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 1 | BUDG-01 | unit | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 2 | INFR-01 | integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/shared/src/__tests__/schemas/session.test.ts` — Zod schema validation tests for session types
- [ ] `packages/shared/src/__tests__/schemas/budget.test.ts` — model tier derivation + budget type tests
- [ ] `packages/api/src/__tests__/db/sessions.test.ts` — session table CRUD + query tests
- [ ] `packages/api/src/__tests__/db/budget.test.ts` — budget derivation query tests

*Existing vitest infrastructure covers framework needs — no new installs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Config backward compat | INFR-01 | Requires existing mc.config.json without new keys | Load production mc.config.json, verify no errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
