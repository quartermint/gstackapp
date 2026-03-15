---
phase: 10-mcp-server-deprecation
plan: 02
subsystem: mcp
tags: [mcp, claude-code, session-hook, risks, portfolio-dashboard, deprecation]

# Dependency graph
requires:
  - phase: 10-mcp-server-deprecation
    plan: 01
    provides: "@mission-control/mcp package with 4 MCP tools at dist/index.js"
  - phase: 08-health-api-events
    provides: "/api/risks endpoint for session hook to consume"
provides:
  - "risks-digest.sh SessionStart hook surfacing critical risks after worklog"
  - "mission-control MCP server registered with Claude Code (stdio transport)"
  - "portfolio-dashboard MCP server removed from Claude Code config"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: ["SessionStart hook with curl + python3 JSON parsing", "Silent exit 0 on error for session hooks", "MCP server registration via claude mcp add"]

key-files:
  created:
    - ~/.claude/hooks/risks-digest.sh
  modified:
    - ~/.claude/settings.json
    - ~/.claude.json

key-decisions:
  - "risks-digest.sh uses same python3 parsing pattern as worklog-digest.sh for consistency"
  - "Warnings summarized as count ('+ N warnings') to avoid session banner noise"
  - "Silent exit 0 on any curl or parse error — session hooks must never block startup"
  - "portfolio-dashboard has no GitHub remote — archival step skipped, MCP removal sufficient"

patterns-established:
  - "Risk display: critical listed individually with red circle, warnings summarized as count"
  - "Hook ordering: gsd-check-update -> worklog-digest -> risks-digest"

requirements-completed: [MCP-06, MIGR-02, MIGR-03]

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 10 Plan 02: Session Hook & MCP Registration Summary

**risks-digest.sh SessionStart hook with curl-based risk surfacing, mission-control MCP server registered via stdio, portfolio-dashboard MCP removed**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T02:41:59Z
- **Completed:** 2026-03-15T02:44:13Z
- **Tasks:** 2 (1 auto + 1 checkpoint auto-approved)
- **Files created/modified:** 3 (all outside repo — user-level config)

## Accomplishments

- Created `~/.claude/hooks/risks-digest.sh` — calls MC API `/api/risks`, shows critical risks individually with red circle emoji, summarizes warnings as count, zero output when healthy
- Registered hook as 3rd SessionStart entry in `~/.claude/settings.json` (after gsd-check-update and worklog-digest)
- Registered `mission-control` MCP server with Claude Code via `claude mcp add` (stdio transport, MC_API_URL env var)
- Removed `portfolio-dashboard` MCP server from Claude Code config — direct swap complete
- Verified: hook runs cleanly, MCP server shows Connected, all 4 tools accessible

## Task Commits

No in-repo file changes — all modifications were to user-level config files outside the mission-control repository:
- `~/.claude/hooks/risks-digest.sh` (created)
- `~/.claude/settings.json` (modified)
- `~/.claude.json` (modified by `claude mcp add/remove`)

## Files Created/Modified

- `~/.claude/hooks/risks-digest.sh` — SessionStart hook: curl /api/risks, python3 parse, format risk banner
- `~/.claude/settings.json` — Added risks-digest.sh as 3rd SessionStart hook entry
- `~/.claude.json` — Added mission-control MCP (stdio), removed portfolio-dashboard MCP

## Decisions Made

- Used same python3 JSON parsing pattern as worklog-digest.sh for consistency across hooks
- Warnings summarized as `+ N warnings (see dashboard)` rather than listed individually — prevents session banner noise
- Silent `exit 0` on any curl failure or parse error — hooks must never block session startup
- portfolio-dashboard has no GitHub remote repo — archival step not applicable, MCP config removal is the complete deprecation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `claude mcp add` flag syntax required reordering**
- **Found during:** Task 1 (MCP server registration)
- **Issue:** `--env` flag not recognized; `-e` flag was parsed incorrectly when placed before the server name argument
- **Fix:** Reordered arguments: name first, then `-e` flag, per `claude mcp add --help` syntax
- **Files modified:** None (CLI command adjustment)
- **Committed in:** N/A (CLI operation)

**2. [Rule 1 - Bug] portfolio-dashboard has no GitHub remote — archival not possible**
- **Found during:** Task 2 (checkpoint verification)
- **Issue:** Plan specified `gh repo edit quartermint/portfolio-dashboard --archived` but the repo does not exist on GitHub (no git repo, no remote)
- **Fix:** Skipped GitHub archival. MCP config removal from Claude Code is the meaningful deprecation action — the local directory can be cleaned up manually
- **Files modified:** None
- **Committed in:** N/A

---

**Total deviations:** 2 (1 blocking CLI syntax, 1 inapplicable archive step)
**Impact on plan:** Minimal. MCP registration succeeded after syntax fix. Portfolio-dashboard fully deprecated via config removal even without GitHub archival.

## Issues Encountered

- `claude mcp add` CLI has specific argument ordering requirements — name must come before `-e` env flag. Resolved by consulting `--help` output.
- portfolio-dashboard directory exists locally but has no `.git` directory and no GitHub remote. The deprecation is complete via MCP config removal.

## User Setup Required

None — all changes are user-level config already applied to this machine.

## Next Phase Readiness

- All v1.1 MCP requirements complete (MCP-01 through MCP-06)
- All migration requirements complete (MIGR-01 through MIGR-03)
- Phase 10 fully complete — ready for milestone closure
- Mission Control MCP server live and connected in Claude Code sessions
- Session startup hook active for next Claude Code session

## Self-Check: PASSED

- risks-digest.sh exists and is executable
- risks-digest.sh registered in settings.json SessionStart hooks
- mission-control MCP server connected in Claude Code
- portfolio-dashboard MCP server removed from Claude Code
- 10-02-SUMMARY.md created

---
*Phase: 10-mcp-server-deprecation*
*Completed: 2026-03-15*
