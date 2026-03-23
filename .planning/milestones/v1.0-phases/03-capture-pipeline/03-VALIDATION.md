---
phase: 3
slug: capture-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.x |
| **Config file** | `packages/api/vitest.config.ts` (forks pool, node env) and `packages/web/vitest.config.ts` (forks pool, jsdom env) |
| **Quick run command** | `pnpm --filter @mission-control/api test` or `pnpm --filter @mission-control/web test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test` and `pnpm --filter @mission-control/web test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CAPT-01 | integration | `pnpm --filter @mission-control/api vitest run src/__tests__/routes/captures.test.ts -x` | Partial | ⬜ pending |
| 03-01-02 | 01 | 1 | CAPT-06 | integration | `pnpm --filter @mission-control/api vitest run src/__tests__/routes/captures.test.ts -x` | Yes | ⬜ pending |
| 03-01-03 | 01 | 1 | CAPT-09 | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/services/link-extractor.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | CAPT-02 | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/services/ai-categorizer.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | CAPT-03 | integration | `pnpm --filter @mission-control/api vitest run src/__tests__/routes/captures.test.ts -x` | Partial | ⬜ pending |
| 03-02-03 | 02 | 1 | CAPT-07 | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/services/stale-captures.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 1 | CAPT-08 | integration | `pnpm --filter @mission-control/api vitest run src/__tests__/routes/search.test.ts -x` | Partial | ⬜ pending |
| 03-03-01 | 03 | 2 | CAPT-04 | component | `pnpm --filter @mission-control/web vitest run src/__tests__/components/capture-card.test.tsx -x` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | CAPT-05 | component | `pnpm --filter @mission-control/web vitest run src/__tests__/components/loose-thoughts.test.tsx -x` | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 | 2 | INTR-01 | component | `pnpm --filter @mission-control/web vitest run src/__tests__/components/command-palette.test.tsx -x` | ❌ W0 | ⬜ pending |
| 03-03-04 | 03 | 2 | INTR-02 | component | `pnpm --filter @mission-control/web vitest run src/__tests__/hooks/use-keyboard-shortcuts.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-03-05 | 03 | 2 | INTR-03 | manual-only | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/services/ai-categorizer.test.ts` — stubs for CAPT-02 (mock AI SDK, verify schema output)
- [ ] `packages/api/src/__tests__/services/link-extractor.test.ts` — stubs for CAPT-09 (mock open-graph-scraper, verify URL detection)
- [ ] `packages/api/src/__tests__/services/stale-captures.test.ts` — stubs for CAPT-07 (verify date-based query)
- [ ] `packages/web/src/__tests__/components/capture-card.test.tsx` — stubs for CAPT-04
- [ ] `packages/web/src/__tests__/components/loose-thoughts.test.tsx` — stubs for CAPT-05
- [ ] `packages/web/src/__tests__/components/command-palette.test.tsx` — stubs for INTR-01
- [ ] `packages/web/src/__tests__/hooks/use-keyboard-shortcuts.test.ts` — stubs for INTR-02
- [ ] AI SDK dependency: `pnpm --filter @mission-control/api add ai @ai-sdk/openai @ai-sdk/anthropic`
- [ ] cmdk dependency: `pnpm --filter @mission-control/web add cmdk`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hybrid keyboard + mouse interaction | INTR-03 | Interactive behavior best verified visually | 1. Tab through capture field, palette, project cards. 2. Click to interact at each step. 3. Verify no focus traps or dead zones. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
