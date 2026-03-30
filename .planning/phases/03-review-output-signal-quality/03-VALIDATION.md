---
phase: 3
slug: review-output-signal-quality
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `npm run test -w packages/api` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -w packages/api`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | REVW-01, REVW-03 | unit | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | REVW-02, REVW-04 | unit | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 2 | SGNL-01, SGNL-02, SGNL-03 | unit | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 2 | REVW-05, REVW-06 | integration | `npm run test -w packages/api` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Mock Octokit client for GitHub API testing
- [ ] Test fixtures for pipeline run results with findings

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PR comment renders correctly on GitHub | REVW-01 | GitHub rendering not testable locally | Create test PR, trigger pipeline, verify comment format |
| Inline comments appear on correct diff lines | REVW-02 | Requires real GitHub PR diff | Same test PR, verify inline comments on diff |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
