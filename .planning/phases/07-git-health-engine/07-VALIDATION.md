---
phase: 7
slug: git-health-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1+ |
| **Config file** | `packages/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @mission-control/api test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-W0-01 | W0 | 0 | HLTH-01..08 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts` | ❌ W0 | ⬜ pending |
| 07-W0-02 | W0 | 0 | COPY-01,03,04 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-01 | 01 | 1 | HLTH-01..06 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | HLTH-07,08 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | COPY-01,03,04 | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "normalize\|diverge\|stale"` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 3 | All | integration | `pnpm --filter @mission-control/api test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/services/git-health.test.ts` — stubs for all 11 requirements (HLTH-01..08, COPY-01, COPY-03, COPY-04). Pure function tests with mocked git command output.
- [ ] `pnpm --filter @mission-control/api add p-limit` — install concurrency limiter dependency

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSH batch commands work on real Mac Mini | COPY-04 | Requires actual SSH to Mac Mini | Run scan, verify Mac Mini repos appear with health findings |
| `gh api` public repo detection | HLTH-07 | Requires GitHub API auth | Run scan, verify public repos show escalated severity |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
