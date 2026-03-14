# Phase 6: Data Foundation - Research

**Researched:** 2026-03-14
**Domain:** SQLite schema design, Drizzle ORM migrations, upsert semantics, Zod schema design, config schema extension
**Confidence:** HIGH

## Summary

Phase 6 is a pure data layer phase: two new SQLite tables (`project_health`, `project_copies`), one Drizzle migration, shared Zod schemas for health/copy types, DB query functions with correct upsert semantics, and a config schema extension for multi-host project entries. No API routes, no scanner changes, no frontend work.

The codebase has well-established patterns for all of these concerns. The Drizzle schema file (`schema.ts`) uses `sqliteTable()` with explicit index definitions. Query files follow a one-file-per-domain pattern with pure functions accepting `(db: DrizzleDb, ...)`. Zod schemas live in `packages/shared/src/schemas/` and are re-exported through `index.ts`. Migrations are hand-written SQL files in `packages/api/drizzle/` with a JSON journal.

The one genuinely tricky part is the health finding upsert semantics. The design spec requires upserting active findings by `(projectSlug, checkType)` while preserving `detectedAt` from the original insert. A naive `onConflictDoUpdate` approach has a critical limitation: SQLite does not reliably support partial unique indexes (with WHERE clauses) in ON CONFLICT targets. This means you cannot create a unique index on `(projectSlug, checkType) WHERE resolvedAt IS NULL` and use it with `onConflictDoUpdate`. The correct approach is an explicit SELECT-then-UPDATE/INSERT pattern wrapped in a transaction, which is both simpler and more robust.

**Primary recommendation:** Use explicit transactional SELECT-then-UPDATE/INSERT for health finding upserts. Use standard `onConflictDoUpdate` for the `project_copies` table (which has a straightforward unique constraint on `(projectSlug, host)`). Follow existing codebase patterns exactly for schema definitions, migrations, Zod schemas, and query file organization.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No locked decisions -- user deferred all internal consistency decisions to Claude's discretion.

### Claude's Discretion
User deferred all internal consistency decisions. Resolve these during implementation:

- **Timestamp format:** Existing tables use `integer` with Drizzle `mode: "timestamp"` (Unix). Spec says `text` ISO. Claude should pick whichever integrates more cleanly with existing query patterns -- likely `text` for `detectedAt`/`resolvedAt`/`lastCheckedAt` since these need ISO display in API responses and age calculations, but follow the spec.
- **ID strategy:** Existing tables use `text` UUID PKs. Spec says `integer PK auto-increment`. Claude should follow the spec (auto-increment) since health findings are internal records, not externally referenced -- simpler than UUIDs.
- **Config multi-host format:** Spec defines a `z.union([projectEntrySchema, multiCopyEntrySchema])` approach. Follow the spec -- it preserves backward compatibility with existing single-host entries.
- **Query file organization:** Follow existing pattern -- one file per domain (`health.ts`, `copies.ts` in `db/queries/`).

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HLTH-09 | Health findings persist with upsert semantics preserving first-detected timestamps | Upsert pattern research (SELECT-then-UPDATE/INSERT), `detectedAt` preservation strategy, regression test pattern |
| HLTH-10 | GitHub-only projects (no local clone) show as "unmonitored" with null health score | `project_copies` table design with `host` enum excluding `github`, null `healthScore` handling in schema |
| COPY-02 | Config supports explicit multi-host entries alongside existing single-host format | `z.union([projectEntrySchema, multiCopyEntrySchema])` config extension, backward compatibility analysis |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.38.0 | SQLite ORM, schema definitions, query builder, migrations | Already in use. All existing tables defined via `sqliteTable()`. |
| better-sqlite3 | ^11.7.0 | SQLite driver, raw SQL for complex queries | Already in use. Transaction support needed for health upserts. |
| zod | ^3.24.0 | Schema validation for API boundaries | Already in use. All schemas in shared package follow this pattern. |
| nanoid | ^5.0.0 | ID generation (if needed for text PKs) | Already in use. Not needed for this phase (auto-increment PKs). |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-kit | ^0.30.0 | Migration generation and management | Dev dependency. Generate migration SQL. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Auto-increment integer PKs | Text UUID PKs (nanoid) | Spec says auto-increment; health findings are internal records, not externally referenced. Auto-increment is simpler and correct here. |
| Text ISO timestamps | Integer Unix timestamps | Spec says text. Existing tables use integer. For health findings, text ISO is better: `detectedAt` needs ISO display in API responses and human-readable age calculations. Integer would require conversion on every read. |

**Installation:**
```bash
# No new dependencies needed -- everything is already installed
```

## Architecture Patterns

### Recommended Project Structure
```
packages/
  api/
    drizzle/
      0005_git_health.sql          # New migration
      meta/_journal.json           # Updated journal
    src/
      db/
        schema.ts                  # Add projectHealth + projectCopies tables
        queries/
          health.ts                # NEW: health finding CRUD with upsert
          copies.ts                # NEW: project copies CRUD
      lib/
        config.ts                  # Extended with multiCopyEntrySchema
  shared/
    src/
      schemas/
        health.ts                  # NEW: Zod schemas for health types
      types/
        index.ts                   # Add health type exports
      index.ts                     # Add health schema + type re-exports
```

### Pattern 1: Drizzle Table Definition
**What:** Define SQLite tables using `sqliteTable()` with explicit column types and index definitions.
**When to use:** Every new table.
**Example:**
```typescript
// Source: packages/api/src/db/schema.ts (existing pattern)
export const projectHealth = sqliteTable(
  "project_health",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectSlug: text("project_slug").notNull(),
    checkType: text("check_type").notNull(),
    severity: text("severity").notNull(),
    detail: text("detail").notNull(),
    metadata: text("metadata"),
    detectedAt: text("detected_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("health_slug_check_idx").on(table.projectSlug, table.checkType),
    index("health_resolved_idx").on(table.resolvedAt),
    index("health_slug_resolved_idx").on(table.projectSlug, table.resolvedAt),
  ]
);
```

### Pattern 2: Health Finding Upsert (SELECT-then-UPDATE/INSERT)
**What:** Explicit transactional upsert that preserves `detectedAt` on conflict.
**When to use:** Every scan cycle when writing health findings.
**Why not `onConflictDoUpdate`:** SQLite does not support partial unique indexes in ON CONFLICT targets. We need to match on `(projectSlug, checkType) WHERE resolvedAt IS NULL` -- this requires a WHERE clause in the conflict target, which SQLite does not support. An explicit pattern is clearer, more testable, and avoids the trap.
**Example:**
```typescript
// Source: Derived from existing upsertProject() + commits upsert patterns
export function upsertHealthFinding(
  db: DrizzleDb,
  sqlite: Database.Database,
  finding: HealthFindingInput
): void {
  const now = new Date().toISOString();

  const transaction = sqlite.transaction(() => {
    // Check for existing active finding
    const existing = sqlite.prepare(`
      SELECT id, detected_at FROM project_health
      WHERE project_slug = ? AND check_type = ? AND resolved_at IS NULL
    `).get(finding.projectSlug, finding.checkType) as
      | { id: number; detected_at: string }
      | undefined;

    if (existing) {
      // UPDATE: preserve detected_at, update severity/detail/metadata
      sqlite.prepare(`
        UPDATE project_health
        SET severity = ?, detail = ?, metadata = ?
        WHERE id = ?
      `).run(finding.severity, finding.detail, finding.metadata ?? null, existing.id);
    } else {
      // INSERT: new finding with fresh detectedAt
      sqlite.prepare(`
        INSERT INTO project_health (project_slug, check_type, severity, detail, metadata, detected_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(finding.projectSlug, finding.checkType, finding.severity, finding.detail, finding.metadata ?? null, now);
    }
  });

  transaction();
}
```

### Pattern 3: Project Copies Upsert (Standard onConflictDoUpdate)
**What:** Standard upsert for the `project_copies` table using Drizzle's `onConflictDoUpdate`.
**When to use:** After scanning a project on any host.
**Why this works here:** The unique constraint on `(projectSlug, host)` is unconditional -- no WHERE clause needed.
**Example:**
```typescript
// Source: Existing upsertProject() pattern in projects.ts
export function upsertCopy(db: DrizzleDb, data: CopyInput): void {
  const now = new Date().toISOString();

  db.insert(projectCopies)
    .values({
      projectSlug: data.projectSlug,
      host: data.host,
      path: data.path,
      remoteUrl: data.remoteUrl,
      headCommit: data.headCommit,
      branch: data.branch,
      isPublic: data.isPublic,
      lastCheckedAt: now,
    })
    .onConflictDoUpdate({
      target: [projectCopies.projectSlug, projectCopies.host],
      set: {
        path: data.path,
        remoteUrl: data.remoteUrl,
        headCommit: data.headCommit,
        branch: data.branch,
        isPublic: data.isPublic,
        lastCheckedAt: now,
      },
    })
    .run();
}
```

### Pattern 4: Config Schema Extension
**What:** Extend `mc.config.json` schema to support both single-host and multi-host project entries via `z.union()`.
**When to use:** Config loading in `config.ts`.
**Example:**
```typescript
// Source: Existing config.ts pattern
const multiCopyEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  tagline: z.string().optional(),
  repo: z.string().optional(),
  copies: z.array(z.object({
    host: z.enum(["local", "mac-mini"]),
    path: z.string(),
  })).min(1),
});

const projectConfigEntrySchema = z.union([
  projectEntrySchema,
  multiCopyEntrySchema,
]);

const mcConfigSchema = z.object({
  projects: z.array(projectConfigEntrySchema),
  dataDir: z.string().default("./data"),
  services: z.array(serviceEntrySchema).default([]),
  macMiniSshHost: z.string().default("ryans-mac-mini"),
});
```

### Pattern 5: Zod Schema in Shared Package
**What:** Define Zod schemas for API response shapes, with inferred TypeScript types.
**When to use:** Any type that crosses the API boundary (DB query result -> API response -> frontend consumption).
**Example:**
```typescript
// Source: Existing schemas/port.ts pattern
import { z } from "zod";

export const healthCheckTypeEnum = z.enum([
  "unpushed_commits",
  "no_remote",
  "broken_tracking",
  "remote_branch_gone",
  "unpulled_commits",
  "dirty_working_tree",
  "diverged_copies",
]);

export const healthSeverityEnum = z.enum(["info", "warning", "critical"]);

export const riskLevelEnum = z.enum([
  "healthy",
  "warning",
  "critical",
  "unmonitored",
]);

export const healthFindingSchema = z.object({
  id: z.number().int(),
  projectSlug: z.string(),
  checkType: healthCheckTypeEnum,
  severity: healthSeverityEnum,
  detail: z.string(),
  metadata: z.record(z.unknown()).nullable(),
  detectedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
```

### Anti-Patterns to Avoid
- **Using `INSERT OR REPLACE` for health findings:** This is DELETE + INSERT in SQLite. It destroys `detectedAt`, breaking dirty age tracking. Use explicit SELECT-then-UPDATE/INSERT.
- **Including `detectedAt` in any UPDATE set clause:** The entire point of the upsert semantics is that `detectedAt` is preserved from the original insert. Never update it.
- **Using a partial unique index for ON CONFLICT in SQLite:** SQLite does not support WHERE clauses in ON CONFLICT target specifications. Do not create a unique index with `WHERE resolved_at IS NULL` and expect it to work with `onConflictDoUpdate`.
- **Creating separate migration files for each table:** One migration `0005_git_health.sql` creates both tables. This is the existing pattern (see `0004_port_registry.sql` which creates `machines`, `port_allocations`, `port_scans`, and `port_ranges` in a single file).
- **Using `z.discriminatedUnion` for config entries:** `z.discriminatedUnion` requires a shared literal discriminator field. Single-host entries have `host`/`path` at root level; multi-host entries have `copies`. Use `z.union()` instead, which tries each schema in order.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema definition | Raw CREATE TABLE SQL in TypeScript | Drizzle `sqliteTable()` | Type-safe, auto-inferred types, index definitions colocated |
| Migration generation | Manual SQL file creation | `drizzle-kit generate` or hand-write matching Drizzle schema | Must match Drizzle schema exactly; journal must be updated |
| Type inference from schemas | Manual TypeScript interfaces duplicating Zod | `z.infer<typeof schema>` | Single source of truth; no drift between schema and type |
| Config validation | Manual JSON parsing with if-checks | Zod schema with `.safeParse()` | Structured error messages, type narrowing, composable |

**Key insight:** This phase is 100% existing patterns applied to new domain types. There is nothing novel about the technology -- the novelty is entirely in the upsert semantics for `detectedAt` preservation, which is a data correctness concern, not a technology choice.

## Common Pitfalls

### Pitfall 1: detectedAt Overwritten on Upsert
**What goes wrong:** Using `INSERT OR REPLACE` or including `detectedAt` in the `onConflictDoUpdate` set clause resets the timestamp every scan cycle. Dirty age tracking (3-day and 7-day severity escalation) silently never fires because the age is always < 5 minutes.
**Why it happens:** SQLite `INSERT OR REPLACE` is DELETE + INSERT, not in-place update. Even with `onConflictDoUpdate`, if `detectedAt` is in the `set` clause, it gets overwritten.
**How to avoid:** Use explicit SELECT-then-UPDATE/INSERT. Never include `detectedAt` in any UPDATE operation. Write a regression test: insert finding with 4-day-old `detectedAt`, run upsert, assert timestamp unchanged.
**Warning signs:** Health findings all have `detectedAt` within the last 5 minutes; severity never escalates past initial detection.

### Pitfall 2: Partial Unique Index Trap
**What goes wrong:** Creating a unique index on `(project_slug, check_type) WHERE resolved_at IS NULL` and attempting to use it with `onConflictDoUpdate`. SQLite does not support WHERE clauses in ON CONFLICT target specifications.
**Why it happens:** PostgreSQL supports this, and many tutorials show it. Drizzle's `targetWhere` property exists but does not work correctly with SQLite's conflict resolution.
**How to avoid:** Do not create a partial unique index for conflict resolution. Use a regular (non-unique) index on `(project_slug, check_type)` for query performance, and handle uniqueness in application logic via the SELECT-then-UPDATE/INSERT pattern.
**Warning signs:** `SQLITE_ERROR` during upsert, or duplicate active findings for the same `(projectSlug, checkType)`.

### Pitfall 3: Migration Journal Out of Sync
**What goes wrong:** Adding a migration SQL file but forgetting to update `drizzle/meta/_journal.json`. Drizzle runs migrations based on the journal -- if the entry is missing, the migration silently does not run. Tables don't get created, but no error is thrown until a query references them.
**Why it happens:** Manual migration workflow. Drizzle-kit `generate` auto-updates the journal, but hand-written migrations need manual journal entries.
**How to avoid:** Always add the journal entry when creating a migration SQL file. Verify by checking `sqlite3 data/mission-control.db ".tables"` after restart.
**Warning signs:** "Table not found" errors at runtime, or `SELECT * FROM project_health` returning "no such table".

### Pitfall 4: Config Schema Breaking Existing Entries
**What goes wrong:** The `z.union()` for project entries fails on existing single-host entries because the multi-copy schema is tried first and fails, or the union parsing gives confusing error messages.
**Why it happens:** `z.union()` tries schemas in order and reports the last failure. If the multi-copy schema fails with a cryptic error, it masks the real issue in the single-host schema.
**How to avoid:** Put the single-host schema first in the union (most entries match it). Add a discriminator check: if the entry has `copies` array, use multi-copy schema; otherwise use single-host schema. Consider `z.union()` with custom error mapping, or use a manual discriminator pattern.
**Warning signs:** Config parsing fails on startup with errors about `copies` field on entries that don't have it.

### Pitfall 5: Text vs Integer Timestamp Mismatch
**What goes wrong:** New tables use `text` ISO timestamps while existing tables use `integer` Unix timestamps. Queries that join across tables (e.g., `project_health.detectedAt` vs `projects.lastScannedAt`) need format conversion, leading to bugs in comparisons.
**Why it happens:** Two different timestamp conventions in the same database.
**How to avoid:** Be explicit about the format difference in query code. Always use ISO string comparison for health-related timestamps. Never compare text ISO timestamps directly with integer Unix timestamps without conversion. Document the convention difference in code comments.
**Warning signs:** Incorrect age calculations, wrong sort order when mixing timestamp formats.

## Code Examples

Verified patterns from the existing codebase:

### Migration SQL File Structure
```sql
-- Source: packages/api/drizzle/0004_port_registry.sql (existing pattern)
CREATE TABLE `project_health` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_slug` text NOT NULL,
	`check_type` text NOT NULL,
	`severity` text NOT NULL,
	`detail` text NOT NULL,
	`metadata` text,
	`detected_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `health_slug_check_idx` ON `project_health` (`project_slug`, `check_type`);--> statement-breakpoint
CREATE INDEX `health_resolved_idx` ON `project_health` (`resolved_at`);--> statement-breakpoint
CREATE INDEX `health_slug_resolved_idx` ON `project_health` (`project_slug`, `resolved_at`);--> statement-breakpoint
CREATE TABLE `project_copies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_slug` text NOT NULL,
	`host` text NOT NULL,
	`path` text NOT NULL,
	`remote_url` text,
	`head_commit` text,
	`branch` text,
	`is_public` integer,
	`last_checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `copies_slug_host_uniq` ON `project_copies` (`project_slug`, `host`);--> statement-breakpoint
CREATE INDEX `copies_remote_url_idx` ON `project_copies` (`remote_url`);
```

### Migration Journal Entry
```json
// Source: packages/api/drizzle/meta/_journal.json (existing pattern)
{
  "idx": 5,
  "version": "6",
  "when": 1773800000000,
  "tag": "0005_git_health",
  "breakpoints": true
}
```

### Query Function Signature Pattern
```typescript
// Source: packages/api/src/db/queries/projects.ts (existing pattern)
import { eq, and, sql, isNull } from "drizzle-orm";
import type { DrizzleDb } from "../index.js";
import type Database from "better-sqlite3";
import { projectHealth } from "../schema.js";

// Pure function, db injected, synchronous for better-sqlite3
export function getActiveFindings(db: DrizzleDb, projectSlug?: string) {
  const conditions = [isNull(projectHealth.resolvedAt)];
  if (projectSlug) {
    conditions.push(eq(projectHealth.projectSlug, projectSlug));
  }
  return db
    .select()
    .from(projectHealth)
    .where(and(...conditions))
    .all();
}
```

### Resolve Finding Pattern
```typescript
// Source: Derived from existing patterns
export function resolveFindings(
  sqlite: Database.Database,
  projectSlug: string,
  activeCheckTypes: string[]
): void {
  // Resolve any active findings whose check type is NOT in the current active set
  const placeholders = activeCheckTypes.map(() => "?").join(",");
  const query = activeCheckTypes.length > 0
    ? `UPDATE project_health SET resolved_at = ? WHERE project_slug = ? AND resolved_at IS NULL AND check_type NOT IN (${placeholders})`
    : `UPDATE project_health SET resolved_at = ? WHERE project_slug = ? AND resolved_at IS NULL`;

  const now = new Date().toISOString();
  const params = activeCheckTypes.length > 0
    ? [now, projectSlug, ...activeCheckTypes]
    : [now, projectSlug];

  sqlite.prepare(query).run(...params);
}
```

### Zod Re-export Pattern
```typescript
// Source: packages/shared/src/index.ts (existing pattern)
export {
  healthCheckTypeEnum,
  healthSeverityEnum,
  riskLevelEnum,
  healthFindingSchema,
  projectCopySchema,
  copyHostEnum,
} from "./schemas/health.js";

export type {
  HealthFinding,
  ProjectCopy,
  HealthCheckType,
  HealthSeverity,
  RiskLevel,
} from "./types/index.js";
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `INSERT OR REPLACE` for upserts | `onConflictDoUpdate` or explicit SELECT-then-UPDATE/INSERT | SQLite 3.24+ (2018) | Preserves existing row data on conflict instead of DELETE+INSERT |
| Integer Unix timestamps | Text ISO 8601 timestamps | Design spec decision | Better human readability, simpler age calculations, no epoch conversion |
| Text UUID primary keys | Integer auto-increment PKs | Design spec decision for internal tables | Simpler, smaller, faster for non-externally-referenced records |

**Deprecated/outdated:**
- `INSERT OR REPLACE`: Still valid SQL but destroys row data. Never use for health findings.

## Open Questions

1. **Drizzle autoIncrement integer PK column definition**
   - What we know: Drizzle supports `integer("id").primaryKey({ autoIncrement: true })` for SQLite. The existing codebase uses text PKs exclusively.
   - What's unclear: Whether the generated SQL matches what we need (`INTEGER PRIMARY KEY AUTOINCREMENT`). Need to verify the exact SQL output.
   - Recommendation: Write the Drizzle schema definition and verify the generated migration SQL matches expectations. If not, hand-write the SQL and verify.

2. **Timestamp format interop between tables**
   - What we know: Existing tables use `integer` mode timestamps (Unix epoch). New tables will use `text` ISO timestamps.
   - What's unclear: Whether any Phase 7+ queries will need to JOIN health tables with project tables and compare timestamps across formats.
   - Recommendation: Proceed with text ISO for new tables per spec. Document the convention difference. If cross-format joins are needed later, SQLite's `datetime()` function can convert between formats.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (latest, via pnpm) |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HLTH-09 | Health finding upsert preserves detectedAt | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/db/queries/health.test.ts` | No - Wave 0 |
| HLTH-09 | Resolved findings get resolvedAt timestamp | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/db/queries/health.test.ts` | No - Wave 0 |
| HLTH-09 | Re-detected issue after resolution creates new row | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/db/queries/health.test.ts` | No - Wave 0 |
| HLTH-10 | GitHub-only projects have null health score in schema | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/db/queries/health.test.ts` | No - Wave 0 |
| COPY-02 | Config parses single-host entries correctly | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/lib/config.test.ts` | No - Wave 0 |
| COPY-02 | Config parses multi-host entries correctly | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/lib/config.test.ts` | No - Wave 0 |
| COPY-02 | Existing mc.config.json parses without error | integration | `pnpm --filter @mission-control/api test -- --run src/__tests__/lib/config.test.ts` | No - Wave 0 |
| COPY-02 | Project copies upsert by (slug, host) | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/db/queries/copies.test.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/db/queries/health.test.ts` -- covers HLTH-09, HLTH-10
- [ ] `packages/api/src/__tests__/db/queries/copies.test.ts` -- covers COPY-02 (data layer)
- [ ] `packages/api/src/__tests__/lib/config.test.ts` -- covers COPY-02 (config parsing)
- No framework install needed -- Vitest already configured and working

## Sources

### Primary (HIGH confidence)
- Mission Control codebase -- direct examination of `schema.ts`, `projects.ts`, `commits.ts`, `config.ts`, `db/index.ts`, `shared/src/index.ts`, `shared/src/types/index.ts`, `shared/src/schemas/port.ts`, `shared/src/schemas/project.ts`, migration files, test infrastructure
- [Drizzle ORM Insert docs](https://orm.drizzle.team/docs/insert) -- `onConflictDoUpdate` API with `target`, `targetWhere`, `setWhere`, and composite target support
- [Drizzle ORM Issue #2998](https://github.com/drizzle-team/drizzle-orm/issues/2998) -- Confirmed: `onConflictDoUpdate` target must reference an actual unique constraint or primary key, not a subset of one. RESOLVED/COMPLETED.
- [SQLite UPSERT documentation](https://sqlite.org/lang_upsert.html) -- Conflict target must be explicit UNIQUE or PRIMARY KEY constraint. WHERE clause support in ON CONFLICT is limited/not supported for partial indexes.
- [SQLite Forum: UPSERT with partial indexes](https://sqlite.org/forum/info/9c88abe93ab8c05d26b247960618a94a3d6ac18c018f61e013ef52f99bd3774e) -- Confirmed limitation: SQLite ON CONFLICT does not reliably support WHERE clauses for partial unique index matching.
- Design spec: `docs/superpowers/specs/2026-03-14-git-health-intelligence-design.md` -- Table schemas, column types, upsert semantics, config format

### Secondary (MEDIUM confidence)
- [Drizzle ORM Upsert Guide](https://orm.drizzle.team/docs/guides/upsert) -- General upsert patterns
- [Drizzle ORM Issue #1628](https://github.com/drizzle-team/drizzle-orm/issues/1628) -- WHERE clause handling in `onConflictDoNothing` for partial indexes, confirming limitations extend to `onConflictDoUpdate`

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all existing patterns
- Architecture: HIGH -- direct codebase examination, established patterns for every concern
- Pitfalls: HIGH -- SQLite upsert limitation verified against official docs and Drizzle issues; `detectedAt` preservation strategy validated against codebase's existing upsert patterns

**Research date:** 2026-03-14
**Valid until:** Indefinite (stable SQLite semantics, stable Drizzle ORM patterns, no fast-moving dependencies)
