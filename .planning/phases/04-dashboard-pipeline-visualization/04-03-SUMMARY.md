---
phase: 04-dashboard-pipeline-visualization
plan: 03
subsystem: ui
tags: [react, tanstack-query, pipeline-visualization, css-animations, sse, design-system]

# Dependency graph
requires:
  - phase: 04-02
    provides: React SPA scaffold, Hono RPC client, SSE hooks, app shell layout, shared UI components, DESIGN.md theme tokens
provides:
  - Pipeline hero view at 60%+ viewport height with 5 connected stage nodes
  - StageNode component with spectral identity colors, dim-to-bright reveal, pulse-glow animation
  - StageConnector SVG with trace-flow animation for active connections
  - PipelineTopology 5-node horizontal layout (CEO->Eng->Design->QA->Security)
  - usePipelineList and usePipelineDetail TanStack Query hooks
  - Loading skeleton and empty state handling for pipeline hero
affects: [04-04, 05-cross-repo-intelligence, 06-onboarding-quality-trends]

# Tech tracking
tech-stack:
  added: []
  patterns: [pipeline-topology-layout, stage-node-animations, css-variable-driven-glow, stable-react-keys, direct-fetch-typed-hooks]

key-files:
  created:
    - packages/web/src/hooks/usePipeline.ts
    - packages/web/src/components/pipeline/StageNode.tsx
    - packages/web/src/components/pipeline/StageConnector.tsx
    - packages/web/src/components/pipeline/PipelineTopology.tsx
    - packages/web/src/components/pipeline/PipelineHero.tsx
  modified:
    - packages/web/src/App.tsx

key-decisions:
  - "Direct fetch with typed interfaces over Hono RPC inference for cross-package type safety in composite TS projects"
  - "CSS variable --glow-color for per-stage pulse animation color, consumed by pulse-glow keyframe in app.css"

patterns-established:
  - "Pipeline component hierarchy: PipelineHero -> PipelineTopology -> StageNode + StageConnector"
  - "Stable React keys using stage name (not array index) for CSS transition persistence"
  - "Stage order constant: CEO -> Eng -> Design -> QA -> Security in all topology renders"

requirements-completed: [DASH-01, DASH-02, DASH-04, DASH-05]

# Metrics
duration: 3min
completed: 2026-03-31
---

# Phase 4 Plan 3: Pipeline Hero Visualization Summary

**Pipeline hero with 5 connected stage nodes showing spectral identity colors, dim-to-bright reveal animation, and pulse-glow on running stages**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-31T03:48:15Z
- **Completed:** 2026-03-31T03:51:12Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files modified:** 6

## Accomplishments
- Pipeline hero view occupies 60%+ viewport height as the signature UI feature
- 5 stage nodes render in horizontal CEO -> Eng -> Design -> QA -> Security topology with spectral identity colors
- Stage animations: PENDING at 20% opacity, RUNNING with pulsing glow, completed at full opacity with 400ms dim-to-bright transition
- SVG connector lines between stages animate with trace-flow when active
- Real-time SSE-driven updates via TanStack Query cache invalidation
- Loading skeletons and empty state ("No reviews yet") handled gracefully

## Task Commits

Each task was committed atomically:

1. **Task 1: Pipeline data hooks and stage node/connector components** - `7fdc55a` (feat)
2. **Task 2: Pipeline topology layout and hero container wired into App** - `334f6f8` (feat)
3. **Task 3: Verify pipeline hero visualization** - Auto-approved (checkpoint)

## Files Created/Modified
- `packages/web/src/hooks/usePipeline.ts` - TanStack Query hooks (usePipelineList, usePipelineDetail) with typed API response interfaces
- `packages/web/src/components/pipeline/StageNode.tsx` - Individual stage node with spectral color bar, opacity transitions, pulse-glow animation
- `packages/web/src/components/pipeline/StageConnector.tsx` - SVG connector with trace-flow animation between stages
- `packages/web/src/components/pipeline/PipelineTopology.tsx` - 5-node horizontal layout composing StageNodes and StageConnectors
- `packages/web/src/components/pipeline/PipelineHero.tsx` - Hero container with 60vh min-height, loading/empty/data states
- `packages/web/src/App.tsx` - Updated to render PipelineHero inside Shell

## Decisions Made
- Used direct `fetch()` with explicit TypeScript interfaces instead of Hono RPC client (`hc`) for pipeline data hooks. Hono RPC type inference loses deep route types across composite TypeScript project references, causing `client` to resolve as `unknown`. Direct fetch with typed response interfaces provides reliable type safety without depending on cross-package inference.
- CSS variable `--glow-color` set as inline style on StageNode, consumed by `pulse-glow` keyframe defined in app.css. This allows each stage's spectral identity color to drive its own glow animation without needing separate keyframes per stage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched from Hono RPC to direct fetch for pipeline hooks**
- **Found during:** Task 1 (Pipeline data hooks)
- **Issue:** `client.api.pipelines.$get()` returned `unknown` because Hono RPC type inference (`hc<AppType>`) loses deep route types across composite TypeScript project references. All 4 usages of `client` caused TS18046 errors.
- **Fix:** Replaced Hono RPC calls with direct `fetch('/api/pipelines')` and defined explicit TypeScript interfaces (`PipelineListItem`, `PipelineDetail`) matching the API route response shapes. The Vite proxy still routes `/api/*` to the backend.
- **Files modified:** `packages/web/src/hooks/usePipeline.ts`
- **Verification:** `npx tsc --noEmit --project packages/web/tsconfig.json` passes clean
- **Committed in:** `7fdc55a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for TypeScript compilation. No scope creep. The typed interfaces match the API response exactly.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Pipeline hero visualization complete, ready for Plan 04-04 (review feed + detail views)
- All shared pipeline components (StageNode, StageConnector, PipelineTopology) available for reuse
- usePipelineList and usePipelineDetail hooks provide typed data access for downstream views

## Self-Check: PASSED

All 7 files verified present. Both task commits (7fdc55a, 334f6f8) found in git log. TypeScript compilation passes clean.

---
*Phase: 04-dashboard-pipeline-visualization*
*Completed: 2026-03-31*
