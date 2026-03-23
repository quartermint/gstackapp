---
phase: 34
slug: knowledge-compounding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.x |
| **Config file** | `packages/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @mission-control/api test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 1 | COMP-01 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/db/queries/solutions.test.ts -x` | ❌ W0 | ⬜ pending |
| 34-01-02 | 01 | 1 | COMP-02 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/solution-extractor.test.ts -x` | ❌ W0 | ⬜ pending |
| 34-01-03 | 01 | 1 | COMP-02 | integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/routes/sessions.test.ts -x` | ✅ (extend) | ⬜ pending |
| 34-02-01 | 02 | 1 | COMP-05 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/db/queries/solutions.test.ts -x` | ❌ W0 | ⬜ pending |
| 34-02-02 | 02 | 2 | COMP-03 | integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/routes/knowledge.test.ts -x` | ✅ (extend) | ⬜ pending |
| 34-02-03 | 02 | 2 | COMP-04 | integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/routes/search.test.ts -x` | ✅ (extend) | ⬜ pending |
| 34-02-04 | 02 | 2 | COMP-06 | integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/hybrid-search.test.ts -x` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/db/queries/solutions.test.ts` — covers COMP-01, COMP-05
- [ ] `packages/api/src/__tests__/services/solution-extractor.test.ts` — covers COMP-02
- [ ] `packages/shared/src/schemas/solution.ts` — Zod schemas for API validation

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Session stop hook triggers solution extraction | COMP-02 | Requires active Claude Code session lifecycle | End a Claude Code session with commits, verify solution doc created |
| MCP startup banner includes past learnings | COMP-03 | Requires Claude Code MCP tool execution | Start new session in a project with solutions, verify banner text |
| Compound score visible on dashboard | COMP-05 | Visual verification | Open MC dashboard, verify compound score widget displays |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
