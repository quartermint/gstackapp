---
phase: 15
slug: dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @mission-control/web test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | DASH-01 | typecheck | `pnpm typecheck` | N/A | ⬜ pending |
| 15-01-02 | 01 | 1 | DASH-02 | typecheck | `pnpm typecheck` | N/A | ⬜ pending |
| 15-02-01 | 02 | 2 | DASH-04 | typecheck | `pnpm typecheck` | N/A | ⬜ pending |
| 15-02-02 | 02 | 2 | DASH-05 | typecheck | `pnpm typecheck` | N/A | ⬜ pending |
| 15-02-03 | 02 | 2 | DASH-03 | typecheck+build | `pnpm typecheck && pnpm build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Frontend-only phase — typecheck and build are the primary automated verification. No new test files required for Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Active sessions panel with live feed | DASH-01 | Visual + real-time behavior | Start Claude Code session, verify panel shows it with project, tool icon, tier, elapsed time |
| Budget widget with burn rate colors | DASH-02 | Visual color verification | Check widget shows tier counts, verify color changes at thresholds |
| Conflict alert in risk feed | DASH-03 | SSE real-time + visual | Trigger conflict, verify card appears without refresh |
| Session badges on project cards | DASH-04 | Visual + badge count | Start sessions on a project, verify departure board shows count |
| SSE-driven live updates | DASH-05 | Real-time behavior | Start/stop sessions, verify dashboard updates without refresh |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
