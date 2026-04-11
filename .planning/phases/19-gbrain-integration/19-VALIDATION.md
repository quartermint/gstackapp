---
phase: 19
slug: gbrain-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/api/vitest.config.ts |
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
| 19-01-01 | 01 | 1 | GB-01 | — | N/A | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | GB-02 | — | N/A | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 19-01-03 | 01 | 1 | GB-04 | — | N/A | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 2 | GB-03 | — | N/A | integration | `npm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for GB-01 through GB-04 covering gbrain client, prefetch, and clarification
- [ ] Existing vitest infrastructure covers framework needs

*Existing infrastructure covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| gbrain MCP server connectivity via SSH | GB-01 | Requires Mac Mini and live gbrain server | SSH to Mac Mini, verify gbrain MCP tools respond |
| Context-loaded clarification question visible | GB-03 | Requires live Claude API + gbrain data | Submit operator request naming a known project, verify clarification includes gbrain context |
| "Running without knowledge context" indicator | GB-04 | Requires stopping gbrain server | Stop gbrain MCP, submit request, verify indicator appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
