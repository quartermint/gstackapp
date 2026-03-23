# Phase 25: Dependency Intelligence - Research

**Researched:** 2026-03-21
**Domain:** Cross-project dependency drift detection, health finding escalation, dashboard badges
**Confidence:** HIGH

## Summary

Phase 25 builds dependency drift detection and visualization on top of infrastructure already established in Phases 23-24. The `dependsOn` field exists in mc.config.json schema (Phase 23), the `dependency_impact` check type is already registered in the health enum (Phase 23), and the post-scan health phase in `project-scanner.ts` provides the hook point for new checks. The `projectCopies` table already stores `headCommit` per copy, which is the foundation for comparing dependency pairs.

The implementation is primarily a wiring exercise: (1) add a new dependency drift check function in `git-health.ts` following the exact pattern of existing checks, (2) integrate it into `runPostScanHealthPhase` as a new stage after existing Stage 3 (multi-copy divergence), (3) add a `DependencyBadges` component on project cards following the `HostBadge` pill pattern, and (4) add severity escalation for dependency drift findings following the `escalateDirtySeverity` pattern. No new database tables or migrations are needed -- everything uses the existing `projectHealth` table with `checkType = 'dependency_impact'`.

**Primary recommendation:** Add a Stage 3.5 to `runPostScanHealthPhase` that iterates the config dependency graph, compares head commits from `collectedHealthData`, and upserts `dependency_impact` findings with age-based severity escalation. Dashboard changes are a new `DependencyBadges` component and a `dependsOn` field piped through the project list API response.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Small pill badges on project cards showing dependency project names -- consistent with existing HostBadge pattern
- **D-02:** Collapse to "+N more" when a project has >3 dependencies
- **D-03:** Pills use a neutral color (not health-coded) -- dependency is a fact, not a status
- **D-04:** Hardcoded thresholds: info at detection -> warning after 24h -> critical after 7d
- **D-05:** No config-driven thresholds in v1.4 -- can add later if needed
- **D-06:** Piggyback on existing scan cycle -- after scanning both machines, compare head commits of dependency pairs
- **D-07:** If dependency project advanced and dependent project didn't pull, emit `dependency_impact` health finding
- **D-08:** No separate reconciliation timer or additional SSH calls -- uses existing scan data
- **D-09:** When a dependency project pushes new commits, fire health finding on dependent project -- detected during post-scan health phase
- **D-10:** Impact findings include metadata: which dependency changed, how many commits ahead, how long since divergence

### Claude's Discretion
- Exact pill badge styling and colors
- Drift detection algorithm details (commit comparison logic)
- Health finding detail message format
- Severity escalation timer implementation

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTEL-02 | Dashboard displays dependency badges on project cards showing which projects each depends on | `HostBadge` component pattern exists, `dependsOn` in config provides data, needs piping through API response |
| INTEL-03 | Health engine detects when a dependency project has commits the dependent hasn't pulled (dependency drift) | `headCommit` in `projectCopies`/`collectedHealthData` provides comparison points, `dependency_impact` check type already registered |
| INTEL-04 | Dependency drift findings surface in risk feed with severity escalation (>24h warning, >7d critical) | `escalateDirtySeverity` pattern provides exact template, risk feed automatically renders any finding type |
| INTEL-05 | Cross-machine reconciliation runs continuously, detecting unpushed commits, diverged copies, and stale services | Existing scan cycle already scans both machines and stores `headCommit` per copy -- dependency check piggybacks on this data |
| INTEL-06 | Commit impact alerts fire when a dependency project pushes new commits, surfaced as health findings on dependent project | Post-scan health phase is the hook point, comparison of current vs previous head commits detects new pushes |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | 4.x (existing) | API routes | Already in stack, no new dependency |
| Drizzle ORM | existing | DB queries | Already in stack for `projectHealth` table |
| better-sqlite3 | existing | Direct SQL for upsert transactions | Already used in `health.ts` queries |
| Vitest | existing | Testing | Already configured for both packages |

### Supporting
No new dependencies required. This phase is entirely built on existing infrastructure.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hardcoded 24h/7d thresholds | Config-driven thresholds | Over-engineering for v1.4 (D-05 locks this) |
| Head commit comparison | `git rev-list` count between commits | Would require additional git commands per scan -- violates D-08 (no additional SSH calls) |
| New DB table for dependencies | Existing `projectHealth` table | No new schema needed -- `dependency_impact` check type with metadata carries all info |

## Architecture Patterns

### Integration Points Map
```
mc.config.json (dependsOn field)
    |
    v
loadConfig() --> MCConfig.projects[].dependsOn
    |
    v
scanAllProjects(config, db, sqlite)
    |
    v
runPostScanHealthPhase(healthDataMap, db, sqlite)
    |
    v  [NEW Stage 3.5: Dependency Drift Detection]
    |
    ├── Build dependency graph from config
    ├── For each dependent -> dependency pair:
    |   ├── Look up headCommit for dependency (from healthDataMap or projectCopies)
    |   ├── Look up headCommit for dependent (same sources)
    |   ├── Compare: if dependency advanced && dependent didn't pull
    |   └── upsertHealthFinding(dependency_impact)
    └── Severity escalation on existing dependency_impact findings

    API Layer:
    GET /api/projects --> adds dependsOn[] to each project response

    Dashboard:
    ProjectRow --> DependencyBadges component (pill badges)
```

### Pattern 1: Dependency Drift Check (new pure function in git-health.ts)
**What:** A pure function that takes dependency graph + health data map and returns `HealthFindingInput[]`
**When to use:** Called during post-scan health phase
**Example:**
```typescript
// Follow existing check* function pattern from git-health.ts
export interface DependencyPair {
  dependentSlug: string;
  dependencySlug: string;
}

export function checkDependencyDrift(
  pairs: DependencyPair[],
  headCommits: Map<string, string | null>,  // slug -> headCommit
  previousHeadCommits: Map<string, string | null>  // slug -> previous headCommit
): HealthFindingInput[] {
  const findings: HealthFindingInput[] = [];

  for (const { dependentSlug, dependencySlug } of pairs) {
    const depHead = headCommits.get(dependencySlug);
    const prevDepHead = previousHeadCommits.get(dependencySlug);
    const dependentHead = headCommits.get(dependentSlug);

    // Skip if no data for either project
    if (!depHead || !dependentHead) continue;

    // Dependency changed if current != previous
    if (prevDepHead && depHead !== prevDepHead) {
      findings.push({
        projectSlug: dependentSlug,
        checkType: "dependency_impact",
        severity: "info",  // Starts as info, escalated later
        detail: `Dependency "${dependencySlug}" has new commits (${depHead.slice(0, 7)})`,
        metadata: {
          dependencySlug,
          dependencyHead: depHead,
          dependentHead,
          type: "dependency_drift",
        },
      });
    }
  }

  return findings;
}
```

### Pattern 2: Severity Escalation (follows escalateDirtySeverity exactly)
**What:** Age-based severity escalation for `dependency_impact` findings
**When to use:** During post-scan health phase, after initial drift detection
**Example:**
```typescript
// Follow escalateDirtySeverity pattern from git-health.ts
export function escalateDependencyDriftSeverity(
  detectedAt: string,
  now?: Date
): HealthSeverity {
  const referenceTime = now ?? new Date();
  const detected = new Date(detectedAt);
  if (isNaN(detected.getTime())) return "info";

  const MS_PER_HOUR = 60 * 60 * 1000;
  const ageHours = (referenceTime.getTime() - detected.getTime()) / MS_PER_HOUR;

  if (ageHours >= 168) return "critical";  // 7 days = 168 hours
  if (ageHours >= 24) return "warning";
  return "info";
}
```

### Pattern 3: API Response Extension (add dependsOn to project list)
**What:** Pipe `dependsOn` from config into project API response
**When to use:** `GET /api/projects` route
**Example:**
```typescript
// In createProjectRoutes, build a lookup from config
const dependsOnMap = new Map<string, string[]>();
const cfg = getConfig?.();
if (cfg) {
  for (const p of cfg.projects) {
    dependsOnMap.set(p.slug, p.dependsOn ?? []);
  }
}

// Add to each project in response
const projectsWithScanData = dbProjects.map((project) => ({
  ...project,
  dependsOn: dependsOnMap.get(project.slug) ?? [],
  // ...existing fields
}));
```

### Pattern 4: DependencyBadges Component (follows HostBadge)
**What:** Pill badges showing dependency names, collapsing to "+N more" after 3
**When to use:** On project cards in the departure board
**Example:**
```typescript
// Follow HostBadge pattern exactly
interface DependencyBadgesProps {
  dependsOn: string[];
}

const MAX_VISIBLE = 3;

export function DependencyBadges({ dependsOn }: DependencyBadgesProps) {
  if (dependsOn.length === 0) return null;

  const visible = dependsOn.slice(0, MAX_VISIBLE);
  const remaining = dependsOn.length - MAX_VISIBLE;

  return (
    <span className="inline-flex items-center gap-1">
      {visible.map((dep) => (
        <span
          key={dep}
          className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-warm-gray/8 text-text-muted dark:text-text-muted-dark border border-warm-gray/10"
        >
          {dep}
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-[10px] text-text-muted dark:text-text-muted-dark">
          +{remaining} more
        </span>
      )}
    </span>
  );
}
```

### Pattern 5: Previous Head Commit Tracking
**What:** Store the previous scan cycle's head commits so we can detect "new commits" on dependencies
**When to use:** Module-level state in project-scanner.ts alongside existing `collectedHealthData`
**Example:**
```typescript
// Module-level state (same pattern as collectedHealthData)
let previousHeadCommits = new Map<string, string | null>();

// In scanAllProjects, before overwriting collectedHealthData:
const newPreviousHeads = new Map<string, string | null>();
for (const [key, data] of healthMap) {
  const slug = key.split(":")[0]!;
  // Use first seen head for each slug (prefer local over mac-mini)
  if (!newPreviousHeads.has(slug)) {
    newPreviousHeads.set(slug, data.headCommit);
  }
}

// After scan cycle, rotate:
// previousHeadCommits was set during LAST cycle
// currentHeadCommits is what we just scanned
// Next cycle, current becomes previous
```

### Anti-Patterns to Avoid
- **Running additional git commands during dependency check:** The whole point of D-08 is to use existing scan data only. Do NOT shell out to `git rev-list` or `git merge-base` for dependency checks.
- **Creating a separate dependency check timer:** D-06 explicitly says piggyback on existing scan cycle.
- **Storing dependency relationships in the database:** They live in config only. No migration needed.
- **Color-coding dependency badges by health status:** D-03 explicitly says neutral color -- dependency is a fact, not a status.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Health finding persistence | Custom DB logic | Existing `upsertHealthFinding()` | Handles atomic upsert with preserved detectedAt |
| Finding auto-resolution | Custom resolution logic | Existing `resolveFindings()` | Handles bulk resolution by check type |
| Severity escalation | Custom timer | Follow `escalateDirtySeverity()` pattern | Same age-check logic, different thresholds |
| Risk feed rendering | Custom risk cards for dependencies | Existing `RiskCard` component | Automatically renders any finding type |
| SSE event emission | Custom WebSocket | Existing `eventBus.emit("mc:event", { type: "health:changed" })` | Dashboard already listens for this |

**Key insight:** The health finding infrastructure is entirely generic. Adding `dependency_impact` findings requires ZERO changes to the risk feed, health check routes, or SSE event system. The only new UI is the dependency badges on project cards.

## Common Pitfalls

### Pitfall 1: Head Commit Comparison Across Hosts
**What goes wrong:** A project exists on both `local` and `mac-mini`. The `headCommit` may differ between hosts for the SAME project (that's what diverged_copies detects). Dependency drift should compare the dependency's HEAD on the same host as the dependent project's HEAD.
**Why it happens:** Multi-copy projects have `slug:local` and `slug:mac-mini` keys in the health data map.
**How to avoid:** For dependency comparison, use the `local` host's head commit when both exist. If the dependent is local-only, compare with the dependency's local copy. If cross-machine, compare with whatever copy is available.
**Warning signs:** False positives on projects that are simply behind on one host but up-to-date on another.

### Pitfall 2: First Scan Cycle Has No Previous Head Commits
**What goes wrong:** On the very first scan after server start, `previousHeadCommits` is empty, so no drift can be detected until the second cycle.
**Why it happens:** There's no persistent storage of previous head commits across server restarts.
**How to avoid:** This is acceptable behavior. The `projectCopies` table stores the last known `headCommit` -- use DB records as the "previous" when the in-memory map is empty. After the first scan, the in-memory map is populated.
**Warning signs:** No dependency_impact findings appearing for the first 5 minutes after server start.

### Pitfall 3: Config Not Available in Post-Scan Health Phase
**What goes wrong:** `runPostScanHealthPhase` currently does not receive the config -- it only gets `healthDataMap`, `db`, and `sqlite`.
**Why it happens:** The function signature was designed before dependency intelligence was needed.
**How to avoid:** Pass `config` (or just the dependency graph) as a parameter to `runPostScanHealthPhase`. The caller `scanAllProjects` already has `config`.
**Warning signs:** Cannot access `dependsOn` relationships inside the health phase.

### Pitfall 4: resolveFindings Clears Dependency Findings Prematurely
**What goes wrong:** The existing `resolveFindings` call in Stage 1 resolves any active finding whose check type is NOT in the currently-active list. If `dependency_impact` isn't added to `activeCheckTypes`, findings get auto-resolved every scan.
**Why it happens:** `resolveFindings(sqlite, slug, activeCheckTypes)` resolves everything NOT in the list.
**How to avoid:** Add `"dependency_impact"` to the `activeCheckTypes` array in Stage 1, just like `"diverged_copies"` and `"convergence"` are already added. Handle resolution explicitly in the dependency drift stage.
**Warning signs:** Dependency impact findings appear and immediately disappear.

### Pitfall 5: Dependency on Config Slugs That Don't Exist
**What goes wrong:** A `dependsOn` entry references a slug that isn't in the config (e.g., removed project).
**Why it happens:** Config validation doesn't check that `dependsOn` slugs exist as project entries.
**How to avoid:** Skip dependency pairs where either slug has no scan data. Log a warning but don't crash. This aligns with Phase 23's decision that `detectCycles` handles unknown slugs as leaf nodes.
**Warning signs:** Console warnings about missing slugs.

### Pitfall 6: Action Hint for dependency_impact Findings
**What goes wrong:** `getActionCommand` in `action-hints.ts` returns empty string for unknown check types. Dependency impact findings will have no action hint in the risk card.
**Why it happens:** `dependency_impact` is not in the switch statement.
**How to avoid:** Add a case for `dependency_impact` returning something like `cd <dependent-path> && git pull` or an informational message. The metadata contains the dependency slug.
**Warning signs:** Risk cards for dependency drift show no action hint button.

## Code Examples

### Existing: How escalateDirtySeverity Works (template for dependency escalation)
```typescript
// Source: packages/api/src/services/git-health.ts:153-171
export function escalateDirtySeverity(
  detectedAt: string,
  now?: Date
): HealthSeverity {
  const referenceTime = now ?? new Date();
  const detected = new Date(detectedAt);
  if (isNaN(detected.getTime())) return "info";

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const ageDays = (referenceTime.getTime() - detected.getTime()) / MS_PER_DAY;

  if (ageDays >= 7) return "critical";
  if (ageDays >= 3) return "warning";
  return "info";
}
```

### Existing: How Stage 2 Escalation Works (template for dependency escalation integration)
```typescript
// Source: packages/api/src/services/project-scanner.ts:618-636
// ── Stage 2: Dirty working tree severity escalation (HLTH-06) ──
const allActive = getActiveFindings(db);
const dirtyFindings = allActive.filter(
  (f) => f.checkType === "dirty_working_tree"
);

for (const finding of dirtyFindings) {
  const escalated = escalateDirtySeverity(finding.detectedAt);
  if (escalated !== finding.severity) {
    upsertHealthFinding(db, sqlite, {
      projectSlug: finding.projectSlug,
      checkType: "dirty_working_tree",
      severity: escalated,
      detail: finding.detail,
      metadata: finding.metadata ?? undefined,
    });
  }
}
```

### Existing: How HostBadge Works (template for DependencyBadges)
```typescript
// Source: packages/web/src/components/ui/host-badge.tsx
export function HostBadge({ host }: HostBadgeProps) {
  return (
    <span
      className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${hostStyles[host] ?? hostStyles.local}`}
    >
      {host}
    </span>
  );
}
```

### Existing: How dependsOn Is Already in Config Schema
```typescript
// Source: packages/api/src/lib/config.ts:12
dependsOn: z.array(z.string()).optional().default([]),
```

### Existing: How ProjectRow Shows Badges
```typescript
// Source: packages/web/src/components/departure-board/project-row.tsx:70-71
<span className="hidden sm:inline">
  <HostBadge host={project.host} />
</span>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No dependency awareness | `dependsOn` in config (Phase 23) | Phase 23 (2026-03-21) | Config schema ready, needs runtime check |
| Per-repo health checks only | Post-scan health phase with multi-stage pipeline | Phase 8 (v1.1) | Dependency checks slot into existing pipeline |
| Only diverged_copies cross-project check | Adding dependency_impact as second cross-project check | This phase | Extends cross-project intelligence |

**Current mc.config.json state:** No projects currently have `dependsOn` configured. This means the feature can be built and tested in isolation -- adding `dependsOn` to config entries activates it.

## Open Questions

1. **How to determine "commits ahead" count without git commands**
   - What we know: We have `headCommit` hashes for each project copy. We can detect that they differ. But counting how many commits apart requires `git rev-list --count` which means shelling out.
   - What's unclear: D-10 says "how many commits ahead" should be in metadata. Without running git commands, we can only say "head changed" not "3 commits ahead."
   - Recommendation: For the `commitsAhead` count, use the commit table. MC persists the last 50 commits per project in the `commits` table. We can count commits between two known hashes by scanning this table. If the hash isn't found in the table (very old), fall back to "unknown" count. This avoids any new git commands.

2. **How to handle first scan after adding dependsOn to config**
   - What we know: There's no "previous" head to compare against on first activation.
   - What's unclear: Should the first scan immediately flag drift, or wait for a baseline?
   - Recommendation: On first detection (no previous head stored), do NOT create a finding. Store the baseline. Next scan cycle can then detect actual drift. The `projectCopies` table's `headCommit` serves as the implicit "last known state."

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `packages/api/vitest.config.ts`, `packages/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTEL-02 | Dependency badges render on project cards | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/dependency-badges.test.tsx` | Wave 0 |
| INTEL-03 | Dependency drift detected when head commits differ | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/dependency-drift.test.ts` | Wave 0 |
| INTEL-04 | Severity escalation: info->warning (24h), warning->critical (7d) | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/dependency-drift.test.ts` | Wave 0 |
| INTEL-05 | Cross-machine reconciliation detects drift across hosts | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/dependency-drift.test.ts` | Wave 0 |
| INTEL-06 | Commit impact alerts fire on dependent project | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/dependency-drift.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/services/dependency-drift.test.ts` -- covers INTEL-03, INTEL-04, INTEL-05, INTEL-06
- [ ] `packages/web/src/__tests__/components/dependency-badges.test.tsx` -- covers INTEL-02

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `packages/api/src/services/project-scanner.ts` -- post-scan health phase pipeline, health data collection
- Codebase inspection: `packages/api/src/services/git-health.ts` -- health check patterns, severity escalation
- Codebase inspection: `packages/api/src/db/schema.ts` -- `projectHealth` table, `projectCopies` table
- Codebase inspection: `packages/api/src/lib/config.ts` -- `dependsOn` field schema, `detectCycles`
- Codebase inspection: `packages/shared/src/schemas/health.ts` -- `dependency_impact` already in enum
- Codebase inspection: `packages/web/src/components/ui/host-badge.tsx` -- badge component pattern
- Codebase inspection: `packages/web/src/components/departure-board/project-row.tsx` -- badge placement
- Codebase inspection: `packages/api/src/routes/projects.ts` -- API response shape
- Codebase inspection: `packages/web/src/lib/grouping.ts` -- `ProjectItem` interface

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions (D-01 through D-10) -- verified against codebase feasibility

### Tertiary (LOW confidence)
None -- all findings verified against codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing infrastructure
- Architecture: HIGH -- verified exact integration points in codebase, function signatures, data flow
- Pitfalls: HIGH -- identified from reading actual code (resolveFindings gotcha, config access, multi-host comparison)

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (30 days -- stable stack, internal project)
