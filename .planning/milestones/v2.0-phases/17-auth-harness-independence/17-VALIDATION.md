---
phase: 17
slug: auth-harness-independence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/api/vitest.config.ts` |
| **Quick run command** | `npm run test --workspace=@gstackapp/api -- --run` |
| **Full suite command** | `npm run test --workspace=@gstackapp/api -- --run && npm run test --workspace=@gstackapp/harness -- --run` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test --workspace=@gstackapp/api -- --run`
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | AUTH-01 | T-17-01 | Tailscale whois returns user identity | unit | `npm run test -- --run -t "tailscale"` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | AUTH-02 | T-17-02 | Magic link token validates correctly | unit | `npm run test -- --run -t "magic-link"` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 1 | AUTH-03 | T-17-03 | Role assignment matches config | unit | `npm run test -- --run -t "role"` | ❌ W0 | ⬜ pending |
| 17-01-04 | 01 | 1 | AUTH-04 | T-17-04 | Session isolation enforced | integration | `npm run test -- --run -t "session"` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 2 | HRN-01 | — | POST /api/operator/request creates pipeline run | integration | `npm run test -- --run -t "operator"` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 2 | HRN-02 | — | Harness spawns claude subprocess | integration | `npm run test -- --run -t "harness"` | ❌ W0 | ⬜ pending |
| 17-02-03 | 02 | 2 | HRN-03 | — | Agent executes pipeline stages | integration | `npm run test -- --run -t "pipeline"` | ❌ W0 | ⬜ pending |
| 17-02-04 | 02 | 2 | HRN-04 | — | SSE streams stage results to UI | integration | `npm run test -- --run -t "sse"` | ❌ W0 | ⬜ pending |
| 17-02-05 | 02 | 2 | HRN-05 | — | Decision gates pause and resume | integration | `npm run test -- --run -t "gate"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/auth-tailscale.test.ts` — stubs for AUTH-01
- [ ] `packages/api/src/__tests__/auth-magic-link.test.ts` — stubs for AUTH-02, AUTH-03
- [ ] `packages/api/src/__tests__/session-isolation.test.ts` — stubs for AUTH-04
- [ ] `packages/api/src/__tests__/operator-request.test.ts` — stubs for HRN-01
- [ ] `packages/api/src/__tests__/harness-spawn.test.ts` — stubs for HRN-02, HRN-03
- [ ] `packages/api/src/__tests__/sse-streaming.test.ts` — stubs for HRN-04
- [ ] `packages/api/src/__tests__/decision-gate.test.ts` — stubs for HRN-05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tailscale tailnet auto-detect | AUTH-01 | Requires actual Tailscale tailnet connection | Access dashboard from tailnet device, verify auto-login |
| Magic link email delivery | AUTH-02 | Requires SendGrid email delivery | Request magic link, check inbox, click link |
| SSE real-time streaming in browser | HRN-04 | Visual verification of live updates | Trigger pipeline, watch stage updates in browser |
| Decision gate UI interaction | HRN-05 | Browser button click + pipeline resume | Trigger pipeline with gate, click approve, verify resume |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
