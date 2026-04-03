---
phase: 8
slug: harness-package-extraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/api/vitest.config.ts + packages/harness/vitest.config.ts (new) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npm run test --workspaces` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose` in affected package
- **After every plan wave:** Run `npm run test --workspaces`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | PKG-01 | unit | `ls packages/harness/package.json` | Wave 0 | pending |
| 08-01-02 | 01 | 1 | PKG-02 | unit | `npx vitest run` | Yes (moved) | pending |
| 08-01-03 | 01 | 1 | PKG-03 | integration | `npx @gstackapp/harness --help` | Wave 0 | pending |
| 08-01-04 | 01 | 1 | PKG-04 | integration | `npm run test --workspaces` | Yes | pending |
| 08-01-05 | 01 | 1 | PKG-05 | pack | `cd packages/harness && npm pack --dry-run` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

| Test File | Created By | Tests |
|-----------|------------|-------|
| `packages/harness/vitest.config.ts` | Plan setup task | Test configuration for harness package |
| `packages/harness/package.json` | Plan setup task | Package manifest with exports map |

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
