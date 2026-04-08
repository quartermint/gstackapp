---
phase: 13
slug: multi-provider-routing-expansion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | ROUT-01 | — | GPT-Codex provider returns results through unified interface | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROUT-02 | — | Local model tasks execute on Mac Mini with capability boundaries | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROUT-03 | — | Routing rationale visible in response metadata | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROUT-04 | — | Tasks routed by type not just failover | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Provider test stubs for GPT-Codex, local MLX models
- [ ] Router test stubs for task-type classification
- [ ] Test fixtures for routing decision metadata

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mac Mini model hot-swap latency | ROUT-02 | Requires physical Mac Mini with loaded models | SSH to Mac Mini, time model load/unload cycle |
| Codex sandbox execution | ROUT-01 | Requires Codex CLI binary | Run Codex task, verify sandbox output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
