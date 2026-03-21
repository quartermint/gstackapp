---
phase: 25
slug: dependency-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 25 — Validation Strategy

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
| 25-01-01 | 01 | 1 | INTEL-03, INTEL-04, INTEL-06 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 25-01-02 | 01 | 1 | INTEL-03, INTEL-04, INTEL-05, INTEL-06 | integration | `pnpm test` | ❌ W0 | ⬜ pending |
| 25-02-01 | 02 | 2 | INTEL-02 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 25-02-02 | 02 | 2 | INTEL-02 | integration | `pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for dependency drift detection + severity escalation (INTEL-03, INTEL-04, INTEL-06)
- [ ] Test stubs for cross-machine reconciliation + commit impact (INTEL-05)
- [ ] Test stubs for dependency badge UI (INTEL-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dependency badges visible on project cards | INTEL-02 | Visual UI component | Open dashboard, verify badges appear on projects with dependsOn |
| Severity escalation over time | INTEL-04 | Time-dependent behavior | Create dependency_impact finding, verify severity changes after 24h/7d |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
