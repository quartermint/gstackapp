---
phase: 31
slug: relationship-graph
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | packages/web/vitest.config.ts |
| **Quick run command** | `pnpm --filter @mission-control/web test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/web test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | INTEL-07 | unit | `pnpm --filter @mission-control/web test -- graph-data` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | INTEL-07, INTEL-08 | unit | `pnpm --filter @mission-control/web test -- relationship-graph` | ❌ W0 | ⬜ pending |
| 31-02-01 | 02 | 2 | INTEL-08 | unit | `pnpm --filter @mission-control/web test -- relationship-graph` | ❌ W0 | ⬜ pending |
| 31-02-02 | 02 | 2 | INTEL-08 | build | `pnpm build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] d3-force package installed via `pnpm --filter @mission-control/web add d3-force`
- [ ] @types/d3-force installed via `pnpm --filter @mission-control/web add -D @types/d3-force`
- [ ] Test files created alongside implementation

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Force-directed graph renders visually | INTEL-07 | SVG layout is visual | Open dashboard → click Graph view → verify nodes and edges render |
| Node colors match host/health | INTEL-08 | Visual color verification | Verify node colors: green=healthy, orange=warning, red=critical |
| Graph is interactive (drag, zoom) | INTEL-08 | Requires pointer interaction | Drag a node → verify it moves, scroll to zoom |
| d3-force not in main bundle | INTEL-08 | Requires build analysis | Run `pnpm build` → check chunk output for d3-force separation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
