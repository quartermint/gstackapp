---
phase: 35
slug: active-intelligence-daemon
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 35 — Validation Strategy

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
| 35-01-01 | 01 | 1 | DAEMON-07 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/db/queries/intelligence-cache.test.ts -x` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 1 | DAEMON-08 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/context-adapter.test.ts -x` | ❌ W0 | ⬜ pending |
| 35-02-01 | 02 | 1 | DAEMON-02 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/narrative-generator.test.ts -x` | ❌ W0 | ⬜ pending |
| 35-02-02 | 02 | 1 | DAEMON-03 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/routing-advisor.test.ts -x` | ❌ W0 | ⬜ pending |
| 35-02-03 | 02 | 1 | DAEMON-04 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/digest-generator.test.ts -x` | ❌ W0 | ⬜ pending |
| 35-03-01 | 03 | 2 | DAEMON-05 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/intelligence-tools.test.ts -x` | ❌ W0 | ⬜ pending |
| 35-03-02 | 03 | 2 | DAEMON-06 | unit | Covered by DAEMON-02/04/05 tests | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/db/queries/intelligence-cache.test.ts` — covers DAEMON-07
- [ ] `packages/api/src/__tests__/services/context-adapter.test.ts` — covers DAEMON-08
- [ ] `packages/api/src/__tests__/services/narrative-generator.test.ts` — covers DAEMON-02
- [ ] `packages/api/src/__tests__/services/routing-advisor.test.ts` — covers DAEMON-03
- [ ] `packages/api/src/__tests__/services/digest-generator.test.ts` — covers DAEMON-04
- [ ] `packages/api/src/__tests__/services/intelligence-tools.test.ts` — covers DAEMON-05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Previously on..." narrative quality | DAEMON-02 | Requires live LM Studio + subjective quality | Open project card, verify narrative is contextual and coherent |
| Routing suggestion accuracy | DAEMON-03 | Requires session history patterns | Start session in known project, verify suggestion matches work patterns |
| 6am daily digest generation | DAEMON-04 | Requires cron timer trigger | Check dashboard at 6am, verify overnight summary |
| Tool calling structured output | DAEMON-05 | Requires live LM Studio | Trigger tool call, verify JSON schema compliance |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
