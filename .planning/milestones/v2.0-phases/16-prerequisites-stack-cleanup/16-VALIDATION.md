---
phase: 16
slug: prerequisites-stack-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/api/vitest.config.ts` |
| **Quick run command** | `npm run test --workspace=@gstackapp/api -- --run` |
| **Full suite command** | `npm run test --workspace=@gstackapp/api -- --run && npm run test --workspace=@gstackapp/harness -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test --workspace=@gstackapp/api -- --run`
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | PRE-01 | — | N/A | unit | `npm run test --workspace=@gstackapp/api -- --run` | ✅ | ⬜ pending |
| 16-01-02 | 01 | 1 | PRE-01 | — | N/A | integration | `npm run test --workspace=@gstackapp/api -- --run` | ✅ | ⬜ pending |
| 16-02-01 | 02 | 2 | PRE-02 | — | N/A | manual | Browser UAT testing | N/A | ⬜ pending |
| 16-03-01 | 03 | 1 | PRE-03 | — | N/A | manual | `grep -ri "sqlite\|better-sqlite3" CLAUDE.md .planning/PROJECT.md` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Vitest is already configured and 407 tests exist.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UAT items 1-6 pass in browser | PRE-02 | Requires browser interaction and visual verification | Exercise each item in 15-HUMAN-UAT.md via browser |
| SSE events render in frontend | PRE-01 (IDEA-07) | Requires running browser to observe SSE stream | Trigger ideation pipeline, verify stage updates appear in UI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
