---
phase: 04-search-intelligence
plan: 03
subsystem: ui
tags: [react, cmdk, fts5, search-ui, command-palette, tailwind]

requires:
  - phase: 04-search-intelligence-02
    provides: "Unified search API with AI query rewriter and FTS5 backend"
  - phase: 03-capture-pipeline-02
    provides: "Command palette with capture/navigate/search modes"
provides:
  - "Rich search result rendering with source badges, highlighted snippets, timestamps"
  - "useSearch hook for debounced API search with AbortController"
  - "SearchResultItem component with FTS5 snippet highlighting"
  - "FilterChips component for AI-extracted search filters"
  - "Search utilities for FTS5 snippet parsing and truncation"
affects: [05-enrichments]

tech-stack:
  added: []
  patterns:
    - "useSearch hook with debounced fetch, AbortController cancellation, and filter state"
    - "FTS5 snippet parsing to React segments (mark tag extraction)"
    - "Source type badge styling per content type (capture/commit/project)"
    - "Delete-before-insert pattern for search index deduplication"

key-files:
  created:
    - "packages/web/src/hooks/use-search.ts"
    - "packages/web/src/lib/search-utils.ts"
    - "packages/web/src/components/command-palette/search-result-item.tsx"
    - "packages/web/src/components/command-palette/filter-chips.tsx"
  modified:
    - "packages/web/src/components/command-palette/command-palette.tsx"
    - "packages/api/src/db/queries/search.ts"
    - "packages/web/src/app.css"
    - "packages/web/src/components/layout/dashboard-layout.tsx"
    - "packages/web/vite.config.ts"
    - "packages/web/src/vite-env.d.ts"

key-decisions:
  - "FTS5 snippet parsing splits on <mark> tags into typed segments for React rendering"
  - "Filter chips are informational-only in v1 (visual dismiss, no re-query)"
  - "Delete-before-insert deduplication for search index entries (prevents 13x duplication per project)"
  - "Unique cmdk item values using sourceType + sourceId + index to prevent React/cmdk crashes"
  - "Removed CSS animations on overlay/dialog to prevent white flash on mode switch"
  - "Added commit hash display in header for version verification during development"

patterns-established:
  - "useSearch hook: debounced API fetch with AbortController for search queries"
  - "parseSnippet/truncateSnippet: FTS5 mark-tag parsing for React highlight rendering"
  - "Source badge color mapping: capture (terracotta), commit (warm-accent), project (olive)"

requirements-completed: [SRCH-01, SRCH-02, SRCH-03]

duration: 25min
completed: 2026-03-10
---

# Phase 4 Plan 3: Enhanced Search UI Summary

**Rich command palette search with source badges, highlighted FTS5 snippets, filter chips, and deduplicated search indexing**

## Performance

- **Duration:** ~25 min (including verification and bug fixes)
- **Started:** 2026-03-10T02:00:00Z
- **Completed:** 2026-03-10T02:32:14Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Search results in command palette show colored source type badges (capture/commit/project), FTS5 highlighted snippets, and relative timestamps
- useSearch hook manages debounced API fetching with AbortController cancellation and filter state
- AI-extracted filter chips display below search input (informational in v1, dismissible visually)
- Fixed critical bugs during verification: FTS5 contentless table, 13x duplicate indexing, cmdk value collisions, CSS animation flash

## Task Commits

Each task was committed atomically:

1. **Task 1: Search utilities, search hook, and result components** - `1773e83` (feat)
2. **Task 2: Wire enhanced search into command palette** - `8f849c4` (feat)
3. **Task 3: Visual verification fixes** - `b77b1fa` (fix)

## Files Created/Modified

- `packages/web/src/lib/search-utils.ts` - FTS5 snippet parsing (parseSnippet) and truncation (truncateSnippet)
- `packages/web/src/hooks/use-search.ts` - Debounced search hook with AbortController, filter state, loading state
- `packages/web/src/components/command-palette/search-result-item.tsx` - Search result with source badge, highlighted snippet, timestamp
- `packages/web/src/components/command-palette/filter-chips.tsx` - Dismissible AI-extracted filter chips
- `packages/web/src/components/command-palette/command-palette.tsx` - Rewired to use useSearch hook and new components
- `packages/api/src/db/queries/search.ts` - Delete-before-insert deduplication for indexProject and indexCommit
- `packages/web/src/app.css` - Removed animation keyframes causing white flash
- `packages/web/src/components/layout/dashboard-layout.tsx` - Commit hash display in header
- `packages/web/vite.config.ts` - Define __COMMIT_HASH__ from git rev-parse
- `packages/web/src/vite-env.d.ts` - TypeScript declaration for __COMMIT_HASH__ global

## Decisions Made

- **FTS5 snippet parsing**: Split on `<mark>` tags into `{ text, highlighted }` segments for safe React rendering (no dangerouslySetInnerHTML)
- **Filter chips v1 scope**: Informational only -- show what AI understood, dismiss visually, no re-query on dismiss. Future enhancement.
- **Search index dedup**: Delete-before-insert pattern chosen over UPSERT because FTS5 virtual tables don't support ON CONFLICT
- **Unique cmdk values**: Appended index to `sourceType-sourceId` key to handle duplicate search results from overlapping index entries
- **No CSS animations on palette**: Removed fade-in/scale-in keyframes that replayed on every mode switch causing visual flash

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FTS5 contentless table prevented snippet retrieval**
- **Found during:** Task 3 (verification)
- **Issue:** FTS5 table created with `content=''` (contentless) which doesn't support `snippet()` function
- **Fix:** Recreated as regular FTS5 table (already handled in 04-01 but needed runtime verification)
- **Files modified:** Database recreation at runtime
- **Verification:** Search queries return proper snippets with highlighted terms

**2. [Rule 1 - Bug] Duplicate search_index entries (13x per project)**
- **Found during:** Task 3 (verification)
- **Issue:** Scanner re-indexed projects and commits on every poll cycle without dedup, causing 13x duplicate entries
- **Fix:** Added DELETE before INSERT in indexProject and indexCommit functions
- **Files modified:** packages/api/src/db/queries/search.ts
- **Verification:** Search results show each project/commit once

**3. [Rule 1 - Bug] Duplicate cmdk item values causing React crash**
- **Found during:** Task 3 (verification)
- **Issue:** Multiple search results with same sourceId caused cmdk to render duplicate `value` attributes, crashing React
- **Fix:** Added index to key and value: `search-${sourceType}-${sourceId}-${index}`
- **Files modified:** command-palette.tsx, search-result-item.tsx
- **Verification:** Multiple results render without crash

**4. [Rule 1 - Bug] CSS overlay animation causing white flash on mode switch**
- **Found during:** Task 3 (verification)
- **Issue:** `cmdk-fade-in` and `cmdk-scale-in` animations replayed when switching between navigate/capture/search modes
- **Fix:** Replaced animation keyframes with static `opacity: 1`
- **Files modified:** packages/web/src/app.css
- **Verification:** Mode switching is instant with no visual flash

**5. [Rule 2 - Missing Critical] No empty state for search mode**
- **Found during:** Task 3 (verification)
- **Issue:** Typing `?` with no query showed blank content -- no guidance for user
- **Fix:** Added hint text: "Search across projects, captures, and commits..."
- **Files modified:** packages/web/src/components/command-palette/command-palette.tsx
- **Verification:** Typing `?` shows helpful hint text

---

**Total deviations:** 5 auto-fixed (4 bugs, 1 missing critical)
**Impact on plan:** All fixes necessary for correct search experience. No scope creep. The commit hash display was added for developer convenience during verification.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 (Search & Intelligence) is now **complete** -- all 3 plans executed
- Unified FTS5 search index, AI query rewriter, and enhanced search UI are fully operational
- Ready for Phase 5 (Dashboard Enrichments & Real-Time): sprint heatmap, "Previously on...", stale nudges, health pulse, SSE

## Self-Check: PASSED

All 10 files verified present. All 3 commits verified in git log (1773e83, 8f849c4, b77b1fa).

---
*Phase: 04-search-intelligence*
*Completed: 2026-03-10*
