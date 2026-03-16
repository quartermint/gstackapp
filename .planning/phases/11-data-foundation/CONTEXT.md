# Phase 11 Context: Data Foundation

**Created:** 2026-03-16
**Phase Goal:** The persistence layer, type system, and infrastructure are ready so session data, budget tracking, and model status can be stored and queried

## Decisions

### Schema Design
- `sessions` table follows existing Drizzle patterns: text IDs, integer timestamps with `mode: "timestamp"`
- `budget_entries` not needed as separate table — budget is derived from session data (count by tier, group by week)
- `filesJson` stored as TEXT (JSON array of absolute file paths) on the sessions table — no separate join table
- Status enum: `active`, `completed`, `abandoned` — matches existing pattern from captures table

### Model Tier Derivation
- Parse from model string prefix: `startsWith('claude-opus')` → opus, `startsWith('claude-sonnet')` → sonnet, everything else → local
- Config-driven tier mapping in `mc.config.json` with regex patterns for future-proofing
- Default to "unknown" tier for unrecognized model strings, log a warning

### INFR-01: Infrastructure Scripts
- No `infra/` directory currently exists in mission-control repo
- This requirement is about MC's own deployment scripts for Mac Mini (launchd plist, install script)
- Follow mac-mini-ops v1.0 conventions: `/opt/services/mission-control/`, `svc` CLI compatible
- If no deployment scripts exist to update, create minimal ones following the pattern from mainline-api
- Claude's discretion on implementation — user did not need to weigh in

### Hook Strategy (Claude's Discretion)
- Use **HTTP hooks** (not command hooks) for session reporting — cleaner, no shell script maintenance
- HTTP hooks POST JSON to MC API URL, receive JSON response — perfect fit
- Hook events: `SessionStart` (create session), `Stop` (mark completed), `PostToolUse` for Write/Edit only (heartbeat with files_touched)
- Must coexist with 6+ existing command hooks in `~/.claude/settings.json`
- Fire-and-forget semantics: MC API responds immediately, processing is async

### Zod Schemas
- New file: `packages/shared/src/schemas/session.ts` — follows existing pattern (api.ts, capture.ts, health.ts, port.ts, project.ts)
- Exports: `CreateSessionSchema`, `HeartbeatSchema`, `SessionResponseSchema`, `ModelTierEnum`
- Tier enum values: `opus`, `sonnet`, `local`, `unknown`

## Code Context

### Existing Patterns to Follow
- **Schema:** `packages/api/src/db/schema.ts` — Drizzle table definitions with indexes
- **Drizzle migrations:** `packages/api/drizzle/` — numbered SQL migrations
- **Zod schemas:** `packages/shared/src/schemas/` — one file per domain
- **Event types:** `MCEventType` union in `services/event-bus.ts` — extend with session events
- **Config loading:** `mc.config.json` with Zod validation

### Files to Modify
- `packages/api/src/db/schema.ts` — add sessions table
- `packages/shared/src/schemas/session.ts` — new file
- `packages/api/src/services/event-bus.ts` — extend MCEventType union
- `mc.config.json` — add session/budget config section (optional, with backward-compatible defaults)

## Deferred Ideas
None.
