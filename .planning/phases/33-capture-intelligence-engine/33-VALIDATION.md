---
phase: 33
slug: capture-intelligence-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 33 — Validation Strategy

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
| 33-01-01 | 01 | 1 | CAP-01 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/few-shot-categorizer.test.ts -x` | ❌ W0 | ⬜ pending |
| 33-01-02 | 01 | 1 | CAP-02 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/few-shot-categorizer.test.ts -x` | ❌ W0 | ⬜ pending |
| 33-01-03 | 01 | 1 | CAP-03 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/grounding.test.ts -x` | ❌ W0 | ⬜ pending |
| 33-01-04 | 01 | 1 | CAP-04 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/db/queries/correction-stats.test.ts -x` | ❌ W0 | ⬜ pending |
| 33-01-05 | 01 | 1 | CAP-05 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/few-shot-categorizer.test.ts -x` | ❌ W0 | ⬜ pending |
| 33-01-06 | 01 | 1 | CAP-06 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/prompt-validator.test.ts -x` | ❌ W0 | ⬜ pending |
| 33-02-01 | 02 | 1 | CAP-07 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/enrichment.test.ts -x` | ✅ (extend) | ⬜ pending |
| 33-03-01 | 03 | 2 | CAP-08 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/capacities-importer.test.ts -x` | ❌ W0 | ⬜ pending |
| 33-03-02 | 03 | 2 | CAP-09 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/imessage-monitor.test.ts -x` | ❌ W0 | ⬜ pending |
| 33-03-03 | 03 | 2 | CAP-10 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/tweet-fetcher.test.ts -x` | ❌ W0 | ⬜ pending |
| 33-03-04 | 03 | 2 | CAP-11 | integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/capacities-importer.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/services/few-shot-categorizer.test.ts` — covers CAP-01, CAP-02, CAP-05
- [ ] `src/__tests__/services/grounding.test.ts` — covers CAP-03
- [ ] `src/__tests__/db/queries/correction-stats.test.ts` — covers CAP-04
- [ ] `src/__tests__/services/prompt-validator.test.ts` — covers CAP-06
- [ ] `src/__tests__/services/capacities-importer.test.ts` — covers CAP-08, CAP-11
- [ ] `src/__tests__/services/imessage-monitor.test.ts` — covers CAP-09
- [ ] `src/__tests__/services/tweet-fetcher.test.ts` — covers CAP-10
- [ ] Extend `src/__tests__/services/enrichment.test.ts` — covers CAP-07 (extractions storage)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| User corrections improve future categorization | CAP-01 | Requires live AI model + multiple correction cycles | Categorize capture, correct, recategorize new similar capture, verify improvement |
| iMessage conversations surface as captures | CAP-09 | Requires Full Disk Access + active iMessage | Send test message from Bella, verify it appears in MC |
| Crawl4AI resolves tweet content | CAP-10 | Requires live Crawl4AI on Mac Mini | Submit tweet URL capture, verify full text extracted |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
