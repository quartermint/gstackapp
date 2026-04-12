---
phase: 20
slug: ryan-power-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.2.4 (api) / ^3.2.4 (web, needs config) |
| **Config file (api)** | `packages/api/vitest.config.ts` |
| **Config file (web)** | None — Wave 0 creates `packages/web/vitest.config.ts` |
| **Quick run command** | `cd packages/api && npx vitest run --reporter=dot` |
| **Full suite command** | `cd packages/api && npx vitest run && cd ../web && npx vitest run` |
| **Estimated runtime** | ~40 seconds |

---

## Sampling Rate

- **After every task commit:** `cd packages/api && npx vitest run --reporter=dot`
- **After every wave merge:** `cd packages/api && npx vitest run && cd ../web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

---

## Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Projects route returns health scores | unit | `npx vitest run src/__tests__/projects-route.test.ts -x` | Exists (extend) |
| DASH-02 | Pipeline list groups by repo | unit | `npx vitest run src/__tests__/pipelines-route.test.ts -x` | Exists (extend) |
| DASH-03 | Ideation view accessible from nav | manual-only | Browser verification | N/A |
| DASH-04 | gbrain REST endpoints return search/entity/related | unit | `npx vitest run src/__tests__/gbrain-routes.test.ts -x` | Wave 0 |
| DASH-04 | gbrain unavailable returns graceful degradation | unit | `npx vitest run src/__tests__/gbrain-routes.test.ts -x` | Wave 0 |
| DASH-05 | Intelligence feed returns cross-repo matches | unit | `npx vitest run src/__tests__/intelligence-route.test.ts -x` | Wave 0 |
| DASH-01 | React component renders project cards | component | `cd packages/web && npx vitest run src/__tests__/power-overview.test.tsx -x` | Wave 0 |

---

## Wave 0 Gaps

- [ ] `packages/api/src/__tests__/gbrain-routes.test.ts` — covers DASH-04 REST endpoints
- [ ] `packages/api/src/__tests__/intelligence-route.test.ts` — covers DASH-05 feed
- [ ] `packages/web/src/__tests__/power-overview.test.tsx` — covers DASH-01 component rendering
- [ ] `packages/web/vitest.config.ts` — web package needs vitest config for component tests (jsdom environment)
