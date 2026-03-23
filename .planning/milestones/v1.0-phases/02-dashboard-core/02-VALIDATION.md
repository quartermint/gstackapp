---
phase: 2
slug: dashboard-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1+ |
| **Config file** | `vitest.config.ts` (root, references `packages/api/vitest.config.ts`) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | DASH-01 | unit | `pnpm vitest run packages/web/src/__tests__/lib/grouping.test.ts` | No -- Wave 0 | pending |
| 02-01-02 | 01 | 0 | DASH-02 | unit | `pnpm vitest run packages/web/src/__tests__/components/project-row.test.tsx` | No -- Wave 0 | pending |
| 02-01-03 | 01 | 0 | DASH-03 | unit | `pnpm vitest run packages/web/src/__tests__/components/hero-card.test.tsx` | No -- Wave 0 | pending |
| 02-01-04 | 01 | 0 | DASH-04 | unit | `pnpm vitest run packages/web/src/__tests__/components/departure-board.test.tsx` | No -- Wave 0 | pending |
| 02-01-05 | 01 | 0 | DASH-11 | unit | `pnpm vitest run packages/web/src/__tests__/hooks/use-theme.test.ts` | No -- Wave 0 | pending |
| 02-01-06 | 01 | 0 | N/A | unit | `pnpm vitest run packages/web/src/__tests__/lib/time.test.ts` | No -- Wave 0 | pending |
| 02-xx-xx | xx | x | DASH-10 | manual | Visual inspection at <640px viewport | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/web/vitest.config.ts` -- web package Vitest config with jsdom environment for React component tests
- [ ] Add `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` to web package devDependencies
- [ ] Register web package config in root `vitest.config.ts` projects array
- [ ] `packages/web/src/__tests__/lib/grouping.test.ts` -- stubs for DASH-01
- [ ] `packages/web/src/__tests__/lib/time.test.ts` -- stubs for relative time formatting
- [ ] `packages/web/src/__tests__/hooks/use-theme.test.ts` -- stubs for DASH-11 (theme toggle)
- [ ] `packages/web/src/__tests__/components/project-row.test.tsx` -- stubs for DASH-02
- [ ] `packages/web/src/__tests__/components/hero-card.test.tsx` -- stubs for DASH-03
- [ ] `packages/web/src/__tests__/components/departure-board.test.tsx` -- stubs for DASH-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Responsive layout hides metadata on mobile | DASH-10 | CSS breakpoints, not unit testable without e2e | Inspect dashboard at <640px viewport width, verify project rows collapse gracefully |
| Visual identity warm palette | DASH-11 (partial) | Subjective color assessment | Compare rendered palette against design spec, verify warm tone in both light and dark modes |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
