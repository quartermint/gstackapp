# Phase 23: Config Foundation - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend mc.config.json schema with dependency declarations, add new health check types to the findings system, and add idempotency key support to the captures endpoint. Pure infrastructure — no user-facing behavior changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/schemas/health.ts` — `healthCheckTypeEnum` z.enum needs extending with `dependency_impact`, `convention_violation`, `stale_knowledge`
- `packages/shared/src/schemas/capture.ts` — `createCaptureSchema` already has `clientId` field; idempotency key adds server-side dedup via header
- `mc.config.json` — flat project entries with `name`, `slug`, `path`, `host`, `tagline` fields; needs `dependsOn` array
- `packages/shared/src/schemas/project.ts` — project schema likely needs `dependsOn` addition

### Established Patterns
- Zod schemas in `packages/shared/src/schemas/` define all API boundaries
- Drizzle ORM + better-sqlite3 for database (migrations in packages/api)
- Health findings system: `healthFindingSchema` with `checkType` enum, `severity`, `detail`, `metadata`
- Config loaded and validated at startup

### Integration Points
- `packages/api/src/routes/captures.ts` — captures POST endpoint for idempotency header
- `packages/api/src/services/project-scanner.ts` — reads mc.config.json, needs to handle `dependsOn`
- Health findings table schema (Drizzle) — needs new check types in DB enum/constraint

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
