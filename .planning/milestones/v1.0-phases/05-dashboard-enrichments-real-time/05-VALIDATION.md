---
phase: 5
slug: dashboard-enrichments-real-time
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.x |
| **Config file (API)** | `packages/api/vitest.config.ts` |
| **Config file (Web)** | `packages/web/vitest.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-XX | 01 | 1 | DASH-05 | unit | `pnpm --filter @mission-control/api test -- --grep "heatmap"` | No -- Wave 0 | pending |
| 05-01-XX | 01 | 1 | DASH-05 | integration | `pnpm --filter @mission-control/api test -- --grep "heatmap"` | No -- Wave 0 | pending |
| 05-02-XX | 02 | 1 | DASH-06 | integration | `pnpm --filter @mission-control/api test -- --grep "project"` | Partial | pending |
| 05-02-XX | 02 | 1 | DASH-07 | unit | `pnpm --filter @mission-control/web test -- --grep "stale"` | No -- Wave 0 | pending |
| 05-03-XX | 03 | 2 | DASH-08 | integration | `pnpm --filter @mission-control/api test -- --grep "health"` | Partial | pending |
| 05-04-XX | 04 | 2 | DASH-09 | unit | `pnpm --filter @mission-control/api test -- --grep "event-bus"` | No -- Wave 0 | pending |
| 05-04-XX | 04 | 2 | DASH-09 | integration | `pnpm --filter @mission-control/api test -- --grep "events"` | No -- Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/db/queries/heatmap.test.ts` -- stubs for DASH-05 heatmap aggregation
- [ ] `packages/api/src/__tests__/routes/events.test.ts` -- stubs for DASH-09 SSE endpoint
- [ ] `packages/api/src/__tests__/services/event-bus.test.ts` -- stubs for DASH-09 event bus
- [ ] `packages/api/src/__tests__/services/health-monitor.test.ts` -- stubs for DASH-08 health metrics
- [ ] `packages/web/src/__tests__/lib/stale-nudge.test.ts` -- stubs for DASH-07 criteria logic

*Existing infrastructure covers DASH-06 partially (project route tests exist).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Heatmap visual intensity rendering | DASH-05 | CSS color intensity is visual | Open dashboard, verify cell shading correlates with commit count |
| Stale nudge visual treatment | DASH-07 | Amber tint is a visual design choice | Open dashboard with a project idle 2+ weeks with dirty files, verify subtle highlight |
| SSE reconnection after disconnect | DASH-09 | Requires simulating network interruption | Stop API server, verify dashboard auto-reconnects when restarted |
| Health dot color accuracy | DASH-08 | Requires real service state variation | Stop a monitored service, verify amber indicator appears |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
