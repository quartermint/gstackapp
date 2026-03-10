---
phase: 04-search-intelligence
verified: 2026-03-10T03:00:00Z
status: human_needed
score: 3/3 must-haves verified
re_verification: false
human_verification:
  - test: "Open command palette, type ?flight, verify rich search results appear"
    expected: "Results from captures, commits, and projects appear with colored source badges, highlighted snippet text, and relative timestamps"
    why_human: "Visual rendering of source badges, snippet highlights, and layout cannot be verified programmatically"
  - test: "Type a natural language query like ?what was I thinking about for the flight app with GEMINI_API_KEY configured"
    expected: "AI-rewritten results appear with filter chips below the search input showing extracted project/type filters"
    why_human: "AI query rewriting quality and filter chip rendering are visual and depend on external AI service"
  - test: "Click a search result to verify hero card navigation"
    expected: "Palette closes and the hero card swaps to show the selected result's project"
    why_human: "Navigation behavior and hero card swap are UI interactions requiring manual verification"
  - test: "Type ?xyznonexistent to verify empty state"
    expected: "Shows 'No results found.' message in the command palette"
    why_human: "Empty state rendering is visual"
---

# Phase 4: Search & Intelligence Verification Report

**Phase Goal:** User can find anything they ever captured or committed using natural language -- the system becomes retrievable memory, not just a capture dump
**Verified:** 2026-03-10T03:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can search across all captures, project metadata, and commit messages from the command palette using natural language | VERIFIED | `searchUnified()` in `packages/api/src/db/queries/search.ts` queries the unified `search_index` FTS5 table containing all three source types. `useSearch` hook in `packages/web/src/hooks/use-search.ts` fetches `/api/search` and renders results via `SearchResultItem`. Command palette `?` prefix triggers search mode (line 47 of command-palette.tsx). 91 tests pass including 15 search-specific tests. |
| 2 | Search results are ranked by relevance with source type indicated (capture, commit, project) | VERIFIED | `searchUnified()` uses `bm25(search_index) AS rank` with `ORDER BY rank` (search.ts:100-103). Results include `sourceType` field from the FTS5 `source_type` column. `SearchResultItem` renders colored source badges per type: terracotta (capture), warm-accent (commit), olive (project) in search-result-item.tsx:12-19. `searchResponseSchema` in shared schemas validates the shape. |
| 3 | AI-powered queries return contextually relevant results beyond keyword matching | VERIFIED | `ai-query-rewriter.ts` implements `needsAIRewrite()` heuristic (3+ words or question patterns route through AI), `rewriteQuery()` calls Gemini to extract FTS5 terms + project/type/date filters, `processSearchQuery()` orchestrates with graceful fallback. Search route (`routes/search.ts`) integrates `processSearchQuery` -> `searchUnified`. 12 AI rewriter unit tests verify heuristic, fast path, fallback, and AI success paths. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/db/schema.ts` | Commits table Drizzle schema | VERIFIED | Lines 57-74: commits table with id, hash, message, projectSlug, authorDate, createdAt. Unique composite index on (projectSlug, hash). |
| `packages/api/drizzle/0003_commits_and_unified_search.sql` | Migration creating commits table, unified search_index FTS5 | VERIFIED | 31 lines: creates commits table, unique/regular indexes, drops old triggers and FTS tables, creates unified `search_index` FTS5, backfills from captures and projects. |
| `packages/api/src/db/queries/commits.ts` | Commit upsert and query functions | VERIFIED | 107 lines. Exports `upsertCommits` (with dedup via ON CONFLICT + search index population) and `getCommitsByProject` (ordered by authorDate DESC). |
| `packages/api/src/db/queries/search.ts` | Unified search function | VERIFIED | 244 lines. Exports `searchUnified`, `indexCapture`, `deindexCapture`, `indexProject`, `indexCommit`, `sanitizeFtsQuery`. Uses BM25 ranking, snippet(), UNINDEXED column filtering, delete-before-insert dedup. |
| `packages/api/src/services/project-scanner.ts` | Scanner persists commits to SQLite | VERIFIED | 279 lines. Imports `upsertCommits` (line 7), calls it in `scanAllProjects` (line 190) with up to 50 commits per project (git log -50 on line 70). |
| `packages/api/src/services/ai-query-rewriter.ts` | AI query rewriter with smart detection and graceful fallback | VERIFIED | 181 lines. Exports `needsAIRewrite`, `rewriteQuery`, `processSearchQuery`. Imports `isAIAvailable` from ai-categorizer. Try/catch fallback on AI error (line 173). |
| `packages/api/src/routes/search.ts` | Enhanced search route using unified search with AI rewriting | VERIFIED | 57 lines. Imports and calls `processSearchQuery` then `searchUnified`. Returns `{ results, query, rewrittenQuery, filters }`. |
| `packages/shared/src/schemas/api.ts` | Updated search schemas | VERIFIED | Exports `searchResultSchema` (with sourceType, snippet, sourceId, projectSlug), `searchResponseSchema` (with rewrittenQuery, filters), `searchQuerySchema`. |
| `packages/api/src/__tests__/services/ai-query-rewriter.test.ts` | Tests for AI rewriter | VERIFIED | 175 lines, 12 tests covering heuristic, fast path, fallback, AI success, and null output. |
| `packages/web/src/components/command-palette/search-result-item.tsx` | Search result with source badge, highlighted snippet, timestamp | VERIFIED | 75 lines. Renders source type badge with themed colors, parseSnippet for highlight rendering, formatRelativeTime for timestamp. |
| `packages/web/src/components/command-palette/filter-chips.tsx` | Dismissible filter chips | VERIFIED | 82 lines. Renders horizontal row of dismissible chips for non-null filter values. Styled with warm-gray theme tokens. |
| `packages/web/src/hooks/use-search.ts` | Search hook with debounce, abort, filters | VERIFIED | 131 lines. 200ms debounce, AbortController cancellation, parses full API response including filters and rewrittenQuery. Exports `useSearch` and `removeFilter`. |
| `packages/web/src/lib/search-utils.ts` | Snippet parsing and truncation | VERIFIED | 107 lines. Exports `parseSnippet` (mark tag to segments) and `truncateSnippet` (preserves tag integrity). |
| `packages/web/src/components/command-palette/command-palette.tsx` | Updated command palette with enhanced search | VERIFIED | 314 lines. Uses `useSearch` hook, renders `SearchResultItem` components, renders `FilterChips`, handles search result selection with project navigation. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `project-scanner.ts` | `commits.ts` | `upsertCommits` call in scanAllProjects | WIRED | Import on line 7, called on line 190 within scanAllProjects |
| `0003_commits_and_unified_search.sql` | search_index FTS5 table | Migration creates FTS5 | WIRED | `CREATE VIRTUAL TABLE search_index USING fts5(...)` on line 20, regular mode (not contentless) |
| `search.ts` (queries) | search_index FTS5 table | searchUnified queries the unified index | WIRED | `search_index MATCH ?` in SQL on line 92, uses `snippet()` and `bm25()` functions |
| `routes/search.ts` | `ai-query-rewriter.ts` | processSearchQuery call | WIRED | Import on line 5, called on line 30 |
| `routes/search.ts` | `db/queries/search.ts` | searchUnified call with rewritten query | WIRED | Import on line 4, called on line 33 with processed filters |
| `ai-query-rewriter.ts` | `ai-categorizer.ts` | imports isAIAvailable | WIRED | Import on line 4, used on line 141 in guard condition |
| `use-search.ts` | `/api/search` | fetch with debounce | WIRED | `fetch('/api/search?q=...')` on line 85, with AbortController |
| `command-palette.tsx` | `use-search.ts` | useSearch hook | WIRED | Import on line 4, called on line 59 |
| `command-palette.tsx` | `search-result-item.tsx` | renders SearchResultItem | WIRED | Import on line 5, rendered on line 299 inside Command.Group |
| `command-palette.tsx` | `filter-chips.tsx` | renders FilterChips | WIRED | Import on line 6, rendered on line 179 when activeFilters is non-null |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SRCH-01 | 04-01, 04-02, 04-03 | User can search across all captures, project metadata, and commit messages using natural language from the command palette | SATISFIED | Unified search_index FTS5 table indexes all three source types. Command palette `?` prefix triggers search mode via `useSearch` hook fetching `/api/search`. AI query rewriter translates natural language to FTS5. |
| SRCH-02 | 04-01, 04-02, 04-03 | Search results are ranked by relevance with source type indicated (capture, commit, project) | SATISFIED | `searchUnified` uses `bm25(search_index)` for ranking. Results include `sourceType` field. `SearchResultItem` renders colored source badges per type. |
| SRCH-03 | 04-02, 04-03 | AI-powered natural language queries return contextually relevant results (not just keyword matching) | SATISFIED | `ai-query-rewriter.ts` extracts optimized FTS5 terms, project/type/date filters from natural language via Gemini. `processSearchQuery` orchestrates with graceful fallback to keyword search when AI is unavailable. |

No orphaned requirements found -- REQUIREMENTS.md maps SRCH-01, SRCH-02, SRCH-03 to Phase 4, and all three are claimed by the plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/api/src/db/queries/search.ts` | 209-243 | Deprecated `searchCaptures` function retained | Info | Backward compatibility bridge, not blocking. Comments indicate it will be removed after full migration. |

No TODO/FIXME/PLACEHOLDER markers found in any Phase 4 files. No empty implementations. No stub return values.

### Human Verification Required

### 1. Rich Search Result Rendering

**Test:** Open the app at localhost:5173, press Cmd+K, type `?flight`, examine the search results.
**Expected:** Each result shows a colored source type badge (terracotta for capture, blue-ish for commit, green for project), a text snippet with highlighted matching terms (yellow background), and a right-aligned relative timestamp.
**Why human:** Visual rendering of styled badges, snippet highlights, and layout spacing cannot be verified programmatically.

### 2. AI Query Rewriting with Filter Chips

**Test:** With GEMINI_API_KEY set, type `?what was I thinking about for the flight app` in the command palette.
**Expected:** Results appear with contextually relevant matches. Below the search input, dismissible filter chips show AI-extracted filters (e.g., "project: openefb", "type: capture"). A "Searched for: ..." indicator shows the rewritten query.
**Why human:** AI quality, filter chip visual appearance, and the rewritten query indicator are visual/behavioral.

### 3. Search Result Navigation

**Test:** Click on a search result in the command palette.
**Expected:** The palette closes and the dashboard's hero card swaps to display the project associated with the selected result.
**Why human:** Navigation behavior and hero card state change require visual confirmation.

### 4. Empty State and Edge Cases

**Test:** Type `?` alone (no query), then type `?xyznonexistent`.
**Expected:** `?` alone shows hint text "Search across projects, captures, and commits...". `?xyznonexistent` shows "No results found."
**Why human:** Empty state rendering is visual behavior.

### Gaps Summary

No automated verification gaps found. All 14 artifacts exist, are substantive (no stubs), and are properly wired. All 10 key links are verified as connected. All 3 requirements (SRCH-01, SRCH-02, SRCH-03) are satisfied. All 91 tests pass. Typecheck is clean across all packages.

The only remaining verification is visual/interactive testing of the search UI in a browser (4 human verification items above). These cannot be automated because they involve rendered CSS, user interaction flows, and external AI service integration.

---

_Verified: 2026-03-10T03:00:00Z_
_Verifier: Claude (gsd-verifier)_
