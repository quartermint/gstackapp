---
phase: 24-knowledge-aggregation
plan: 02
subsystem: api
tags: [ssh, child-process, sha256, content-hash, p-limit, knowledge, claude-md, stale-detection]

# Dependency graph
requires:
  - phase: 24-knowledge-aggregation-plan-01
    provides: "project_knowledge table, upsertKnowledge, getKnowledge queries, knowledge:updated event type"
provides:
  - "Knowledge aggregator service: scanAllKnowledge, startKnowledgeScan"
  - "Local CLAUDE.md reading via git show HEAD:CLAUDE.md"
  - "Remote CLAUDE.md reading via SSH with ConnectTimeout=5s"
  - "Content-hash caching (zero DB writes on unchanged files)"
  - "Stale knowledge detection (>30d AND >10 commits -> stale_knowledge health finding)"
  - "Multi-copy dedup (prefers local over mac-mini, one record per slug)"
  - "Independent hourly timer registration in index.ts"
affects: [26-convention-registry, 27-mcp-knowledge-tools]

# Tech tracking
tech-stack:
  added: []
  patterns: ["knowledge aggregator timer pattern (follows discovery-scanner.ts)", "content-hash caching with SHA-256 for avoiding unnecessary DB writes"]

key-files:
  created:
    - packages/api/src/services/knowledge-aggregator.ts
    - packages/api/src/__tests__/services/knowledge-aggregator.test.ts
  modified:
    - packages/api/src/index.ts

key-decisions:
  - "Content-hash comparison using SHA-256 with CRLF->LF normalization before hashing"
  - "pLimit(3) for parallel reads (conservative to avoid SSH connection exhaustion)"
  - "AND logic for stale detection: both >30 days AND >10 commits required"
  - "buildScanTargets deduplicates multi-copy by preferring local copy over mac-mini"
  - "Separate getDatabase() call for knowledge scanner (follows discoveryDb pattern)"

patterns-established:
  - "Knowledge scanning pattern: buildScanTargets -> pLimit parallel reads -> content-hash cache check -> upsert/skip -> stale detection"
  - "SSH CLAUDE.md reading: single sh -c with git show + git log + rev-list via ===DELIM=== separator"

requirements-completed: [KNOW-01, KNOW-02, KNOW-03, KNOW-11]

# Metrics
duration: 7min
completed: 2026-03-21
---

# Phase 24 Plan 02: Knowledge Aggregator Summary

**Knowledge aggregator service scanning CLAUDE.md from local/SSH projects with SHA-256 content-hash caching, stale detection, and independent hourly timer**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-21T16:28:32Z
- **Completed:** 2026-03-21T16:36:28Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Knowledge aggregator service reads CLAUDE.md from all registered projects (local via git, Mac Mini via SSH) and stores in project_knowledge table
- Content-hash caching prevents unnecessary DB writes when CLAUDE.md is unchanged (KNOW-02)
- Stale knowledge detection surfaces health findings when CLAUDE.md is >30 days old with >10 commits since last update (KNOW-11)
- Independent hourly timer registered in index.ts with proper shutdown cleanup (KNOW-03)
- Multi-copy projects deduplicated to one knowledge record per slug (prefers local over SSH)
- GitHub-only projects gracefully skipped (no filesystem access)
- SSH failures return null without throwing (graceful degradation per D-07)
- 18 new tests (knowledge aggregator), 522 total API tests passing, typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Knowledge aggregator service with local/SSH reading, caching, stale detection** - `d41bcc6` (feat)
2. **Task 2: Timer registration in index.ts with shutdown cleanup** - `4444360` (feat)

## Files Created/Modified
- `packages/api/src/services/knowledge-aggregator.ts` - Core aggregation service: computeContentHash, readLocalClaudeMd, readRemoteClaudeMd, checkStaleKnowledge, buildScanTargets, scanAllKnowledge, startKnowledgeScan
- `packages/api/src/__tests__/services/knowledge-aggregator.test.ts` - 18 unit tests covering all behaviors (hash, caching, SSH, stale, multi-copy, timer)
- `packages/api/src/index.ts` - Added knowledgeTimer declaration, startKnowledgeScan startup, shutdown cleanup

## Decisions Made
- SHA-256 content hash with CRLF -> LF normalization ensures consistent hashing across platforms
- pLimit(3) for parallel reads -- conservative concurrency to avoid SSH connection exhaustion
- AND logic for stale detection (both thresholds required) matches D-08 spec
- buildScanTargets handles multi-copy dedup at target-building stage, before any I/O
- Separate getDatabase() call for knowledge scanner matches existing discoveryDb pattern in index.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Knowledge aggregation subsystem fully operational: data layer (Plan 01) + aggregator service (Plan 02)
- API endpoints serve knowledge data, aggregator populates on hourly timer
- Stale knowledge surfaces as health findings in risk feed
- Ready for Phase 26 (Convention Registry) to pattern-match against stored CLAUDE.md content
- Ready for Phase 27 (MCP Knowledge Tools) to expose knowledge via MCP
- 522 API tests passing, typecheck clean, zero regressions

## Self-Check: PASSED

- All 3 files exist on disk (knowledge-aggregator.ts, test, index.ts)
- Both task commits verified in git log (d41bcc6, 4444360)
- 522 API tests passing, typecheck clean

---
*Phase: 24-knowledge-aggregation*
*Completed: 2026-03-21*
