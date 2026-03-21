# Phase 26: Convention Enforcement - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a convention scanner that reads CLAUDE.md content from the knowledge cache (Phase 24), matches config-driven anti-pattern rules, and surfaces violations as `convention_violation` health findings. Must achieve zero false positives across all existing projects.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase with technical rule engine.
- Rule format in mc.config.json (pattern, description, negativeContext fields)
- Per-project convention overrides mechanism
- Scanner integration with existing health finding pipeline
- Launch rules selection (5 or fewer rules that produce zero false positives)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/api/src/services/knowledge-aggregator.ts` — reads CLAUDE.md content, provides `getAllKnowledge()` for cached content
- `packages/api/src/db/queries/knowledge.ts` — `getAllKnowledge()` returns cached CLAUDE.md content with content hash
- `packages/shared/src/schemas/health.ts` — `convention_violation` already in `healthCheckTypeEnum` (Phase 23)
- `packages/api/src/services/git-health.ts` — pattern for pure health check functions
- `packages/api/src/services/project-scanner.ts` — `runPostScanHealthPhase` pipeline for integrating new check types

### Established Patterns
- Health findings via `upsertHealthFinding` with checkType, severity, detail, metadata
- Config loaded via `loadConfig()` in `packages/api/src/lib/config.ts`
- Post-scan health phase has staged pipeline (Stage 1-4)

### Integration Points
- Convention scanner hooks into knowledge aggregation cycle (not project scan cycle)
- Rules defined in mc.config.json alongside project entries
- `convention_violation` findings appear in existing risk feed automatically

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
