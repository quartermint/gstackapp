# Phase 25: Dependency Intelligence - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

MC detects dependency drift (dependency project changed, dependent hasn't consumed), surfaces impact as health findings with severity escalation, and shows dependency badges on project cards. Config schema and health check types are Phase 23. Relationship graph visualization is Phase 31.

</domain>

<decisions>
## Implementation Decisions

### Dependency badges
- **D-01:** Small pill badges on project cards showing dependency project names — consistent with existing HostBadge pattern
- **D-02:** Collapse to "+N more" when a project has >3 dependencies
- **D-03:** Pills use a neutral color (not health-coded) — dependency is a fact, not a status

### Drift severity escalation
- **D-04:** Hardcoded thresholds: info at detection → warning after 24h → critical after 7d
- **D-05:** No config-driven thresholds in v1.4 — can add later if needed

### Cross-machine reconciliation
- **D-06:** Piggyback on existing scan cycle — after scanning both machines, compare head commits of dependency pairs
- **D-07:** If dependency project advanced and dependent project didn't pull, emit `dependency_impact` health finding
- **D-08:** No separate reconciliation timer or additional SSH calls — uses existing scan data

### Commit impact alerts
- **D-09:** When a dependency project pushes new commits, fire health finding on dependent project — detected during post-scan health phase
- **D-10:** Impact findings include metadata: which dependency changed, how many commits ahead, how long since divergence

### Claude's Discretion
- Exact pill badge styling and colors
- Drift detection algorithm details (commit comparison logic)
- Health finding detail message format
- Severity escalation timer implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dependency intelligence
- `.planning/REQUIREMENTS.md` — INTEL-02 through INTEL-06 define dependency detection and display requirements
- `.planning/ROADMAP.md` §Phase 25 — Success criteria (5 items)

### Existing patterns
- `packages/api/src/services/project-scanner.ts` — Post-scan health phase, copy tracking, divergence detection
- `packages/api/src/services/git-health.ts` — Health check pure functions, severity levels
- `packages/web/src/components/ui/host-badge.tsx` — Badge component pattern to reuse for dependency pills
- `packages/api/src/db/schema.ts` — projectHealth table, projectCopies table

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HostBadge` component: Pill badge pattern — reuse for dependency badges
- `git-health.ts` health checks: Pure function pattern — add dependency drift check
- `projectCopies` table: Already tracks head commits per copy — compare across dependency pairs
- `SEVERITY_COLORS` map: Consistent color tokens for health status
- `escalateDirtySeverity()` pattern: Existing severity escalation logic to follow

### Established Patterns
- Post-scan health phase runs after all repos scanned — dependency checks slot in here
- Health findings with metadata JSON — drift findings store dependency context
- `getActiveFindings()` and `getProjectRiskLevel()` — automatically pick up new check types
- Risk feed component already renders any health finding type

### Integration Points
- Config `dependsOn` field (Phase 23) provides dependency graph
- Post-scan health phase — new dependency drift check registered here
- Project cards — new DependencyBadges component
- Risk feed — automatically surfaces dependency_impact findings
- SSE `health:changed` event — triggers dashboard refresh on new findings

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

*Phase: 25-dependency-intelligence*
*Context gathered: 2026-03-21*
