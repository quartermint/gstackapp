---
phase: 9
slug: dashboard-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.0 + @testing-library/react 16.3.2 |
| **Config file** | `packages/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @mission-control/web test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/web test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-W0-01 | W0 | 0 | RISK-01..03 | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/risk-feed.test.tsx` | ❌ W0 | ⬜ pending |
| 09-W0-02 | W0 | 0 | TMLN-01..03 | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/sprint-timeline.test.tsx` | ❌ W0 | ⬜ pending |
| 09-W0-03 | W0 | 0 | HDOT-01..03 | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/health-dot.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/web/src/__tests__/components/risk-feed.test.tsx` — risk feed rendering, severity grouping, non-dismissable cards
- [ ] `packages/web/src/__tests__/components/sprint-timeline.test.tsx` — timeline bars, focused highlight, hover/click
- [ ] `packages/web/src/__tests__/components/health-dot.test.tsx` — dot colors, split dot, expand panel

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Warm palette colors render correctly | All | Visual verification needed | Open dashboard, compare severity colors against mockup |
| Copy-to-clipboard action hints | RISK-02 | Clipboard API needs browser context | Click action hint, paste in terminal |
| Sprint timeline hover tooltip | TMLN-03 | Mouse interaction + positioning | Hover bars, verify tooltip shows commit count + dates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
