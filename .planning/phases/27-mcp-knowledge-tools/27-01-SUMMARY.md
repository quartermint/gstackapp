---
phase: 27-mcp-knowledge-tools
plan: 01
subsystem: mcp, api
tags: [mcp, knowledge, search, claude-md, conventions, sqlite]

requires:
  - phase: 24-knowledge-aggregation
    provides: "CLAUDE.md content cached in project_knowledge table with staleness scoring"
  - phase: 26-convention-enforcement
    provides: "Convention violation findings in health_findings table"
provides:
  - "GET /api/knowledge/search endpoint with case-insensitive LIKE search and snippet extraction"
  - "project_knowledge MCP tool returning CLAUDE.md content + metadata for a slug"
  - "convention_check MCP tool returning filtered convention violations for a slug"
  - "cross_project_search MCP tool searching across all project knowledge"
affects: [27-02-session-enrichment, mcp-server, claude-code-sessions]

tech-stack:
  added: []
  patterns: ["MCP tool pattern: fetchApi -> formatted text via textContent/errorContent"]

key-files:
  created:
    - packages/mcp/src/tools/project-knowledge.ts
    - packages/mcp/src/tools/convention-check.ts
    - packages/mcp/src/tools/cross-project-search.ts
    - packages/mcp/src/__tests__/tools/knowledge-tools.test.ts
  modified:
    - packages/api/src/db/queries/knowledge.ts
    - packages/api/src/routes/knowledge.ts
    - packages/api/src/__tests__/routes/knowledge.test.ts
    - packages/mcp/src/index.ts

key-decisions:
  - "LIKE COLLATE NOCASE for case-insensitive search (no FTS5 for knowledge table; content is CLAUDE.md, not user text)"
  - "Snippet extraction: 200-char window around first match, trimmed to word boundaries"
  - "Convention check filters findings by checkType === convention_violation (reuses existing health-checks API)"

patterns-established:
  - "MCP knowledge tool pattern: fetchApi to API endpoint, format as readable text with header/separator/content blocks"

requirements-completed: [KNOW-07, KNOW-08, KNOW-09]

duration: 5min
completed: 2026-03-21
---

# Phase 27 Plan 01: MCP Knowledge Tools Summary

**3 MCP tools (project_knowledge, convention_check, cross_project_search) wrapping Phase 24-26 data via knowledge search API endpoint with case-insensitive LIKE and snippet extraction**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-21T19:52:02Z
- **Completed:** 2026-03-21T19:57:10Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Knowledge search API endpoint with case-insensitive LIKE search, 200-char snippet extraction, and staleness scoring
- 3 MCP tools exposing project knowledge, convention violations, and cross-project search to Claude Code sessions
- MCP server now has 9 registered tools (was 6)

## Task Commits

Each task was committed atomically:

1. **Task 1: Knowledge search API endpoint** - `3041dd2` (test: RED) + `7f7fd79` (feat: GREEN)
2. **Task 2: Three MCP knowledge tools** - `c04894c` (test: RED) + `7d07944` (feat: GREEN)

_TDD tasks have RED (failing test) + GREEN (implementation) commits._

## Files Created/Modified
- `packages/api/src/db/queries/knowledge.ts` - Added searchKnowledge function with LIKE COLLATE NOCASE
- `packages/api/src/routes/knowledge.ts` - Added GET /knowledge/search route before :slug parameterized route
- `packages/api/src/__tests__/routes/knowledge.test.ts` - 6 new search endpoint tests
- `packages/mcp/src/tools/project-knowledge.ts` - MCP tool returning CLAUDE.md content + staleness metadata
- `packages/mcp/src/tools/convention-check.ts` - MCP tool filtering convention_violation findings
- `packages/mcp/src/tools/cross-project-search.ts` - MCP tool searching across all project knowledge
- `packages/mcp/src/index.ts` - 3 new tool imports and registrations
- `packages/mcp/src/__tests__/tools/knowledge-tools.test.ts` - 11 new MCP tool tests

## Decisions Made
- Used LIKE COLLATE NOCASE for case-insensitive search rather than FTS5 (knowledge content is CLAUDE.md docs, not user-generated text; simple substring search is sufficient and avoids new virtual table)
- Snippet extraction uses indexOf to find match position, then takes 100 chars before/after, trimmed to word boundaries
- Convention check reuses existing /api/health-checks/:slug endpoint and filters for checkType === "convention_violation" rather than adding a new API route

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 3 MCP knowledge tools ready for Claude Code session integration
- Plan 27-02 (session enrichment) can wire these tools into session startup banner
- All underlying APIs verified and passing (571 API tests, 39 MCP tests, typecheck clean)

## Self-Check: PASSED

- All 7 files verified present on disk
- All 4 commits verified in git log (3041dd2, 7f7fd79, c04894c, 7d07944)
- No stubs or placeholders found in created/modified files

---
*Phase: 27-mcp-knowledge-tools*
*Completed: 2026-03-21*
