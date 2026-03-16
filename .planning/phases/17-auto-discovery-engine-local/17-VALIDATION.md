---
phase: 17
slug: auto-discovery-engine-local
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `pnpm --filter @mission-control/api test -- --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test -- --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | DISC-01 | unit | `pnpm --filter @mission-control/api test -- --run discovery-scanner` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | DISC-01 | unit | `pnpm --filter @mission-control/api test -- --run discovery-scanner` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | DISC-01, DISC-09 | unit | `pnpm --filter @mission-control/api test -- --run discoveries` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 1 | DISC-03, DISC-04 | unit | `pnpm --filter @mission-control/api test -- --run discoveries` | ❌ W0 | ⬜ pending |
| 17-02-03 | 02 | 1 | DISC-10 | unit | `pnpm --filter @mission-control/api test -- --run discoveries` | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 2 | DISC-09 | integration | `pnpm --filter @mission-control/api test -- --run` | ❌ W0 | ⬜ pending |
| 17-03-02 | 03 | 2 | DISC-10 | integration | `pnpm --filter @mission-control/api test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/services/discovery-scanner.test.ts` — unit tests for filesystem walk, filtering, git metadata
- [ ] `packages/api/src/__tests__/routes/discoveries.test.ts` — route handler tests for list, promote, dismiss, manual scan

*Existing vitest infrastructure and in-memory SQLite test helpers cover framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE events visible in browser | DISC-10 | Requires browser SSE connection | Open dashboard, trigger scan, observe network tab for discovery events |
| Timer runs independently | DISC-09 | Requires running server | Start server, verify discovery scan logs appear at configured interval separate from project scan logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
