# Phase 14 Context: Intelligence Layer

**Created:** 2026-03-16
**Phase Goal:** MC detects when parallel sessions are touching the same files and alerts the user in real-time, preventing merge conflicts before they happen

## Decisions

### Conflict Detection
- File-level only (not function-level — too complex, not worth it)
- Cross-reference `filesJson` arrays across active sessions on same project
- Detection runs on every heartbeat that updates files_touched
- All file paths normalized to absolute before comparison (resolve relative against session cwd)

### Conflict Alert Placement
- **Conflict alerts surface as risk feed cards with a session type badge**
- Reuse existing risk card component with warm severity palette
- Add a session/terminal icon badge to distinguish from git health cards
- No separate section — risk feed is already "things needing your attention"
- No rename of the risk feed needed — it has no visible header label

### SSE Events
- `session:conflict` event emitted when file overlap detected
- Contains: both session IDs, project slug, conflicting file paths
- Client-side: TanStack Query invalidation for risk feed on conflict event

### Session Grouping
- Sessions on same project are queryable as related
- API: `GET /api/sessions?project=mission-control` returns all sessions for that project
- Response includes relationship metadata: "2 active sessions, 1 completed in last hour"

## Code Context

### Existing Patterns
- **Risk feed:** `components/risk-feed/` — severity-grouped cards
- **Event bus:** `MCEventType` union — extend with `session:conflict`
- **SSE:** `routes/events.ts` — streams all MCEvent types
- **use-sse.ts:** add `onSessionConflict` handler

### New Files
- `packages/api/src/services/conflict-detector.ts` — file overlap detection logic
- Possibly extend `session-service.ts` with conflict checking on heartbeat

### Integration Points
- Heartbeat endpoint triggers conflict check after updating files_touched
- Conflict detection emits `session:conflict` event on event bus
- Risk feed component extended to handle session conflict card type

## Deferred Ideas
- Convergence detection (parallel sessions both committed, ready to merge) — v1.3
- Function-level conflict detection — not worth the complexity
