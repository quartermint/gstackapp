---
phase: 24
slug: knowledge-aggregation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (per package) |
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
| 24-01-01 | 01 | 1 | KNOW-01 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | KNOW-02 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 24-02-01 | 02 | 2 | KNOW-03 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 24-02-02 | 02 | 2 | KNOW-11 | unit | `pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for knowledge table queries (KNOW-01)
- [ ] Test stubs for content-hash caching (KNOW-02)
- [ ] Test stubs for knowledge scanner timer (KNOW-03)
- [ ] Test stubs for stale knowledge detection (KNOW-11)

*Existing test infrastructure covers framework needs — no new installs required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSH graceful degradation | KNOW-03 | Requires real Mac Mini SSH | Disconnect Mac Mini, verify dashboard shows no errors, cached content served |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
