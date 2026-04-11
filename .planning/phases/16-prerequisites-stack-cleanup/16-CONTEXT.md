# Phase 16: Prerequisites & Stack Cleanup - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Clear the foundation gate so all v2.0 work builds on a stable, tested, accurately documented codebase. Resolve Phase 15 eng review debt (IDEA-05/06/07/08), pass human UAT (6 items), update docs to reflect SQLite-to-Neon Postgres migration.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User confirmed this phase is mechanical — Claude has full discretion on approach for all three work areas:

- **D-01:** Eng review rework (IDEA-05/06/07/08) — scope and depth of fixes for prompt rework, context truncation, SSE errors, DB persistence
- **D-02:** UAT testing — approach for exercising the 6 human UAT items (manual browser, automated QA, or hybrid)
- **D-03:** Doc cleanup — scope of documentation updates to reflect SQLite → Neon Postgres migration and v2.0 product reframe

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 15 Eng Review Items
- `.planning/milestones/v1.2-REQUIREMENTS.md` — IDEA-05/06/07/08 definitions and current status

### Stack Migration
- Commit `c1fc394` — SQLite to Neon Postgres migration (reference for what changed)
- `CLAUDE.md` — Tech stack section needs update (still references SQLite in places)
- `.planning/PROJECT.md` — Constraints section already updated

### Existing Ideation Pipeline
- `packages/api/src/ideation/` — orchestrator, prompts, skill-bridge, templates
- `packages/web/src/components/ideation/` — frontend components

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Ideation pipeline: `packages/api/src/ideation/orchestrator.ts` — the code being fixed
- SSE streaming: `packages/api/src/routes/sse.ts` — existing pattern for SSE events
- DB schema: `packages/api/src/db/schema.ts` — Drizzle schema (already migrated to Postgres)

### Established Patterns
- Drizzle ORM with Neon Postgres (migrated from SQLite)
- PGlite for test infrastructure (migrated in `f26444e`)
- Vitest test suite (407 tests across api + harness)

### Integration Points
- Ideation pipeline connects to harness for model routing
- SSE events flow from api routes to React frontend via EventSource

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-prerequisites-stack-cleanup*
*Context gathered: 2026-04-11*
