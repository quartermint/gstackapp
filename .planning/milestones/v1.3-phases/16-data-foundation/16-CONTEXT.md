# Phase 16: Data Foundation - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

New database tables (discoveries, stars), Drizzle migrations, Zod schemas in shared package, and mc.config.json schema extension for discovery paths and GitHub orgs. Pure data layer — no services, no routes, no UI.

</domain>

<decisions>
## Implementation Decisions

### Schema design
- `discoveries` table: path, host, status (found/tracked/dismissed), remoteUrl, lastCommitAt, discoveredAt, unique(path, host). Follows existing table patterns (integer timestamps, text enums).
- `stars` table: githubId (unique), fullName, description, language, topics (JSON text), intent (reference/tool/try/inspiration), aiConfidence (real), starredAt, lastSyncedAt. Mirrors captures table pattern for AI enrichment fields.
- Both tables use text primary keys (nanoid for discoveries, githubId for stars).

### Config extension
- Add `discoveryPaths` array to mc.config.json (default `["~"]`) — root directories for filesystem discovery
- Add `githubOrgs` array (default `["quartermint", "sternryan"]`) — orgs to list repos from
- Add `starSyncIntervalHours` (default 6) and `discoveryScanIntervalMinutes` (default 60)
- Zod schema validates all new fields with .default() for backward compatibility with existing configs

### Claude's Discretion
- Exact Drizzle migration implementation
- Index selection for new tables
- Zod schema field naming conventions (follow existing shared package patterns)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database patterns
- `packages/api/src/db/schema.ts` — Existing table definitions, column type conventions, index patterns
- `packages/shared/src/` — Existing Zod schemas for API contracts

### Config
- `mc.config.json` — Current config shape to extend
- `packages/api/src/lib/config.ts` — Config loader and Zod validation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `schema.ts`: Established patterns for sqliteTable definitions, integer timestamps, text enums, JSON text columns
- `packages/shared`: Zod schema definitions for captures, projects, sessions already exist

### Established Patterns
- Integer timestamps with `{ mode: "timestamp" }` for all date columns
- Text primary keys (slugs for projects, nanoid for captures)
- `.default()` on config schema fields for backward compatibility

### Integration Points
- Drizzle migration system (existing `drizzle/` directory)
- Config loader in `packages/api/src/lib/config.ts`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow existing schema patterns exactly.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-data-foundation*
*Context gathered: 2026-03-16*
