---
phase: 18
slug: operator-mode
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/api/vitest.config.ts, packages/web/vitest.config.ts |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | OP-01 | — | N/A | integration | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | OP-02 | — | N/A | integration | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 18-01-03 | 01 | 1 | OP-03 | — | N/A | integration | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 1 | OP-04, OP-05 | — | N/A | integration | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 1 | OP-06, OP-07 | — | N/A | integration | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 18-03-01 | 03 | 2 | OP-08, OP-09 | — | N/A | integration | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 18-03-02 | 03 | 2 | OP-10, OP-11 | — | N/A | integration | `npm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for OP-01 through OP-11 covering operator flow
- [ ] Existing vitest infrastructure covers framework needs

*Existing infrastructure covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Intake form submission + clarification thread UX | OP-01, OP-02 | Visual interaction flow | Fill form, verify clarification questions appear, approve brief |
| Real-time progress visualization updates | OP-04 | SSE streaming visual verification | Start pipeline, watch progress bar animate through 5 steps |
| Error card display with actionable options | OP-06, OP-07 | Visual error state rendering | Trigger timeout/failure, verify error card copy and buttons |
| Audit trail completeness | OP-10, OP-11 | Cross-cutting data verification | Complete full flow, verify all events in audit trail |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
