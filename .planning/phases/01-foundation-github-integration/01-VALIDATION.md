---
phase: 1
slug: foundation-github-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `npm run test -w packages/api` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -w packages/api`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | GHUB-01 | unit | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | GHUB-02 | unit | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | GHUB-03 | integration | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | GHUB-04 | unit | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 2 | GHUB-05 | integration | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/` — test directory structure
- [ ] `packages/api/vitest.config.ts` — Vitest configuration
- [ ] `vitest` — dev dependency installed in packages/api

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub App installation flow | GHUB-01 | OAuth redirect requires browser interaction | Install App via GitHub UI, verify DB record created |
| Tailscale Funnel ingress | GHUB-02 | Network infrastructure test | Send curl to Funnel URL, verify webhook received |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
