# Phase 6: Data Foundation - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Two new SQLite tables (`project_health`, `project_copies`), Drizzle schema + migration, config schema extension for multi-host entries, shared Zod schemas for health types, and DB query functions with correct upsert semantics. No scanner changes, no API routes, no frontend — pure data layer.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User deferred all internal consistency decisions. Resolve these during implementation:

- **Timestamp format:** Existing tables use `integer` with Drizzle `mode: "timestamp"` (Unix). Spec says `text` ISO. Claude should pick whichever integrates more cleanly with existing query patterns — likely `text` for `detectedAt`/`resolvedAt`/`lastCheckedAt` since these need ISO display in API responses and age calculations, but follow the spec.
- **ID strategy:** Existing tables use `text` UUID PKs. Spec says `integer PK auto-increment`. Claude should follow the spec (auto-increment) since health findings are internal records, not externally referenced — simpler than UUIDs.
- **Config multi-host format:** Spec defines a `z.union([projectEntrySchema, multiCopyEntrySchema])` approach. Follow the spec — it preserves backward compatibility with existing single-host entries.
- **Query file organization:** Follow existing pattern — one file per domain (`health.ts`, `copies.ts` in `db/queries/`).

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The design spec (docs/superpowers/specs/2026-03-14-git-health-intelligence-design.md) has detailed table schemas with exact columns and types.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/api/src/db/schema.ts`: All table definitions live here. Add `projectHealth` and `projectCopies` to this file.
- `packages/api/src/db/queries/projects.ts`: `upsertProject()` demonstrates the exact `onConflictDoUpdate` pattern needed for health findings — preserves specific fields on conflict.
- `packages/shared/src/schemas/project.ts`: Zod schemas for project types. Health schemas follow the same export pattern.
- `packages/api/src/lib/config.ts`: `projectEntrySchema` + `mcConfigSchema` — extend with `multiCopyEntrySchema` via `z.union()`.

### Established Patterns
- **Drizzle ORM**: `sqliteTable()` with explicit index definitions. All tables follow same structure.
- **Upsert**: `db.insert().values().onConflictDoUpdate({ target, set })` — critical for health findings where `detectedAt` must be excluded from `set` clause.
- **Migrations**: Numbered SQL files in `packages/api/drizzle/` (currently 0000-0004). Next is `0005_git_health.sql`.
- **Schema exports**: All table definitions in single `schema.ts`, imported by `db/index.ts` as `* as schema`.
- **Query functions**: Pure functions taking `(db: DrizzleDb, ...)`, one file per domain.
- **Zod in shared**: Schemas in `packages/shared/src/schemas/`, types in `packages/shared/src/types/`, re-exported from `index.ts`.

### Integration Points
- `packages/api/src/db/index.ts`: Singleton DB with auto-migration on startup. New tables auto-created.
- `packages/api/drizzle/meta/_journal.json`: Migration journal — new migration entry needed.
- `packages/shared/src/index.ts`: Re-exports all schemas — add health/copy schema exports here.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-data-foundation*
*Context gathered: 2026-03-14*
