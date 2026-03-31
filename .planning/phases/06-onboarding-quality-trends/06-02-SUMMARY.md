---
phase: 06-onboarding-quality-trends
plan: 02
subsystem: ui
tags: [react, onboarding, wizard, tanstack-query, polling, localStorage]

requires:
  - phase: 06-01
    provides: GET /api/onboarding/status endpoint, OnboardingStatus shared type
  - phase: 04-dashboard-pipeline-visualization
    provides: PipelineHero, Shell, PRFeed, PRDetail components, queryKeys factory

provides:
  - Onboarding wizard UI with three-step guided flow
  - useOnboardingStatus hook with 5s polling
  - Conditional rendering in App.tsx based on onboarding state
  - Failure preference capture in localStorage

affects: [06-03, deployment, user-experience]

tech-stack:
  added: []
  patterns: [localStorage preference storage, TanStack Query refetchInterval polling, CSS fadeIn transitions, conditional wizard/dashboard rendering]

key-files:
  created:
    - packages/web/src/hooks/useOnboardingStatus.ts
    - packages/web/src/components/onboarding/OnboardingWizard.tsx
    - packages/web/src/components/onboarding/StepInstallApp.tsx
    - packages/web/src/components/onboarding/StepSelectRepos.tsx
    - packages/web/src/components/onboarding/StepFirstReview.tsx
  modified:
    - packages/web/src/api/client.ts
    - packages/web/src/App.tsx
    - packages/web/src/app.css

key-decisions:
  - "TanStack Query refetchInterval with conditional stop for onboarding polling (stop at 'complete')"
  - "localStorage for wizard dismiss state and failure preference (no user_preferences table yet)"
  - "Wizard renders inside Shell layout to preserve sidebar spatial context"
  - "Reuse shared OnboardingStatus type from @gstackapp/shared rather than local interface"

patterns-established:
  - "Conditional main content: wizard vs dashboard based on onboarding status + dismissed state"
  - "Polling hook with auto-disable: refetchInterval callback checks query data before scheduling next poll"
  - "Step component pattern: each onboarding step is a standalone component receiving only the props it needs"

requirements-completed: [ONBD-01, ONBD-02, ONBD-03]

duration: 3min
completed: 2026-03-31
---

# Phase 06 Plan 02: Onboarding Wizard UI Summary

**Three-step onboarding wizard with auto-advancing polling, real pipeline display on first review, and failure preference capture**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-31T05:01:59Z
- **Completed:** 2026-03-31T05:05:44Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files modified:** 8

## Accomplishments

- Onboarding wizard guides first-time users through install app, select repos, trigger first review
- Auto-advances between steps via 5-second polling of /api/onboarding/status
- Step 3 displays real PipelineHero when first pipeline run detected (per D-03)
- Failure handling preference captured in localStorage (per D-04)
- Skip/dismiss button available at all times with localStorage persistence

## Task Commits

Each task was committed atomically:

1. **Task 1: Onboarding status hook and wizard component tree** - `264cfd8` (feat)
2. **Task 2: Wire wizard into App.tsx with conditional rendering** - `55236bb` (feat)
3. **Task 3: Verify onboarding wizard visually** - auto-approved (checkpoint)

## Files Created/Modified

- `packages/web/src/hooks/useOnboardingStatus.ts` - TanStack Query hook with 5s polling for onboarding status
- `packages/web/src/components/onboarding/OnboardingWizard.tsx` - Multi-step wizard container with step indicator dots and skip button
- `packages/web/src/components/onboarding/StepInstallApp.tsx` - Step 1: GitHub App install CTA with waiting pulse indicator
- `packages/web/src/components/onboarding/StepSelectRepos.tsx` - Step 2: repo detection with count display and auto-advance
- `packages/web/src/components/onboarding/StepFirstReview.tsx` - Step 3: trigger instructions, real PipelineHero, failure preference radio group
- `packages/web/src/api/client.ts` - Added onboarding.status query key
- `packages/web/src/App.tsx` - Conditional wizard/dashboard rendering with dismiss persistence
- `packages/web/src/app.css` - Added fadeIn keyframe for step transitions

## Decisions Made

- Used shared `OnboardingStatus` type from `@gstackapp/shared` instead of defining a local interface -- keeps types consistent with API
- localStorage for both wizard dismiss state and failure preference -- no user_preferences table exists yet (future scope)
- Wizard renders inside Shell to keep sidebar visible, providing spatial context during onboarding
- TanStack Query `refetchInterval` callback pattern for conditional polling (stops when step is 'complete')

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None -- all data flows are wired to the live /api/onboarding/status endpoint. Failure preference is stored in localStorage as specified (API endpoint for preferences is documented as future scope).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Onboarding wizard complete, ready for Plan 06-03 (quality trend charts)
- Dashboard conditionally shows wizard or main content based on onboarding state
- All DESIGN.md tokens applied (electric lime accent, dark surface, General Sans headings)

## Self-Check: PASSED

All 5 created files verified present. Both task commits (264cfd8, 55236bb) verified in git log. SUMMARY.md verified on disk.

---
*Phase: 06-onboarding-quality-trends*
*Completed: 2026-03-31*
