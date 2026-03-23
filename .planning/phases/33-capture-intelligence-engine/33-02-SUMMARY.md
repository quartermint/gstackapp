---
phase: 33-capture-intelligence-engine
plan: "02"
subsystem: web
tags: [extraction-badges, grounding-highlights, prompt-validation, capture-ui, dashboard]

# Dependency graph
requires:
  - phase: 33-capture-intelligence-engine
    plan: "01"
    provides: grounding engine, extraction pipeline, few-shot categorizer
provides:
  - groundExtraction and groundAllExtractions convenience API for dashboard consumption
  - prompt-validator service for startup few-shot validation
  - ExtractionBadges component with color-coded type badges
  - GroundedText component for inline text highlighting
  - CaptureItem interface extended with extractions, groundingData, sourceType
affects: [dashboard-capture-cards, capture-pipeline-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [inline-text-highlighting-via-mark-elements, extraction-badge-color-coding, optional-interface-extension-for-api-forward-compat]

key-files:
  created:
    - packages/web/src/components/capture/extraction-badges.tsx
  modified:
    - packages/api/src/services/grounding.ts
    - packages/api/src/services/prompt-validator.ts
    - packages/api/src/index.ts
    - packages/api/src/__tests__/services/grounding.test.ts
    - packages/api/src/__tests__/services/prompt-validator.test.ts
    - packages/web/src/components/capture/capture-card.tsx
    - packages/web/src/hooks/use-captures.ts

key-decisions:
  - "groundExtraction/groundAllExtractions wrap existing alignExtractions (no new matching logic)"
  - "CaptureItem extractions/groundingData/sourceType are optional fields for forward-compatibility with API enrichment"
  - "GroundedText uses mark elements with tier-differentiated styling (exact=solid bg, fuzzy=dashed border-bottom)"
  - "ExtractionBadges filter out project_ref type (already shown via project badge)"

patterns-established:
  - "Inline text highlighting: sort grounding spans by startOffset, build React elements with mark wrapping"
  - "Extraction badge color scheme: amber=Action, violet=Idea, sky=Question, emerald=Link"
  - "Optional interface extension: add nullable optional fields to client types before API enrichment ships"

requirements-completed: [CAP-03, CAP-06]

# Metrics
duration: 12min
completed: 2026-03-23
---

# Phase 33 Plan 02: Grounding Highlights + Extraction Badges + Prompt Validation Summary

**ExtractionBadges component with 4-color type badges, GroundedText inline highlighter with exact/fuzzy tier styling, prompt-validator startup service**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-23T10:54:58Z
- **Completed:** 2026-03-23T11:07:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Extraction badges (Action/Idea/Question/Link) now display on capture cards with color-coded styling
- GroundedText component renders inline text highlights using mark elements with tier-differentiated CSS
- Prompt validator runs at server startup, validating few-shot examples and logging mismatches
- groundExtraction/groundAllExtractions convenience API exports added for JSON-serializable grounding spans
- CaptureItem interface extended with optional extractions, groundingData, sourceType for forward-compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Grounding service + prompt validator + enrichment wiring** - `c666890` (feat) - grounding convenience exports, prompt-validator, startup wiring, tests [pre-committed by prior executor alongside 33-04]
2. **Task 2: Dashboard UI for extraction badges and grounding highlights** - `e8eb1d8` (feat) - ExtractionBadges, GroundedText, CaptureItem extensions

## Files Created/Modified

### Created
- `packages/web/src/components/capture/extraction-badges.tsx` - Color-coded extraction type badges (Action/Idea/Question/Link/Ref)

### Modified
- `packages/api/src/services/grounding.ts` - Added groundExtraction, groundAllExtractions, GroundedSpan02 interface
- `packages/api/src/services/prompt-validator.ts` - Startup few-shot validation service
- `packages/api/src/index.ts` - Wired validatePromptExamples in startup setTimeout block
- `packages/api/src/__tests__/services/grounding.test.ts` - Added 8 tests for convenience API
- `packages/api/src/__tests__/services/prompt-validator.test.ts` - 5 tests for validation service
- `packages/web/src/components/capture/capture-card.tsx` - Added GroundedText component, ExtractionBadges, sourceType indicator
- `packages/web/src/hooks/use-captures.ts` - Extended CaptureItem with optional extractions/groundingData/sourceType

## Decisions Made

- **groundExtraction/groundAllExtractions as thin wrappers:** The existing `alignExtractions` function from Plan 33-01 already provides full grounding. The new exports are convenience wrappers returning a different shape (flat GroundedSpan02 array with extractionIndex) suitable for JSON storage and dashboard consumption.
- **Optional fields on CaptureItem:** Made extractions/groundingData/sourceType optional (`?`) rather than required to maintain forward-compatibility with the current API which doesn't yet include these in the captures list response. The data will flow once the API enriches capture responses with aggregated extractions.
- **Tier-differentiated highlight styling:** Exact matches get solid terracotta background (`bg-terracotta/15`), fuzzy/lesser matches get subtle dashed underline (`border-b border-dashed border-terracotta/30`), communicating confidence level visually.
- **project_ref filtered from badges:** Since project assignment is already shown via the project badge button, showing a redundant "Ref" badge would be noise.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed prompt-validator test mock schema mismatch**
- **Found during:** Task 2 verification (typecheck)
- **Issue:** Test mock included headCommit, lastActivityAt, previousVisitAt, lastVisitAt fields that don't exist on the projects table schema
- **Fix:** Removed extra fields from mock data to match actual Drizzle schema
- **Files modified:** packages/api/src/__tests__/services/prompt-validator.test.ts
- **Verification:** Full typecheck passes (7/7 packages)
- **Committed in:** e8eb1d8 (Task 2 commit)

**2. [Rule 3 - Blocking] Task 1 code pre-committed by prior executor**
- **Found during:** Task 1 commit attempt
- **Issue:** Plan 33-04 executor bundled Task 1's grounding additions, prompt-validator, and startup wiring into commit c666890
- **Fix:** Verified all Task 1 code present and correct in HEAD, skipped redundant commit
- **Files affected:** grounding.ts, prompt-validator.ts, index.ts, test files
- **Impact:** No code change needed, commit c666890 contains all Task 1 work

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Bug fix was trivial type mismatch. Pre-committed work was verified correct. No scope creep.

## Issues Encountered

- CaptureItem interface extension required optional fields (`?`) because the captures list API endpoint returns raw DB columns without joined extractions data. The extraction/grounding data is stored in a separate table (capture_extractions). A future plan should enrich the captures list response to include aggregated extractions inline.

## Known Stubs

None - all components render correctly. The extractions/groundingData fields on CaptureItem will be `undefined` until the API enriches capture responses, but the UI gracefully falls back to plain text rendering.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Extraction badges and grounding highlights are UI-complete
- API capture list response needs enrichment with aggregated extractions for data to flow to dashboard
- Prompt validator fires at startup but depends on few-shot examples being present in DB
- All 931 tests passing across all packages

## Self-Check: PASSED

All created files verified on disk. Task 2 commit verified in git log.

---
*Phase: 33-capture-intelligence-engine*
*Completed: 2026-03-23*
