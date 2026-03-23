---
phase: 4
slug: search-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.0 |
| **Config file** | `packages/api/vitest.config.ts`, `packages/web/vitest.config.ts` |
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
| 04-01-01 | 01 | 0 | SRCH-01 | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/ai-query-rewriter.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 0 | SRCH-02 | unit | `pnpm --filter @mission-control/api test -- src/__tests__/db/queries/commits.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 0 | SRCH-01, SRCH-02, SRCH-03 | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts` | Partial | ⬜ pending |
| 04-02-01 | 02 | 1 | SRCH-01 | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | SRCH-02 | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 1 | SRCH-03 | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/ai-query-rewriter.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 1 | SRCH-03 | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts` | ❌ W0 | ⬜ pending |
| 04-04-01 | 04 | 2 | SRCH-01, SRCH-02 | component | `pnpm --filter @mission-control/web test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/services/ai-query-rewriter.test.ts` — stubs for SRCH-01, SRCH-03 (smart detection heuristic, rewriter, fallback)
- [ ] `packages/api/src/__tests__/db/queries/commits.test.ts` — stubs for SRCH-02 (commit persistence + deduplication)
- [ ] Extend `packages/api/src/__tests__/routes/search.test.ts` — stubs for SRCH-01, SRCH-02, SRCH-03 (unified results, source types, filters)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AI filter chips are visually dismissible and non-intrusive | SRCH-02 | Visual layout/UX judgment | Open palette, type "? what was I working on for flights", verify chips appear below input, click X to dismiss |
| Result navigation swaps hero card correctly | SRCH-01 | Requires full dashboard context | Search for a capture, click result, verify hero card updates to correct project |
| Cmd+/ optional shortcut preference | SRCH-01 | User preference toggle behavior | Enable Cmd+/ in settings, verify it opens palette with ? pre-filled |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
