---
phase: 7
slug: seam-cleanup
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-03
updated: 2026-04-03
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | SEAM-01 | unit | `npx vitest run src/__tests__/stage-runner.test.ts` | Yes | pending |
| 07-01-02 | 01 | 1 | SEAM-02 | unit (TDD) | `npx vitest run src/__tests__/config.test.ts` | **Wave 0 (created in task)** | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

| Test File | Created By | Tests |
|-----------|------------|-------|
| `packages/api/src/__tests__/config.test.ts` | Plan 01, Task 2 (TDD RED phase) | findProjectRoot() returns correct package root; fallback to process.cwd() when no match |

Task 2 is marked `tdd="true"` and creates the test file as its first action (RED phase) before implementing findProjectRoot(). This satisfies Wave 0 inline — no separate Wave 0 plan needed.

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
