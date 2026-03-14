---
phase: 6
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (latest, via pnpm) |
| **Config file** | `packages/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @mission-control/api test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | HLTH-09 | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/db/queries/health.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 0 | HLTH-10 | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/db/queries/health.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 0 | COPY-02 | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/db/queries/copies.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 0 | COPY-02 | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/lib/config.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/db/queries/health.test.ts` — stubs for HLTH-09, HLTH-10
- [ ] `packages/api/src/__tests__/db/queries/copies.test.ts` — stubs for COPY-02 (data layer)
- [ ] `packages/api/src/__tests__/lib/config.test.ts` — stubs for COPY-02 (config parsing)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Existing mc.config.json parses without error | COPY-02 | Requires actual config file with real project entries | Run API server startup, verify no config parse errors in logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
