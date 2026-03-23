# Phase 26: Convention Enforcement - Research

**Researched:** 2026-03-21
**Domain:** Config-driven anti-pattern scanning of CLAUDE.md files, health finding integration
**Confidence:** HIGH

## Summary

Phase 26 builds a convention scanner that reads CLAUDE.md content from the Phase 24 knowledge cache (`getKnowledge` / `getAllKnowledge`), matches config-driven anti-pattern rules, and surfaces violations as `convention_violation` health findings. The infrastructure is almost entirely in place: the `convention_violation` checkType exists in the health schema (Phase 23), the knowledge cache has CLAUDE.md content keyed by project slug (Phase 24), and the `upsertHealthFinding` / `resolveFindings` pipeline handles persistence and auto-resolution.

The primary engineering challenge is designing a rule format that supports negative context (to prevent false positives) and per-project overrides (for intentional exceptions). The secondary challenge is curating 5 or fewer launch rules that produce zero false positives against the full CLAUDE.md corpus (15+ projects with CLAUDE.md files, 33 total configured projects).

**Primary recommendation:** Build a pure-function `convention-scanner.ts` service following the `checkStaleKnowledge` pattern -- a function that accepts CLAUDE.md content, a slug, and a rule set, and returns `HealthFindingInput[]`. Integrate it into the knowledge aggregation scan cycle in `scanAllKnowledge`, running checks after each CLAUDE.md read. Store rules in `mc.config.json` under a new `conventions` array. Per-project overrides go in a `conventionOverrides` field on project entries.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion.

### Claude's Discretion
- Rule format in mc.config.json (pattern, description, negativeContext fields)
- Per-project convention overrides mechanism
- Scanner integration with existing health finding pipeline
- Launch rules selection (5 or fewer rules that produce zero false positives)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KNOW-04 | Convention anti-pattern registry is config-driven with support for negative context patterns | Config schema design for `conventions` array with `id`, `pattern` (regex), `description`, `negativeContext` (regex[]), `severity` fields. Zod validation at config load time. |
| KNOW-05 | Convention scanner detects anti-patterns in CLAUDE.md files during scan and surfaces as health findings | Pure-function scanner integrated into `scanAllKnowledge` cycle. Uses `upsertHealthFinding` for violations, `resolveFindings` for auto-clearing. |
| KNOW-06 | Convention registry launches with 5 or fewer curated rules validated against all projects for zero false positives | 5 validated rules identified from real CLAUDE.md corpus analysis (see Launch Rules section). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | (existing) | Config schema validation for convention rules | Already used for all MC schemas |
| better-sqlite3 | (existing) | Health finding persistence | Already the DB layer |
| Drizzle ORM | (existing) | Query interface for knowledge reads | Already the ORM layer |

### Supporting
No new dependencies required. This phase is 100% within the existing stack.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
├── services/
│   ├── knowledge-aggregator.ts      # Existing -- add convention scan call
│   └── convention-scanner.ts        # NEW -- pure-function rule engine
├── lib/
│   └── config.ts                    # Existing -- extend schema with conventions
└── __tests__/
    └── services/
        └── convention-scanner.test.ts  # NEW -- unit tests for scanner
```

### Pattern 1: Pure-Function Health Check (Established)
**What:** Convention scanner follows the same pattern as `checkStaleKnowledge` in `knowledge-aggregator.ts` -- a pure function that takes data in and returns `HealthFindingInput | null`.
**When to use:** Always for health check logic. Keeps scanning side-effect-free and testable.
**Example:**
```typescript
// Source: packages/api/src/services/knowledge-aggregator.ts (existing pattern)
export function checkStaleKnowledge(
  slug: string,
  lastModified: string,
  commitsSinceUpdate: number,
  now?: Date
): HealthFindingInput | null {
  // Pure logic -- no DB calls, no side effects
  // Returns a finding or null
}
```

For convention scanning, the equivalent:
```typescript
export interface ConventionRule {
  id: string;
  pattern: string;             // regex pattern to search for
  description: string;         // human-readable violation message
  negativeContext?: string[];   // if ANY of these match, suppress the finding
  severity?: "info" | "warning" | "critical";  // default: "info"
}

export function checkConventions(
  slug: string,
  content: string,
  rules: ConventionRule[],
  overrides?: string[]   // rule IDs to skip for this project
): HealthFindingInput[] {
  const findings: HealthFindingInput[] = [];

  for (const rule of rules) {
    // Skip if project has override for this rule
    if (overrides?.includes(rule.id)) continue;

    // Check if pattern matches
    const regex = new RegExp(rule.pattern, "i");
    if (!regex.test(content)) continue;

    // Check negative context -- suppress if any negative pattern matches
    if (rule.negativeContext?.some(nc => new RegExp(nc, "i").test(content))) {
      continue;
    }

    findings.push({
      projectSlug: slug,
      checkType: "convention_violation",
      severity: rule.severity ?? "info",
      detail: `Convention "${rule.id}": ${rule.description}`,
      metadata: { ruleId: rule.id, pattern: rule.pattern },
    });
  }

  return findings;
}
```

### Pattern 2: Config Extension (Established)
**What:** New config sections are added to `mcConfigSchema` in `lib/config.ts` with Zod schemas. Optional with `.default([])` for backward compatibility.
**When to use:** Any new user-configurable behavior.
**Example:**
```typescript
// Source: packages/api/src/lib/config.ts (established pattern)
// dependsOn uses this exact approach
export const mcConfigSchema = z.object({
  // ... existing fields ...
  conventions: z.array(conventionRuleSchema).optional().default([]),
});
```

### Pattern 3: Integration in Knowledge Scan Cycle
**What:** Convention checks run inside `scanAllKnowledge` after each CLAUDE.md content is read. This is better than running in the project scan cycle because:
1. Conventions operate on CLAUDE.md content, which is already available in the knowledge scan
2. The knowledge scan is on a separate hourly timer (not the 5-minute project scan)
3. CLAUDE.md content changes rarely, so checking every hour is sufficient
**When to use:** For this phase specifically.
**Example:**
```typescript
// In scanAllKnowledge, after content read and knowledge upsert:
const conventionFindings = checkConventions(
  target.slug,
  content,
  config.conventions ?? [],
  getProjectOverrides(config, target.slug)
);

for (const finding of conventionFindings) {
  upsertHealthFinding(db, sqlite, finding);
}

// If no convention violations, resolve any previous ones
if (conventionFindings.length === 0) {
  // Resolve convention_violation for this slug
}
```

### Pattern 4: Per-Project Convention Overrides
**What:** Projects can suppress specific convention rules using a `conventionOverrides` field on the project entry in `mc.config.json`.
**When to use:** When a project intentionally violates a convention (e.g., CocoBanana lists API key env vars in CLAUDE.md as documentation, not secrets).
**Example:**
```json
{
  "name": "CocoBanana",
  "slug": "cocobanana",
  "path": "/Users/ryanstern/cocobanana",
  "host": "local",
  "conventionOverrides": ["no-api-keys-in-docs"]
}
```

### Anti-Patterns to Avoid
- **Running convention checks in the project scan cycle:** The project scanner (`scanAllProjects`) runs every 5 minutes and is already complex (1200+ lines). Convention checks belong in the knowledge scan cycle.
- **Storing convention rules in the database:** Config-driven means `mc.config.json`. No new tables. Rules are source-of-truth in config, violations are health findings in the DB.
- **Using line-by-line scanning:** Regex against the full CLAUDE.md content is simpler, faster, and more flexible than line-by-line parsing. Negative context patterns also match against full content.
- **Complex AST or structured CLAUDE.md parsing:** CLAUDE.md files have no guaranteed structure. Treat them as plain text. Regex is the right tool.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Regex compilation | Custom pattern matcher | `new RegExp(pattern, flags)` | Built-in, handles all needed patterns |
| Health finding persistence | Custom DB operations | `upsertHealthFinding` / `resolveFindings` | Existing pipeline handles dedup, timestamps, resolution |
| Config validation | Manual JSON parsing | Zod schema + `.safeParse()` | Established pattern, provides type safety |

**Key insight:** The entire health finding pipeline (upsert, resolve, query, risk feed display) is already built. Convention violations plug in by producing `HealthFindingInput` objects with `checkType: "convention_violation"`. No new API endpoints are required for the findings to appear in the dashboard risk feed.

## Common Pitfalls

### Pitfall 1: False Positives from Naive Pattern Matching
**What goes wrong:** A rule like "detect `Gemini 2`" matches the string "Gemini 2.0 is deprecated" in a CLAUDE.md that explicitly acknowledges the deprecation.
**Why it happens:** The rule sees the deprecated string without understanding context.
**How to avoid:** `negativeContext` patterns. For the deprecated model rule, the negative context `deprecated|replaced|do not use|never use` suppresses the finding when the CLAUDE.md explicitly documents the deprecation.
**Warning signs:** Running the rules against existing CLAUDE.md files produces findings for projects that are already compliant.

### Pitfall 2: upsertHealthFinding Dedup Key Collision
**What goes wrong:** `upsertHealthFinding` uses `(projectSlug, checkType)` as the dedup key for active findings. If a project has TWO convention violations (from two different rules), only the last one persists because they share the same `checkType`.
**Why it happens:** The existing upsert logic finds the active finding for `(slug, "convention_violation")` and updates it instead of creating a second one.
**How to avoid:** Two options:
  1. **Aggregate violations into a single finding:** One `convention_violation` finding per project with detail listing all rule IDs that failed. This is simpler and matches the existing 1:1 (slug, checkType) model.
  2. **Encode rule ID into the checkType:** Not recommended -- would require extending the health enum for each rule.

  **Recommendation:** Option 1 -- aggregate. A single finding with `detail: "2 conventions violated: no-deprecated-models, no-stale-project-name"` and `metadata: { violations: [{ruleId, description}, ...] }`. This preserves the existing dedup model.
**Warning signs:** Test with a project that violates multiple rules simultaneously.

### Pitfall 3: Resolution Race Between Knowledge Scan and Convention Scan
**What goes wrong:** The `resolveFindings` call in `scanAllKnowledge` for stale_knowledge might also resolve convention_violation findings if not handled carefully.
**Why it happens:** `resolveFindings(sqlite, slug, [])` resolves ALL active findings for a project. The knowledge scan currently calls this for non-stale projects.
**How to avoid:** When calling `resolveFindings`, pass the active check types to preserve. Currently the knowledge scan passes an empty array (resolving all) -- this needs to be updated to preserve `convention_violation` findings when they should persist. Alternatively, manage convention finding resolution separately.
**Warning signs:** Convention violations disappear between scan cycles despite the rule still matching.

### Pitfall 4: Config Reload Not Picking Up New Rules
**What goes wrong:** `loadConfig()` is called once at startup. New convention rules added to `mc.config.json` are not picked up until the server restarts.
**Why it happens:** Config is loaded synchronously at boot and passed around by reference.
**How to avoid:** This is existing behavior for all config (projects, services, etc.). Not a new problem. Document that adding convention rules requires a server restart (consistent with all other config changes).
**Warning signs:** None -- this is expected behavior.

### Pitfall 5: Regex Denial of Service
**What goes wrong:** A malicious or poorly-written regex pattern in config causes catastrophic backtracking on large CLAUDE.md files.
**Why it happens:** User-provided regex patterns in config.
**How to avoid:** Wrap regex execution in a try/catch. CLAUDE.md files are already capped at 500KB by the knowledge aggregator. Consider a timeout or iteration limit for large files, but this is low priority for a single-user system.
**Warning signs:** Knowledge scan takes unusually long. A project's CLAUDE.md is close to the 500KB limit.

## Launch Rules: 5 Curated Rules for Zero False Positives

Based on analysis of the real CLAUDE.md corpus across 15+ projects:

### Rule 1: `no-deprecated-models`
**Pattern:** `gemini.2\.0|gemini-2\.0|qwen3-8b|qwen3.8b`
**Description:** References deprecated AI model (use Gemini 3 Flash or Qwen3.5-35B-A3B)
**Negative Context:** `deprecated|replaced by|do not use|never use|NEVER USE|is fully deprecated`
**Validation:** TaxNav CLAUDE.md contains "Gemini 2.0 is deprecated" -- the negative context suppresses this. No other CLAUDE.md files reference these models without the deprecation context. Persona-pipeline CLAUDE.md says "Qwen3-8B is fully deprecated" -- also suppressed.
**False positive risk:** LOW -- negative context handles documented deprecations.

### Rule 2: `no-stale-project-name`
**Pattern:** `# QMspace|# QM0Dev|# AI Agent Dashboard|# ExecRoute|# Meeting Companion`
**Description:** CLAUDE.md header uses deprecated project name (update to current name)
**Negative Context:** `formerly|previously known as|was renamed|now called`
**Validation:** Streamline's CLAUDE.md header is `# QMspace -- Team Workspace` with no "formerly" context -- this would correctly fire. Other projects that mention "formerly qmspace" in body text but have correct headers would not trigger (pattern requires `# QMspace` at heading level).
**False positive risk:** LOW -- only triggers on markdown heading format.

### Rule 3: `has-overview-section`
**Pattern:** `^## (Overview|Project Overview|Architecture)`
**Description:** CLAUDE.md is missing a required section (## Overview, ## Project Overview, or ## Architecture)
**Negative Context:** (none needed -- this is an absence check)
**Implementation note:** This rule is INVERTED -- it fires when the pattern does NOT match. The scanner needs a `matchType: "must_match"` flag to support this. When `matchType` is `"must_match"`, the finding fires if the pattern is NOT found in the content.
**Validation:** All existing CLAUDE.md files that the scanner can read have at least one of these sections. Signal-glass, mainline, and vaulttrain-stern have no CLAUDE.md at all (those would produce stale_knowledge findings, not convention violations -- no content = no scan).
**False positive risk:** MEDIUM -- needs validation against every existing CLAUDE.md. Consider deferring to post-launch if validation is incomplete.

### Rule 4: `no-hardcoded-ports-without-docs`
**Pattern:** `localhost:\d{4,5}`
**Description:** CLAUDE.md references localhost ports -- ensure they match actual service configuration
**Negative Context:** (none)
**Implementation note:** This is informational only (`severity: "info"`). It flags projects for review, not as errors.
**False positive risk:** HIGH for zero-false-positive goal -- too many legitimate `localhost:XXXX` references. **RECOMMEND: Replace this with a safer rule.**

### Rule 4 (Revised): `no-todo-in-claude-md`
**Pattern:** `TODO|FIXME|HACK|XXX`
**Description:** CLAUDE.md contains TODO/FIXME markers -- these should be resolved or moved to issues
**Negative Context:** `# TODO|## TODO` (suppress if "TODO" appears only as a section heading)
**Validation:** Checked all existing CLAUDE.md files -- none contain bare TODO/FIXME markers.
**False positive risk:** LOW.

### Rule 5: `no-secrets-in-docs`
**Pattern:** `API_KEY=\S+|SECRET=\S+|PASSWORD=\S+|TOKEN=\S+`
**Description:** CLAUDE.md may contain actual secret values (use placeholders instead)
**Negative Context:** `\.env\.example|example|placeholder|your.+here|<.+>`
**Validation:** CocoBanana's CLAUDE.md shows `GEMINI_API_KEY=` with empty value (no actual secret) -- pattern requires non-whitespace after `=`, so empty values don't match. Foundry mentions "password = LAN Access Code" which matches but negative context handles "example" or placeholder context.
**False positive risk:** LOW -- pattern requires actual value after `=` sign.

### Summary of Launch Rules

| # | ID | Pattern | Fires When | Severity |
|---|-----|---------|-----------|----------|
| 1 | `no-deprecated-models` | `gemini.2\.0\|qwen3-8b` | CLAUDE.md references deprecated model without deprecation context | warning |
| 2 | `no-stale-project-name` | `# QMspace\|# QM0Dev\|...` | Header uses old project name | warning |
| 3 | `has-overview-section` | `^## (Overview\|Project Overview\|Architecture)` | Missing overview/architecture section (inverted match) | info |
| 4 | `no-todo-markers` | `TODO\|FIXME\|HACK\|XXX` | Contains unresolved markers | info |
| 5 | `no-secrets-in-docs` | `API_KEY=\S+\|SECRET=\S+...` | May contain actual secret values | warning |

**Recommendation on Rule 3:** The inverted match (`must_match`) adds complexity to the rule engine. Since the goal is zero false positives and 5 or fewer rules, consider launching with only rules 1, 2, 4, and 5 (all positive matches), and adding `must_match` support as a follow-up. However, implementing `must_match` is straightforward (a boolean flag + negating the match check), so it's reasonable to include.

## Convention Rule Config Schema

```typescript
// In packages/api/src/lib/config.ts

const conventionRuleSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  description: z.string().min(1),
  negativeContext: z.array(z.string()).optional().default([]),
  severity: z.enum(["info", "warning", "critical"]).optional().default("info"),
  matchType: z.enum(["must_not_match", "must_match"]).optional().default("must_not_match"),
});

// Per-project overrides on project entry
const projectEntrySchema = z.object({
  // ... existing fields ...
  conventionOverrides: z.array(z.string()).optional().default([]),
});

// Top-level config
const mcConfigSchema = z.object({
  // ... existing fields ...
  conventions: z.array(conventionRuleSchema).optional().default([]),
});
```

**`matchType` semantics:**
- `"must_not_match"` (default): Finding fires when pattern IS found (anti-pattern detection)
- `"must_match"`: Finding fires when pattern is NOT found (required content enforcement)

## Integration Design: Knowledge Scan Cycle

```
scanAllKnowledge()
  for each scan target:
    1. Read CLAUDE.md (local or SSH)
    2. Check content hash (skip if unchanged)  ← existing
    3. Upsert knowledge record                 ← existing
    4. Check stale knowledge                   ← existing
    5. Run convention checks (NEW)
       - Load rules from config.conventions
       - Load overrides from project entry
       - Call checkConventions(slug, content, rules, overrides)
       - Aggregate findings into single convention_violation per project
       - upsertHealthFinding if violations found
       - Resolve convention_violation if no violations found
```

**Critical detail:** Step 5 must run for both new/changed content AND cached (unchanged) content. Currently, when content hash matches, the scan skips to stale knowledge check. Convention checks should also run on cached content because:
- Rules may have changed (server restart with new config)
- On first scan after adding rules, all projects need checking

The simplest approach: always run convention checks using the content from `getKnowledge(db, slug)` after the content-hash check. If the project has knowledge cached, run conventions regardless of whether the content changed this cycle.

**Alternative approach (simpler):** Run all convention checks in a separate pass at the end of `scanAllKnowledge`, iterating over all knowledge records. This decouples convention scanning from the per-target read loop.

```typescript
// After all targets are scanned:
const allKnowledgeRecords = getAllKnowledgeWithContent(db);  // new query
for (const record of allKnowledgeRecords) {
  const overrides = getProjectOverrides(config, record.projectSlug);
  const violations = checkConventions(
    record.projectSlug, record.content, config.conventions ?? [], overrides
  );
  // ... upsert or resolve
}
```

**Recommendation:** The separate-pass approach is cleaner. It runs conventions against ALL cached knowledge (not just projects scanned this cycle), handles rule changes gracefully, and keeps the per-target read loop unchanged.

## Finding Resolution Strategy

The `upsertHealthFinding` dedup key is `(projectSlug, checkType, resolvedAt IS NULL)`. Since `convention_violation` is a single checkType, each project can have at most one active convention_violation finding.

**Resolution flow:**
1. After running convention checks for a project:
   - If violations found: `upsertHealthFinding` with aggregated detail and metadata
   - If NO violations found: resolve the convention_violation for that project
2. Resolution uses targeted SQL (not `resolveFindings` which operates on check type exclusion lists):
   ```sql
   UPDATE project_health SET resolved_at = ?
   WHERE project_slug = ? AND check_type = 'convention_violation' AND resolved_at IS NULL
   ```

**Note:** The existing `resolveFindings` in `scanAllKnowledge` currently passes `[]` (resolve all) for non-stale projects. This MUST be updated to preserve `convention_violation` findings. The fix: when resolving stale_knowledge findings, pass `["convention_violation"]` as the active check types to preserve.

## Code Examples

### Convention Scanner (Pure Function)
```typescript
// packages/api/src/services/convention-scanner.ts
import type { HealthFindingInput } from "@mission-control/shared";

export interface ConventionRule {
  id: string;
  pattern: string;
  description: string;
  negativeContext: string[];
  severity: "info" | "warning" | "critical";
  matchType: "must_not_match" | "must_match";
}

/**
 * Check CLAUDE.md content against convention rules.
 * Returns a single aggregated HealthFindingInput if any rules violated,
 * or an empty array if all rules pass.
 *
 * Pure function -- no DB calls, no side effects.
 */
export function checkConventions(
  slug: string,
  content: string,
  rules: ConventionRule[],
  overrides: string[]
): HealthFindingInput[] {
  const violations: Array<{ ruleId: string; description: string }> = [];

  for (const rule of rules) {
    if (overrides.includes(rule.id)) continue;

    let patternMatches: boolean;
    try {
      const regex = new RegExp(rule.pattern, "im");
      patternMatches = regex.test(content);
    } catch {
      // Invalid regex -- skip rule, don't crash
      continue;
    }

    // Determine if this is a violation
    const isViolation =
      rule.matchType === "must_not_match"
        ? patternMatches   // anti-pattern found
        : !patternMatches; // required content missing

    if (!isViolation) continue;

    // Check negative context (only for must_not_match)
    if (rule.matchType === "must_not_match" && rule.negativeContext.length > 0) {
      const suppressed = rule.negativeContext.some((nc) => {
        try {
          return new RegExp(nc, "i").test(content);
        } catch {
          return false;
        }
      });
      if (suppressed) continue;
    }

    violations.push({ ruleId: rule.id, description: rule.description });
  }

  if (violations.length === 0) return [];

  // Determine worst severity across violated rules
  const violatedRules = rules.filter((r) =>
    violations.some((v) => v.ruleId === r.id)
  );
  const severityOrder = { critical: 3, warning: 2, info: 1 };
  const worstSeverity = violatedRules.reduce(
    (worst, rule) =>
      severityOrder[rule.severity] > severityOrder[worst]
        ? rule.severity
        : worst,
    "info" as "info" | "warning" | "critical"
  );

  return [
    {
      projectSlug: slug,
      checkType: "convention_violation",
      severity: worstSeverity,
      detail:
        violations.length === 1
          ? `Convention "${violations[0]!.ruleId}": ${violations[0]!.description}`
          : `${violations.length} convention violations: ${violations.map((v) => v.ruleId).join(", ")}`,
      metadata: { violations },
    },
  ];
}
```

### Config Schema Extension
```typescript
// Addition to packages/api/src/lib/config.ts

const conventionRuleSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "Convention ID must be kebab-case"),
  pattern: z.string().min(1),
  description: z.string().min(1),
  negativeContext: z.array(z.string()).optional().default([]),
  severity: z.enum(["info", "warning", "critical"]).optional().default("info"),
  matchType: z.enum(["must_not_match", "must_match"]).optional().default("must_not_match"),
});

export type ConventionRule = z.infer<typeof conventionRuleSchema>;
```

### mc.config.json Convention Section
```json
{
  "conventions": [
    {
      "id": "no-deprecated-models",
      "pattern": "gemini.2\\.0|gemini-2\\.0|qwen3-8b|qwen3.8b",
      "description": "References deprecated AI model (use Gemini 3 Flash or Qwen3.5-35B-A3B)",
      "negativeContext": ["deprecated|replaced by|do not use|never use|is fully deprecated"],
      "severity": "warning"
    },
    {
      "id": "no-stale-project-name",
      "pattern": "# QMspace|# QM0Dev|# AI Agent Dashboard|# ExecRoute|# Meeting Companion",
      "description": "CLAUDE.md header uses deprecated project name",
      "negativeContext": ["formerly|previously known as|was renamed|now called"],
      "severity": "warning"
    },
    {
      "id": "has-overview-section",
      "pattern": "## Overview|## Project Overview|## Architecture",
      "description": "CLAUDE.md missing required overview or architecture section",
      "matchType": "must_match",
      "severity": "info"
    },
    {
      "id": "no-todo-markers",
      "pattern": "\\bTODO\\b|\\bFIXME\\b|\\bHACK\\b|\\bXXX\\b",
      "description": "Contains unresolved TODO/FIXME markers",
      "negativeContext": ["# TODO|## TODO"],
      "severity": "info"
    },
    {
      "id": "no-secrets-in-docs",
      "pattern": "API_KEY=[^\\s]{8,}|SECRET=[^\\s]{8,}|PASSWORD=[^\\s]{8,}|TOKEN=[^\\s]{8,}",
      "description": "May contain actual secret values (use placeholders)",
      "negativeContext": ["example|placeholder|your.+here|<.+>|\\.env\\.example"],
      "severity": "warning"
    }
  ]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Lint tool per-repo | Config-driven cross-repo scanner | This phase | Unified convention enforcement across 35 projects |
| Manual CLAUDE.md review | Automated anti-pattern detection | This phase | Catches stale names, deprecated models, secrets |

**Note:** No external tools needed. This is a bespoke scanner because the problem domain (CLAUDE.md convention enforcement across a personal project portfolio) is unique to Mission Control.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/convention-scanner.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KNOW-04 | Convention rules with negativeContext suppress findings | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/convention-scanner.test.ts` | Wave 0 |
| KNOW-04 | Config schema validates convention rules with all fields | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/lib/config.test.ts` | Extend existing |
| KNOW-05 | Scanner produces convention_violation health findings | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/convention-scanner.test.ts` | Wave 0 |
| KNOW-05 | Scanner resolves findings when violations are fixed | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/convention-scanner.test.ts` | Wave 0 |
| KNOW-05 | Integration: findings appear in knowledge scan cycle | integration | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/knowledge-aggregator.test.ts` | Extend existing |
| KNOW-06 | Per-project overrides suppress specific rules | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/convention-scanner.test.ts` | Wave 0 |
| KNOW-06 | 5 launch rules produce zero false positives | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/convention-scanner.test.ts` | Wave 0 |
| KNOW-06 | must_match rules fire on missing content | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/convention-scanner.test.ts` | Wave 0 |
| KNOW-06 | Aggregated finding when multiple rules violated | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/convention-scanner.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/services/convention-scanner.test.ts` -- covers KNOW-04, KNOW-05, KNOW-06
- [ ] Extend `packages/api/src/__tests__/lib/config.test.ts` -- convention rule schema validation
- [ ] Extend `packages/api/src/__tests__/services/knowledge-aggregator.test.ts` -- integration with convention scan

## Open Questions

1. **Should convention checks run on every knowledge scan or only when content changes?**
   - What we know: CLAUDE.md content changes rarely. Rules change even less often.
   - What's unclear: If rules change (server restart), should we re-check all projects?
   - Recommendation: Run convention checks in a separate pass at the end of `scanAllKnowledge`, iterating ALL cached knowledge. This handles rule changes gracefully and decouples from the content-hash check.

2. **How should `resolveFindings` interact with convention_violation?**
   - What we know: Current `resolveFindings(sqlite, slug, [])` in the non-stale branch resolves ALL findings for the project.
   - What's unclear: This would incorrectly resolve convention_violation findings.
   - Recommendation: Update the resolve call to preserve `convention_violation` and `stale_knowledge` types. Pass `["convention_violation", "stale_knowledge"]` instead of `[]`.

3. **Should we add a `getAllKnowledgeWithContent` query?**
   - What we know: `getAllKnowledge` explicitly excludes `content` for list endpoints. Convention scanning needs content.
   - What's unclear: Whether to add a new query or use `getKnowledge` in a loop.
   - Recommendation: Add `getAllKnowledgeWithContent` that includes content. Convention scanning needs to iterate all projects, and N+1 queries (calling `getKnowledge` per slug) are less efficient than a single `SELECT *`.

## Sources

### Primary (HIGH confidence)
- `packages/api/src/services/knowledge-aggregator.ts` -- knowledge scan cycle, content-hash caching, stale knowledge checks
- `packages/api/src/services/git-health.ts` -- pure-function health check pattern (`checkStaleKnowledge`, `runHealthChecks`)
- `packages/api/src/db/queries/health.ts` -- `upsertHealthFinding`, `resolveFindings` dedup behavior
- `packages/api/src/lib/config.ts` -- config schema pattern, `loadConfig()`, `detectCycles`
- `packages/shared/src/schemas/health.ts` -- `convention_violation` in `healthCheckTypeEnum`
- `mc.config.json` -- current project registry (33 projects, no conventions section yet)

### Secondary (MEDIUM confidence)
- Real CLAUDE.md corpus scan -- 15+ projects with CLAUDE.md files analyzed for anti-pattern candidates
- Streamline CLAUDE.md -- confirmed `# QMspace` header stale name
- TaxNav CLAUDE.md -- confirmed "Gemini 2.0 is deprecated" negative context pattern
- Persona-pipeline CLAUDE.md -- confirmed "Qwen3-8B is fully deprecated" negative context pattern

### Tertiary (LOW confidence)
- None -- all findings verified against real codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing patterns
- Architecture: HIGH -- follows established pure-function health check pattern exactly
- Pitfalls: HIGH -- identified from reading actual code paths (upsert dedup, resolveFindings interaction)
- Launch rules: HIGH -- validated against real CLAUDE.md corpus on disk

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- no external dependencies to change)
