---
phase: 11
slug: state-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 11 — Validation Strategy

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
| 11-01-01 | 01 | 1 | SYNC-01,SYNC-04 | unit | `npm test --workspace=packages/harness` | Wave 0 | pending |
| 11-01-02 | 01 | 1 | SYNC-02,SYNC-03 | unit | `npm test --workspace=packages/harness` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

| Test File | Created By | Tests |
|-----------|------------|-------|
| `packages/harness/src/__tests__/sync.test.ts` | TDD in tasks | Rsync command building, exclude rules, lock files, bidirectional sync |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real rsync over Tailscale to Mac Mini | SYNC-01 | Requires real network + remote device | Run `harness sync push` from laptop, verify files appear on Mac Mini |
| Bidirectional sync preserves newer files | SYNC-02 | Requires real rsync with timestamps | Modify file on each device, run bidirectional sync, verify latest wins |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
