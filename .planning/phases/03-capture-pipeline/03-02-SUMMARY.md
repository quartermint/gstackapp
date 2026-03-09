---
phase: 03-capture-pipeline
plan: 02
subsystem: ui
tags: [react, cmdk, capture, command-palette, keyboard-shortcuts, textarea-autosize]

# Dependency graph
requires:
  - phase: 02-dashboard-core
    provides: Dashboard layout, warm theme tokens, project hooks, departure board components
provides:
  - Always-visible capture field component with Enter-to-submit
  - cmdk-powered command palette with capture/navigate/search modes
  - Keyboard shortcuts hook (Cmd+K, /, Esc) with input-aware guards
  - Capture submission hook (POST /api/captures)
  - Captures data hooks (per-project, recent, stale count)
affects: [03-capture-pipeline, 04-search-intelligence]

# Tech tracking
tech-stack:
  added: [cmdk 1.1.1, react-textarea-autosize 8.5.x]
  patterns: [prefix-based mode switching in command palette, useRef stable handler pattern for keyboard shortcuts]

key-files:
  created:
    - packages/web/src/components/capture/capture-field.tsx
    - packages/web/src/components/command-palette/command-palette.tsx
    - packages/web/src/hooks/use-capture-submit.ts
    - packages/web/src/hooks/use-captures.ts
    - packages/web/src/hooks/use-keyboard-shortcuts.ts
  modified:
    - packages/web/src/App.tsx
    - packages/web/src/app.css
    - packages/web/package.json

key-decisions:
  - "Clear text on submit, keep focus in field (chat-input model for rapid-fire stacking)"
  - "useRef pattern for keyboard shortcut handlers to avoid stale closures"
  - "cmdk shouldFilter disabled in search mode (API-driven FTS5 results), enabled in navigate mode"
  - "Stale count hook gracefully handles missing /api/captures/stale endpoint (Plan 03-01 dependency)"
  - "CSS-in-file cmdk styles using CSS custom properties from theme, not Tailwind utility classes for cmdk internals"

patterns-established:
  - "Prefix-based command palette modes: default=capture, /=navigate, ?=search"
  - "Input-aware keyboard shortcut guards: check activeElement before firing shortcuts"
  - "Graceful degradation for missing API endpoints (return defaults, no crashes)"

requirements-completed: [CAPT-01, INTR-01, INTR-02, INTR-03]

# Metrics
duration: 6min
completed: 2026-03-09
---

# Phase 3 Plan 2: Capture UI Foundations Summary

**Always-visible capture field with Enter-to-submit, cmdk command palette with capture/navigate/search modes, and Cmd+K/Esc keyboard shortcuts**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-09T17:32:45Z
- **Completed:** 2026-03-09T17:39:22Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Built always-visible capture field at top of dashboard with auto-growing textarea (1-4 lines), Enter-to-submit, and "Capturing..." pending indicator
- Created cmdk-powered command palette with three prefix-based modes: default capture, '/' navigate with fuzzy project filtering, '?' search via FTS5
- Implemented global keyboard shortcuts (Cmd+K, /, Esc) with input-aware guards preventing shortcut interference while typing
- Created complete hook layer: useCaptureSubmit, useCaptures, useRecentCaptures, useStaleCount, useKeyboardShortcuts
- Wired all components into App.tsx preserving existing dashboard functionality

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create capture hooks** - `ae6fb15` (feat)
2. **Task 2: Build capture field and command palette components** - `0d87188` (feat)
3. **Task 3: Wire capture field and palette into App.tsx** - `050b86d` (feat)

## Files Created/Modified
- `packages/web/src/hooks/use-capture-submit.ts` - Hook for submitting captures via POST /api/captures with pending state
- `packages/web/src/hooks/use-captures.ts` - Hooks for fetching captures (per-project, recent, stale count)
- `packages/web/src/hooks/use-keyboard-shortcuts.ts` - Global keyboard shortcut listener with input-aware guards
- `packages/web/src/components/capture/capture-field.tsx` - Always-visible auto-growing capture input
- `packages/web/src/components/command-palette/command-palette.tsx` - cmdk-powered command palette with mode switching
- `packages/web/src/app.css` - Added cmdk animation styles and warm-gray color token
- `packages/web/src/App.tsx` - Integrated capture field and command palette
- `packages/web/package.json` - Added cmdk and react-textarea-autosize dependencies

## Decisions Made
- Clear text on submit with cursor staying in field (chat-input model) per research recommendation, matching "rapid-fire stacking" intent from CONTEXT.md
- Used useRef pattern for keyboard shortcut handlers to avoid stale closures on every render
- Disabled cmdk built-in filtering in search mode (API handles FTS5 results), enabled in navigate mode for fuzzy project matching
- Stale count hook returns 0 gracefully when /api/captures/stale endpoint doesn't exist yet (Plan 03-01 creates it)
- Used native CSS for cmdk internal styling (group headings, item selection) rather than Tailwind utilities, since cmdk uses data attributes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added warm-gray color token to CSS theme**
- **Found during:** Task 2 (command palette styling)
- **Issue:** `warm-gray` color was used in Tailwind classes (e.g., `border-warm-gray/30`) but not defined as a CSS custom property in the @theme block. Tailwind v4 requires explicit theme values.
- **Fix:** Added `--color-warm-gray: #9c8b7e` to the @theme block in app.css
- **Files modified:** packages/web/src/app.css
- **Verification:** Typecheck passes, no Tailwind compilation errors
- **Committed in:** 0d87188 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor CSS token addition necessary for styling to work. No scope creep.

## Issues Encountered
- Pre-existing API typecheck failure (`ai-categorizer.test.ts` references module from Plan 03-01 that hasn't been executed yet). Logged to `deferred-items.md`. Does not affect web package.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Capture field and command palette are ready for integration with project cards (Plan 03-03)
- Hooks are ready to be consumed by capture card and loose thoughts components
- Plan 03-01 (backend enrichment) should be executed to provide the /api/captures/stale endpoint that useStaleCount depends on

## Self-Check: PASSED

All 5 created files verified. All 3 task commits (ae6fb15, 0d87188, 050b86d) verified in git log.

---
*Phase: 03-capture-pipeline*
*Completed: 2026-03-09*
