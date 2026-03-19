---
phase: 19
slug: github-star-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `pnpm --filter @mission-control/api test -- --reporter=verbose` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @mission-control/api test -- --reporter=verbose`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | STAR-01 | unit | `pnpm --filter @mission-control/api test -- star-service` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | STAR-01 | unit | `pnpm --filter @mission-control/api test -- stars.test` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 1 | STAR-03 | unit | `pnpm --filter @mission-control/api test -- star-categorizer` | ❌ W0 | ⬜ pending |
| 19-03-01 | 03 | 2 | STAR-04, STAR-05 | integration | `pnpm --filter @mission-control/api test -- star-routes` | ❌ W0 | ⬜ pending |
| 19-03-02 | 03 | 2 | STAR-07 | unit | `pnpm --filter @mission-control/api test -- star-service` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/services/star-service.test.ts` — stubs for STAR-01, STAR-04, STAR-07
- [ ] `packages/api/src/__tests__/db/stars.test.ts` — stubs for star query operations
- [ ] `packages/api/src/__tests__/services/star-categorizer.test.ts` — stubs for STAR-03
- [ ] `packages/api/src/__tests__/routes/star-routes.test.ts` — stubs for STAR-05 API routes

*Existing vitest infrastructure covers all phase requirements. No new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Star sync fetches real GitHub stars | STAR-01 | Requires authenticated `gh` CLI | Run `pnpm dev`, wait for first sync cycle, verify stars appear in GET /api/stars |
| AI categorization classifies real stars | STAR-03 | Requires GEMINI_API_KEY | After sync, verify stars have intent != null via GET /api/stars?intent=reference |
| Timer fires at configured interval | STAR-04 | Requires long-running server | Start server, verify log output shows "Star sync completed" after interval |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
