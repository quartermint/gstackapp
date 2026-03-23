---
phase: 27-mcp-knowledge-tools
plan: 02
subsystem: api
tags: [hono, knowledge, digest, session-hook, bash, curl]

# Dependency graph
requires:
  - phase: 24-knowledge-aggregation
    provides: Knowledge table with CLAUDE.md content, staleness scoring
  - phase: 26-convention-enforcement
    provides: convention_violation health findings
provides:
  - GET /api/knowledge/digest?cwd= endpoint returning project knowledge summary
  - SessionStart hook script enriching Claude Code banner with knowledge context
affects: [dashboard, mcp, cli]

# Tech tracking
tech-stack:
  added: []
  patterns: [SessionStart hook pattern extended for knowledge context]

key-files:
  created:
    - ~/.claude/hooks/knowledge-digest.sh
  modified:
    - packages/api/src/routes/knowledge.ts
    - packages/api/src/app.ts
    - packages/api/src/__tests__/routes/knowledge.test.ts
    - ~/.claude/settings.json

key-decisions:
  - "Digest endpoint reuses resolveProjectFromCwd from session-service for cwd-to-slug resolution"
  - "Convention violations filtered from health findings by checkType (not new query)"
  - "createKnowledgeRoutes signature extended with optional getConfig parameter (backward compatible)"

patterns-established:
  - "Knowledge digest pattern: cwd-based project resolution + multi-source data aggregation in single endpoint"

requirements-completed: [KNOW-10]

# Metrics
duration: 6min
completed: 2026-03-21
---

# Phase 27 Plan 02: Knowledge Digest + Session Hook Summary

**Knowledge digest API endpoint with SessionStart hook enriching Claude Code banner with related projects, convention violations, and stale knowledge flags**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-21T20:00:06Z
- **Completed:** 2026-03-21T20:06:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GET /api/knowledge/digest?cwd= endpoint returns concise project knowledge summary (slug, relatedProjects, violations, staleKnowledge, stalenessScore)
- SessionStart hook script (~/.claude/hooks/knowledge-digest.sh) formats 3-5 line knowledge banner at Claude Code session start
- Hook degrades gracefully when MC API is unreachable (exit 0, zero output)
- Hook registered in ~/.claude/settings.json after risks-digest (knowledge shows after risks)

## Task Commits

Each task was committed atomically:

1. **Task 1: Knowledge digest API endpoint (TDD RED)** - `3e91902` (test)
2. **Task 1: Knowledge digest API endpoint (TDD GREEN)** - `7b1f23b` (feat)

_Task 2 artifacts are outside the repo (~/.claude/hooks/, ~/.claude/settings.json)_

## Files Created/Modified
- `packages/api/src/routes/knowledge.ts` - Added digest endpoint with cwd resolution, violations count, staleness check
- `packages/api/src/app.ts` - Pass config to createKnowledgeRoutes
- `packages/api/src/__tests__/routes/knowledge.test.ts` - 7 new digest tests (400 missing cwd, empty for unknown, relatedProjects, violations, staleness)
- `~/.claude/hooks/knowledge-digest.sh` - SessionStart hook script calling /api/knowledge/digest
- `~/.claude/settings.json` - Registered knowledge-digest hook after risks-digest

## Decisions Made
- Reused resolveProjectFromCwd from session-service (no duplicate cwd resolution logic)
- Convention violations filtered from existing getActiveFindings by checkType (no new DB query)
- Extended createKnowledgeRoutes with optional getConfig parameter (default () => null for backward compatibility)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 27 complete: all knowledge tools and session enrichment delivered
- MCP knowledge tools (plan 01) and digest endpoint + hook (plan 02) both operational
- Ready for next milestone phase

---
*Phase: 27-mcp-knowledge-tools*
*Completed: 2026-03-21*
