---
phase: 10
slug: mcp-server-deprecation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.x |
| **Config file** | `packages/mcp/vitest.config.ts` (new) |
| **Quick run command** | `pnpm --filter @mission-control/mcp test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/mcp test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | MCP-01..05 | unit | `pnpm --filter @mission-control/mcp test` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | MCP-06 | smoke | `bash ~/.claude/hooks/risks-digest.sh` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 2 | MIGR-01..03 | manual | Visual + `gh repo view` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/mcp/vitest.config.ts` — vitest config for new package
- [ ] `packages/mcp/src/__tests__/` — test stubs for MCP tools

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP tools work in Claude Code session | MCP-01..05 | Requires live Claude Code + stdio | Start Claude Code, call each tool, verify output |
| Portfolio-dashboard tool equivalence | MIGR-01 | Requires comparing outputs | Run old and new tools, compare results |
| MCP config updated | MIGR-02 | Requires Claude Code config | `claude mcp list` shows mission-control |
| Portfolio-dashboard archived | MIGR-03 | GitHub action | `gh repo view quartermint/portfolio-dashboard --json isArchived` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
