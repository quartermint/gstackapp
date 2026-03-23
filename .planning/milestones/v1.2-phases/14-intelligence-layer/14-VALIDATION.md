---
phase: 14
slug: intelligence-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/api/vitest.config.ts`, `packages/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @mission-control/api test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | INTL-01 | unit | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | INTL-02 | unit+integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 2 | INTL-03 | integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 2 | INTL-01, INTL-02, INTL-03 | unit+integration | `pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/services/conflict-detector.test.ts` — File overlap detection + path normalization tests
- [ ] `packages/api/src/__tests__/routes/sessions.test.ts` — Extended with session grouping + conflict event tests

*Existing vitest infrastructure covers framework needs — no new installs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-time SSE conflict alert | INTL-02 | Requires two live Claude Code sessions | Open two sessions on same project, edit same file, check dashboard risk feed |
| Risk feed card rendering | INTL-02 | Visual verification | Check conflict card appears with session badge in risk feed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
