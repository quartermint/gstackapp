---
phase: 18-auto-discovery-engine-ssh-github-orgs
plan: 01
subsystem: api
tags: [ssh, github-api, discovery, dedup, remote-url-normalization]

# Dependency graph
requires:
  - phase: 17-auto-discovery-engine-local
    provides: "discovery-scanner.ts with local scan, discoveries.ts queries, discovery table schema"
provides:
  - "scanSshDiscoveries() -- Mac Mini repo detection via SSH"
  - "scanGithubOrgDiscoveries() -- GitHub org repo listing via gh api"
  - "getDiscoveriesByNormalizedUrl() -- cross-host dedup query"
  - "isAlreadyDiscoveredByRemoteUrl() -- dedup check using normalizeRemoteUrl"
  - "getTrackedPaths(config, host) -- generic helper replacing getTrackedLocalPaths"
affects: [18-auto-discovery-engine-ssh-github-orgs, 19-dashboard-discovery-panel]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SSH batch command with find+git pipeline", "per-org error isolation in GitHub scan", "insert-time cross-host dedup via URL normalization"]

key-files:
  created: []
  modified:
    - "packages/api/src/services/discovery-scanner.ts"
    - "packages/api/src/db/queries/discoveries.ts"

key-decisions:
  - "SSH uses ConnectTimeout=3 / timeout=10s (lower than project-scanner's 5/20s since discovery is less critical)"
  - "Cross-host dedup at insert time, not post-scan batch -- simpler and prevents transient duplicates"
  - "GitHub org scan uses gh api with --paginate and --jq for efficient single-pass parsing"
  - "getTrackedPaths generic helper replaces getTrackedLocalPaths for reuse across hosts"

patterns-established:
  - "Insert-time dedup: before upserting a discovery, check if same normalized remote URL exists on another host"
  - "Per-source error isolation: SSH and GitHub failures are non-fatal, each org scanned independently"

requirements-completed: [DISC-05, DISC-06, DISC-07]

# Metrics
duration: 4min
completed: 2026-03-16
---

# Phase 18 Plan 01: SSH + GitHub Org Discovery Summary

**SSH Mac Mini scanning, GitHub org repo listing, and cross-host dedup via normalizeRemoteUrl so scanForDiscoveries covers local + SSH + GitHub in one cycle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T21:51:52Z
- **Completed:** 2026-03-16T21:56:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- SSH discovery scans Mac Mini repos with 3s connect / 10s command timeouts, non-fatal failure
- GitHub org scan lists repos from configured orgs (quartermint, vanboompow) with per-org error isolation
- Cross-host dedup prevents same repo appearing as multiple discoveries across local/mac-mini/github
- scanForDiscoveries now orchestrates all three sources in a single cycle
- All 462 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SSH and GitHub org source scanning functions** - `0068ec8` (feat)
2. **Task 2: Add cross-host dedup and wire all sources into scanForDiscoveries** - `b22e0f8` (feat)

## Files Created/Modified
- `packages/api/src/services/discovery-scanner.ts` - Added scanSshDiscoveries, scanGithubOrgDiscoveries, isAlreadyDiscoveredByRemoteUrl, getTrackedPaths, getTrackedGithubRepos; wired SSH+GitHub into scanForDiscoveries
- `packages/api/src/db/queries/discoveries.ts` - Added getDiscoveriesByNormalizedUrl query for cross-host dedup lookups

## Decisions Made
- SSH uses ConnectTimeout=3 / timeout=10s (lower than project-scanner's 5s/20s since discovery is less critical than per-project scanning)
- Cross-host dedup happens at insert time rather than as a post-scan batch -- simpler implementation, prevents transient duplicates in the DB
- GitHub org scan uses `gh api` with `--paginate` and `--jq` for efficient single-pass parsing of org repos
- Replaced `getTrackedLocalPaths` with generic `getTrackedPaths(config, host)` to support both local and mac-mini tracked path extraction

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SSH + GitHub + local discovery sources all wired and operational
- Plan 18-02 (discovery tests + validation) can proceed with full source coverage to test
- Phase 19 (Dashboard Discovery Panel) has all API data sources ready

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 18-auto-discovery-engine-ssh-github-orgs*
*Completed: 2026-03-16*
