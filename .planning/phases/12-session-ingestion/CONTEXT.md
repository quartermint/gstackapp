# Phase 12 Context: Session Ingestion

**Created:** 2026-03-16
**Phase Goal:** Claude Code sessions report their lifecycle to MC and session data flows into the database with correct project association, while stale sessions are automatically reaped

## Decisions

### Hook Implementation
- HTTP hooks POST to MC API — no shell scripts needed
- SessionStart hook: POST /api/sessions with session_id, model, cwd, tool metadata
- PostToolUse hook: POST /api/sessions/:id/heartbeat — matcher narrowed to `Write|Edit` only
  - Server-side debounce: accept but deduplicate within 10-second window per session
  - files_touched accumulated as cumulative set (not per-heartbeat)
- Stop hook: POST /api/sessions/:id/stop — marks session completed
- All hook responses return immediately (< 50ms) — processing is async via queueMicrotask

### Project Resolution
- Match session cwd against tracked projects in mc.config.json (not projects DB table)
- Resolution chain: exact path match → prefix match → git remote URL fallback
- For worktrees: `cwd` like `/path/project-wt-1234/` → resolve to `/path/project/` primary
- For subagents: inherit projectSlug from parent session if available
- Unresolvable sessions get `projectSlug: null` — still tracked, just unlinked

### Session Reaper
- Background timer every 2-5 minutes
- Sessions with no heartbeat for 15+ minutes → mark as `abandoned`
- Same `setInterval` pattern as existing project scanner (5-min cycle)

### Aider Passive Detection
- During project scan cycle, check `git log --author="(aider)" --since="30 minutes ago"`
- Create completed session records with `tool: aider`, `status: completed`
- No wrapper script — zero UX friction

### Session ID Strategy
- Use Claude Code's `session_id` from hook data as the external ID
- MC generates its own internal UUID (text primary key, matching existing pattern)
- Map external → internal via unique index on external session_id

## Code Context

### Existing Patterns to Follow
- **Route files:** `packages/api/src/routes/*.ts` — Hono route definitions
- **Service files:** `packages/api/src/services/*.ts` — business logic
- **Query files:** `packages/api/src/db/queries/*.ts` — Drizzle query helpers
- **Project scanner:** `services/project-scanner.ts` — background timer pattern, SSH to Mac Mini

### New Files
- `packages/api/src/routes/sessions.ts` — session lifecycle endpoints
- `packages/api/src/services/session-service.ts` — session logic, reaper, project resolution
- `packages/api/src/db/queries/sessions.ts` — session DB queries

## Deferred Ideas
- SubagentStart/SubagentStop hooks — fold into parent session for v1.2, revisit if needed
