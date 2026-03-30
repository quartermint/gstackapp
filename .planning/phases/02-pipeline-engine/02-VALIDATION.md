---
phase: 2
slug: pipeline-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `npm run test -w packages/api` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -w packages/api`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | PIPE-03 | unit | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | PIPE-04 | unit | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | PIPE-01, PIPE-02 | integration | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | PIPE-05, PIPE-06 | unit | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 3 | PIPE-07, PIPE-08, PIPE-09 | integration | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for sandbox, pipeline orchestrator, stage runner
- [ ] Mock Claude API client for testing (avoid real API calls)
- [ ] Test fixtures for PR diffs and stage results

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 5-stage parallel execution under 5 min | PIPE-01 | Requires real Claude API calls | Trigger pipeline on real PR, time execution |
| Claude tool_use conversation quality | PIPE-05 | AI output quality is subjective | Review stage findings for coherence and accuracy |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
