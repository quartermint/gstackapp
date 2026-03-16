# Phase 20: Session Enrichment — Research

**Researched:** 2026-03-16
**Phase goal:** Claude Code sessions gain self-awareness through MCP tools, and MC detects when parallel sessions are ready to converge
**Requirement IDs:** SESS-01, SESS-02, SESS-03, SESS-04, SESS-05

## Stack & Integration Points

### Existing MCP Infrastructure
- MCP server: `packages/mcp/src/index.ts` registers 4 tools via `server.registerTool(name, meta, handler)`
- Tool pattern: each tool in `packages/mcp/src/tools/*.ts` exports `registerXxx(server: McpServer)` function
- All tools are parameterless (no input schemas) — they fetch from MC API using `fetchApi<T>(path)` from `api-client.ts`
- API base URL: `http://100.123.8.125:3000` (Mac Mini Tailscale IP), overridable via `MC_API_URL` env
- Response format: `textContent(string)` or `errorContent(error)` from `format.ts`

### Existing Session Infrastructure (v1.2)
- Schema: `sessions` table with id, source, model, tier, projectSlug, cwd, status, filesJson, taskDescription, stopReason, startedAt, lastHeartbeatAt, endedAt
- Query module: `packages/api/src/db/queries/sessions.ts` — `listSessions()` already supports filtering by status, projectSlug, source with pagination and relationship metadata (activeCount, recentCompletedCount)
- Session service: `packages/api/src/services/session-service.ts` — project resolution from cwd, heartbeat debouncing, file buffering, session reaper (15-minute timeout)
- Routes: `packages/api/src/routes/sessions.ts` — hook endpoints (start/heartbeat/stop) + GET /sessions list endpoint

### Existing Conflict Detection (v1.2)
- `packages/api/src/services/conflict-detector.ts` — `detectConflicts(db, triggeringSessionId, projectSlug)` returns `SessionConflict[]`
- Conflict detection: finds active sessions on same project, parses `filesJson`, normalizes paths, computes file overlap
- Findings stored via `upsertHealthFinding()` with `checkType: "session_file_conflict"`, severity: "warning"
- Conflicts resolved when sessions end via `resolveSessionConflicts(sqlite, sessionId)`

### Health Finding Infrastructure
- Schema: `project_health` table with id, projectSlug, checkType, severity, detail, metadata (JSON), detectedAt, resolvedAt
- `healthCheckTypeEnum` in shared schemas: includes `"session_file_conflict"` already — needs `"convergence"` added
- `upsertHealthFinding()`: SELECT-then-UPDATE/INSERT in transaction, keyed on (projectSlug, checkType, resolvedAt IS NULL)
- `resolveFindings()`: resolves findings whose checkType is NOT in active list
- `getActiveFindings()`: returns all unresolved findings, optionally filtered by project

### Post-Scan Phase
- `packages/api/src/services/project-scanner.ts` — `runPostScanHealthPhase()` runs after `scanAllProjects()` completes
- 4 stages: per-repo health checks, dirty severity escalation, multi-copy divergence, event emission
- Convergence detection should be a new Stage 5 in this function

### Dashboard Project Row
- `packages/web/src/components/departure-board/project-row.tsx` — shows HealthDot, session count badge, capture count badge
- `HealthDot` component: 8px dot colored by riskLevel, split-dot variant for diverged copies
- Session count already displayed as blue pill badge with terminal icon
- Convergence badge would be a new indicator alongside these existing indicators

## Convergence Detection Algorithm

### The 4-Condition Algorithm (from CONTEXT.md)
All 4 must be true simultaneously:
1. **Same project**: 2+ sessions with matching `projectSlug`
2. **File overlap**: sessions share at least 1 file in `filesJson` (using path normalization from `normalizePath()`)
3. **At least one committed**: at least 1 session has `status === "completed"` (meaning it produced commits)
4. **Temporal window**: both sessions active within 30-minute window — use `startedAt`/`endedAt`/`lastHeartbeatAt` timestamps

### Algorithm Implementation

```
For each project with 2+ sessions (active OR recently completed):
  1. Get all sessions where:
     - status IN ('active', 'completed')
     - AND (endedAt IS NULL OR endedAt > NOW() - 30min)
     - AND projectSlug = current project
  2. Check if at least one session has status = 'completed'
  3. For each pair of sessions:
     - Parse filesJson arrays
     - Normalize paths
     - Check for intersection
  4. If file overlap found AND at least one completed:
     → convergence detected
```

### Temporal Window Logic
- Active sessions: `lastHeartbeatAt` within 30 minutes, or `status === 'active'`
- Completed sessions: `endedAt` within 30 minutes
- Window is sliding — checked at each post-scan cycle (5 minutes)
- Sessions older than 30 minutes auto-excluded (stale data drops out naturally)

### False Positive Control (SESS-04)
- Same project alone: NOT sufficient (multiple sessions on one project is normal)
- File overlap alone: NOT sufficient (could be sequential work, not parallel)
- Temporal proximity alone: NOT sufficient (need evidence of actual overlap)
- All 4 conditions together: strong signal that two sessions are editing similar code concurrently or near-concurrently and should merge

### Storage Strategy
- Store as `healthFinding` with `checkType: "convergence"`, severity: "info" (passive, not alarming)
- Metadata: `{ sessionA: string, sessionB: string, overlappingFiles: string[], window: "30min" }`
- Auto-resolves: when one session ends + 30-minute window passes, finding resolves
- Resolution: convergence findings resolved in the same post-scan cycle when conditions no longer hold

### Integration with Post-Scan Phase
- Add as Stage 5 in `runPostScanHealthPhase()` — after all health checks and divergence detection
- Query sessions table directly (not from scan data — sessions are separate from git state)
- Emit `convergence:detected` and `convergence:resolved` SSE events

## MCP Tool Design

### session_status Tool
- Endpoint: `GET /api/sessions?status=active` (existing endpoint, already works)
- Optional filter: `?projectSlug=<slug>` (already supported in listSessions)
- Response format: text table with session ID (truncated), project, start time, file count, agent type (source), model tier
- Matches existing tool pattern: no input params, fetch from API, format as text

### session_conflicts Tool
- Needs a new API endpoint: `GET /api/sessions/conflicts` (or reuse health findings with filter)
- Option A: New endpoint that runs `detectConflicts()` for all active sessions on-demand
- Option B: Query health findings where `checkType = 'session_file_conflict'` (already persisted by heartbeat handler)
- **Recommended: Option B** — data already exists in project_health table, just needs a filtered query
- Response format: text table with project, session A, session B, conflicting file count, file paths

### New API Endpoints Needed
1. `GET /api/sessions/conflicts` — returns active conflict findings grouped by project (thin wrapper around `getActiveFindings` with `checkType` filter)
2. `GET /api/convergence` — returns active convergence findings (optional, could be part of health-checks filter)

## Dashboard Convergence Badge

### Design
- Small badge similar to the session count pill (blue rounded pill with icon + count)
- Color: amber/orange to differentiate from blue session count and green health dot
- Icon: merge/branch icon (git merge symbol)
- Position: between health dot and session count in the project row
- Tooltip: "2 sessions may be ready to converge"

### Data Flow
- Dashboard already polls health findings via `/api/health-checks`
- Convergence findings will appear in the same feed with `checkType: "convergence"`
- `use-project-health.ts` hook already provides findings per project — just filter for convergence type
- No new polling needed — piggybacks on existing health data fetch

## Validation Architecture

### Test Strategy
1. **Unit tests for convergence detector**: test all 4 conditions, edge cases (no overlap, no committed session, outside temporal window)
2. **Unit tests for MCP tools**: mock API responses, verify formatted output
3. **Integration tests for API endpoints**: test conflict and convergence query endpoints
4. **Component tests for convergence badge**: render with/without convergence data

### Key Edge Cases
- Sessions with empty filesJson (no files tracked yet)
- Sessions with null projectSlug (unresolved project)
- Exactly at the 30-minute boundary
- More than 2 sessions on same project (multiple pairwise checks)
- Mixed active + completed sessions
- Session that was abandoned (not completed — should not count as "committed")

### False Positive Rate Target
- Goal: <2 false alerts per day
- Mitigated by: 4-condition requirement, 30-minute window, "completed" status check (not just "active")
- Additional safety: convergence is "info" severity — passive badge, never an alarm

## RESEARCH COMPLETE
