---
phase: 28
slug: dashboard-highlight-mode
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
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
| 28-01-01 | 01 | 1 | DASH-01 | unit+integration | `pnpm test` | ❌ W0 | ⬜ pending |
| 28-01-02 | 01 | 1 | DASH-02, DASH-03 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 28-02-01 | 02 | 2 | DASH-02, DASH-04 | unit | `pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/routes/visits.test.ts` — stubs for DASH-01
- [ ] `packages/web/src/__tests__/hooks/use-highlight.test.ts` — stubs for DASH-02, DASH-03

*Existing test infrastructure covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Highlight visual distinct from health dots | DASH-04 | Visual appearance | Open dashboard, verify highlight doesn't conflict with existing badges |
| Summary count visible without scrolling | DASH-03 | Layout/viewport | Open dashboard on standard viewport, verify count is above fold |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
