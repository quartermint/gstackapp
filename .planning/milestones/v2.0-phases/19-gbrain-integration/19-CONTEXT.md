# Phase 19: gbrain Integration - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Pipelines are knowledge-aware — they leverage 10,609 pages of compiled project/people/decision context to produce grounded, context-loaded outputs. Integrates gbrain MCP tools into the harness, implements async prefetch with caching, and adds graceful degradation when gbrain is unavailable.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User confirmed this phase's key decisions are already locked (async prefetch, graceful degradation, MCP tool interface). Claude has full discretion on implementation:

- **D-01:** How gbrain MCP tools (gbrain_search, gbrain_entity, gbrain_related) are called from the harness — tool injection pattern, request format
- **D-02:** Async prefetch timing and caching strategy — cache per pipeline run in Postgres, invalidation approach, handling gbrain data updates mid-pipeline
- **D-03:** Knowledge surfacing in clarification questions (GB-03) — how gbrain context enhances questions, whether attribution is visible to operators ("I know CocoBanana uses React...") or transparent
- **D-04:** Graceful degradation UX — "Running without knowledge context" indicator placement and styling
- **D-05:** Cache schema design in Postgres for gbrain results

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §gbrain Integration — GB-01 through GB-04

### Architecture Decisions
- `.planning/PROJECT.md` §Key Decisions — "Async gbrain prefetch (not inline blocking)" decision and rationale
- `~/.gstack/projects/quartermint-gstackapp/ryanstern-main-design-20260411-100303.md` — v2.0 design doc, gbrain integration section

### Existing Harness
- `packages/harness/src/` — Provider registry, model router where gbrain tools will be injected
- `packages/harness/src/skills/` — Skill system for tool registration

### gbrain MCP Server
- gbrain MCP server runs on Mac Mini (external dependency)
- MCP tools: `gbrain_search`, `gbrain_entity`, `gbrain_related`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/harness/src/skills/` — SkillManifest, SkillRegistry, runSkill for tool registration
- `packages/harness/src/adapters/` — ToolAdapter interface for cross-provider tool compatibility
- `packages/api/src/db/schema.ts` — Drizzle schema (add cache table here)

### Established Patterns
- Tool injection via SkillManifest + ToolAdapter pattern
- Drizzle ORM for Postgres schema and queries
- Provider-agnostic tool types (no SDK-specific types leak)

### Integration Points
- gbrain tools injected into agent sessions during pipeline execution
- Prefetch results cached in Postgres, keyed by pipeline run ID
- Clarification stage (Phase 18) consumes gbrain context for knowledge-loaded questions
- Graceful degradation indicator surfaces in operator UI (Phase 18 chat thread)

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

*Phase: 19-gbrain-integration*
*Context gathered: 2026-04-11*
