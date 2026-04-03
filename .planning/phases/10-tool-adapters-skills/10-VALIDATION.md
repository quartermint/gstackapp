---
phase: 10
slug: tool-adapters-skills
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 10 — Validation Strategy

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
| 10-01-01 | 01 | 1 | ADPT-01,ADPT-02 | unit | `npm test --workspace=packages/harness` | Wave 0 | pending |
| 10-01-02 | 01 | 1 | ADPT-03,ADPT-04 | unit | `npm test --workspace=packages/harness` | Wave 0 | pending |
| 10-02-01 | 02 | 2 | ADPT-05 | integration | `npm run test --workspace=packages/api --workspace=packages/harness` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

| Test File | Created By | Tests |
|-----------|------------|-------|
| `packages/harness/src/__tests__/tool-adapter.test.ts` | TDD in tasks | Adapter interface, name mapping, schema translation |
| `packages/harness/src/__tests__/skill-manifest.test.ts` | TDD in tasks | Schema validation, loading, registry |
| `packages/harness/src/__tests__/skill-runner.test.ts` | TDD in tasks | Execution, tool call translation |

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
