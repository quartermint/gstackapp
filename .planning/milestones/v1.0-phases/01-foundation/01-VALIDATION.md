---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | Root `vitest.config.ts` with `projects: ['packages/*']` |
| **Quick run command** | `pnpm --filter api test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | FOUND-01 | integration | `pnpm --filter api test -- --grep "health"` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | FOUND-02 | integration | `pnpm --filter api test -- --grep "captures"` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | FOUND-03 | integration | `pnpm --filter api test -- --grep "search"` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | FOUND-04 | integration | `pnpm --filter api test -- --grep "routes"` | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 1 | FOUND-05 | unit | `pnpm --filter api test -- --grep "scanner"` | ❌ W0 | ⬜ pending |
| 01-01-06 | 01 | 1 | PLAT-02 | integration | `pnpm --filter api test -- --grep "userId"` | ❌ W0 | ⬜ pending |
| 01-01-07 | 01 | 1 | PLAT-03 | unit | `pnpm --filter api test -- --grep "config"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/vitest.config.ts` — test config with SQLite in-memory or temp file
- [ ] `packages/api/src/__tests__/routes/health.test.ts` — health endpoint test
- [ ] `packages/api/src/__tests__/routes/captures.test.ts` — CRUD integration tests
- [ ] `packages/api/src/__tests__/routes/search.test.ts` — FTS5 search tests
- [ ] `packages/api/src/__tests__/services/project-scanner.test.ts` — scanner unit tests
- [ ] `packages/api/src/__tests__/helpers/setup.ts` — test database setup/teardown helper
- [ ] Root `vitest.config.ts` with `projects` array for monorepo

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard fetches all data via API (no direct DB) | PLAT-01 | Architectural constraint, not a runtime behavior | Verify `packages/web/` has no imports from `packages/api/src/db/`. Grep for direct SQLite usage in web package. |
| API accessible from Tailscale network | PLAT-03 | Requires network access from separate device | From another Tailscale device, `curl http://<mac-mini-ip>:3000/api/health` and verify JSON response. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
