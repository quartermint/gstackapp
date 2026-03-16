---
phase: 12
slug: session-ingestion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @mission-control/api test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | SESS-01, API-01 | unit+integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | SESS-03, API-02 | unit+integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 1 | SESS-04, API-03 | unit+integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 1 | SESS-05 | unit | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 1 | SESS-06 | unit | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 2 | API-04 | integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/routes/sessions.test.ts` — Session API route tests (create, heartbeat, stop, list)
- [ ] `packages/api/src/__tests__/services/session-reaper.test.ts` — Reaper timer + abandonment logic tests
- [ ] `packages/api/src/__tests__/services/aider-detector.test.ts` — Aider commit detection + dedup tests
- [ ] `packages/api/src/__tests__/services/project-resolver.test.ts` — CWD → project resolution tests

*Existing vitest infrastructure covers framework needs — no new installs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Code hook fires on session start | SESS-01 | Requires live Claude Code session | Start a Claude Code session, check MC API received POST |
| Hook response < 100ms | API-01 | Requires real network timing | Time curl to session endpoints |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
