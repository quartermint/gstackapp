---
phase: 32
slug: hybrid-search-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.x |
| **Config file** | `packages/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @mission-control/api test -- --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test -- --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | SRCH-01 | unit | `pnpm --filter @mission-control/api test -- src/__tests__/db/queries/vector-search.test.ts -x` | ❌ W0 | ⬜ pending |
| 32-01-02 | 01 | 1 | SRCH-02 | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/embedding-service.test.ts -x` | ❌ W0 | ⬜ pending |
| 32-01-03 | 01 | 1 | SRCH-03 | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/rrf-fusion.test.ts -x` | ❌ W0 | ⬜ pending |
| 32-02-01 | 02 | 1 | SRCH-04 | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/ai-query-rewriter.test.ts -x` | ✅ (needs extension) | ⬜ pending |
| 32-02-02 | 02 | 1 | SRCH-04 | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts -x` | ✅ (needs extension) | ⬜ pending |
| 32-03-01 | 03 | 2 | SRCH-05 | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts -x` | ✅ (needs extension) | ⬜ pending |
| 32-03-02 | 03 | 2 | SRCH-06 | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts -x` | ✅ (needs extension) | ⬜ pending |
| 32-04-01 | 04 | 2 | SRCH-07 | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/reranker.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/db/queries/vector-search.test.ts` — stubs for SRCH-01 (sqlite-vec load, vec0 CRUD, KNN query)
- [ ] `packages/api/src/__tests__/services/embedding-service.test.ts` — stubs for SRCH-02 (content hash dedup, job queue)
- [ ] `packages/api/src/__tests__/services/rrf-fusion.test.ts` — stubs for SRCH-03 (fusion scoring, weight handling, edge cases)
- [ ] `packages/api/src/__tests__/services/reranker.test.ts` — stubs for SRCH-07 (position-aware blending, timeout, skip)
- [ ] Extend `packages/api/src/__tests__/services/ai-query-rewriter.test.ts` — stubs for SRCH-04 (LM Studio expansion, typed variants)
- [ ] Extend `packages/api/src/__tests__/routes/search.test.ts` — stubs for SRCH-05, SRCH-06 (context annotations, knowledge search)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LM Studio embedding model loads alongside chat model | SRCH-01 | Hardware-dependent: Mac Mini GPU memory | Load both models in LM Studio, verify both respond to API calls |
| Semantic query returns relevant results without keyword overlap | SRCH-01 | Requires human judgment of relevance | Search "how does the capture pipeline work", verify results are contextually relevant |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
