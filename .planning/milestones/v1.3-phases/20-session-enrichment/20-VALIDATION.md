---
phase: 20
slug: session-enrichment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (per-package) |
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
| 20-01-01 | 01 | 1 | SESS-03, SESS-04 | unit | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | SESS-03, SESS-04 | unit | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 20-02-01 | 02 | 1 | SESS-01 | unit | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 20-02-02 | 02 | 1 | SESS-02 | unit | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |
| 20-02-03 | 02 | 1 | SESS-01, SESS-02 | unit | `pnpm --filter @mission-control/mcp test` | ❌ W0 | ⬜ pending |
| 20-03-01 | 03 | 2 | SESS-05 | component | `pnpm --filter @mission-control/web test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/services/convergence-detector.test.ts` — unit tests for convergence detection algorithm (SESS-03, SESS-04)
- [ ] `packages/api/src/__tests__/routes/sessions-conflicts.test.ts` — integration tests for conflict/convergence API endpoints (SESS-01, SESS-02)
- [ ] `packages/mcp/src/__tests__/tools/session-status.test.ts` — MCP tool tests (SESS-01, SESS-02)
- [ ] `packages/web/src/__tests__/components/convergence-badge.test.tsx` — component tests for convergence badge (SESS-05)

*Existing vitest infrastructure covers framework needs. No new framework installs required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Convergence badge appears on project card when convergence detected | SESS-05 | Visual appearance on live dashboard | 1. Start two Claude Code sessions on same project. 2. Edit overlapping files. 3. Complete one session. 4. Check dashboard for amber convergence badge. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
