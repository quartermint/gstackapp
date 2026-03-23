# Phase 23: Config Foundation - Research

**Researched:** 2026-03-21
**Domain:** Zod schema extension, SQLite migration patterns, idempotency, graph cycle detection
**Confidence:** HIGH

## Summary

Phase 23 is pure infrastructure: extending existing schemas and adding one new API behavior (idempotency). All four requirements map cleanly onto existing codebase patterns with zero new dependencies. The codebase already uses Zod for all API boundaries, hand-written SQL migrations with Drizzle's migrator, and a well-tested health findings system.

The key insight is that this phase requires zero new libraries. The `dependsOn` field is a simple array addition to the config schema. Cycle detection is a textbook DFS problem (10-15 lines). Idempotency uses an `Idempotency-Key` header with a SQLite lookup. Health check types are a Zod enum extension with no DB migration required (SQLite stores them as plain TEXT).

**Primary recommendation:** Extend existing patterns in-place. No new dependencies, no new tables. The only migration needed is for the idempotency key tracking table.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion for this infrastructure phase.

### Claude's Discretion
All implementation choices are at Claude's discretion -- pure infrastructure phase.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | API captures endpoint accepts idempotency key to prevent duplicate captures from offline queue retries | Idempotency via `Idempotency-Key` header; existing captures POST route needs header extraction + dedup lookup table |
| FOUND-02 | Config schema supports `dependsOn` field on project entries with cycle detection at load time | Zod schema extension on `projectEntrySchema` + `multiCopyEntrySchema`; DFS cycle detection in `loadConfig()` |
| FOUND-03 | Health check enum extended with `dependency_impact`, `convention_violation`, and `stale_knowledge` check types | Zod enum extension in `packages/shared/src/schemas/health.ts`; no DB migration needed (TEXT column) |
| INTEL-01 | User can define project dependency relationships via `dependsOn` in mc.config.json | Same implementation as FOUND-02; config schema + validation |
</phase_requirements>

## Standard Stack

### Core (already in project -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^3.24.0 | Schema validation for config, API boundaries | Already used everywhere in project |
| drizzle-orm | ^0.38.0 | Database ORM + migration runner | Already used for all DB operations |
| better-sqlite3 | ^11.7.0 | SQLite driver | Already the DB engine |
| hono | ^4.6.0 | API framework | Already the API layer |
| nanoid | ^5.0.0 | ID generation | Already used for capture IDs |

### Supporting
None needed. This phase adds zero new dependencies.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled cycle detection | graphlib / toposort npm packages | Overkill for ~30 nodes; DFS is 15 lines and zero deps |
| `Idempotency-Key` header | Reuse existing `clientId` body field | Header is the HTTP standard (IETF RFC 8942); body field is client-side only |
| In-memory idempotency cache | SQLite table | Must survive server restart (Mac Mini service auto-restarts) |

## Architecture Patterns

### Recommended Changes Structure
```
packages/
├── shared/src/schemas/
│   ├── health.ts              # Add 3 new enum values
│   └── capture.ts             # No changes needed (header, not body)
├── api/src/
│   ├── lib/config.ts          # Add dependsOn to schemas + cycle detection
│   ├── routes/captures.ts     # Add Idempotency-Key header handling
│   ├── db/schema.ts           # Add idempotency_keys table
│   └── db/queries/
│       └── idempotency.ts     # New: check/store idempotency keys
├── api/drizzle/
│   └── 0008_idempotency.sql   # New migration for idempotency table
└── api/src/__tests__/
    ├── lib/config.test.ts     # Add dependsOn + cycle detection tests
    └── routes/captures.test.ts # Add idempotency header tests
```

### Pattern 1: Zod Enum Extension (FOUND-03)
**What:** Adding new values to an existing z.enum
**When to use:** When the health check system needs new check types
**Example:**
```typescript
// packages/shared/src/schemas/health.ts
export const healthCheckTypeEnum = z.enum([
  "unpushed_commits",
  "no_remote",
  "broken_tracking",
  "remote_branch_gone",
  "unpulled_commits",
  "dirty_working_tree",
  "diverged_copies",
  "session_file_conflict",
  "convergence",
  // v1.4 additions
  "dependency_impact",
  "convention_violation",
  "stale_knowledge",
]);
```
**Key fact:** The `project_health` table stores `check_type` as a plain TEXT column (no CHECK constraint, no SQLite enum). The Zod enum is the only enforcement point. Adding new values to the Zod enum is the complete change -- no DB migration required for this.

### Pattern 2: Config Schema Extension (FOUND-02, INTEL-01)
**What:** Adding `dependsOn` optional field to both project entry schemas
**When to use:** Project dependency declarations in mc.config.json
**Example:**
```typescript
// packages/api/src/lib/config.ts
export const projectEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  path: z.string(),
  host: z.enum(["local", "mac-mini", "github"]),
  tagline: z.string().optional(),
  repo: z.string().optional(),
  dependsOn: z.array(z.string()).optional().default([]),
});

// Same addition to multiCopyEntrySchema
```
**Backward compatibility:** `.optional().default([])` means existing configs without `dependsOn` parse without error.

### Pattern 3: DFS Cycle Detection (FOUND-02)
**What:** Validate no circular dependencies at config load time
**When to use:** After Zod parsing, before returning config
**Example:**
```typescript
// packages/api/src/lib/config.ts
function detectCycles(projects: ProjectConfigEntry[]): string[] | null {
  const graph = new Map<string, string[]>();
  for (const p of projects) {
    graph.set(p.slug, p.dependsOn ?? []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): string[] | null {
    if (inStack.has(node)) {
      // Found cycle -- return path from cycle start
      const cycleStart = path.indexOf(node);
      return [...path.slice(cycleStart), node];
    }
    if (visited.has(node)) return null;

    visited.add(node);
    inStack.add(node);

    for (const dep of graph.get(node) ?? []) {
      const cycle = dfs(dep, [...path, node]);
      if (cycle) return cycle;
    }

    inStack.delete(node);
    return null;
  }

  for (const slug of graph.keys()) {
    const cycle = dfs(slug, []);
    if (cycle) return cycle;
  }

  return null;
}
```
**Error message format:** `"Circular dependency detected: mission-control -> nexusclaw -> mission-control"`

### Pattern 4: Idempotency Key (FOUND-01)
**What:** Server-side deduplication via `Idempotency-Key` header
**When to use:** POST /api/captures to prevent duplicate captures from offline queue retries
**Example:**
```typescript
// packages/api/src/routes/captures.ts (inside POST handler)
const idempotencyKey = c.req.header("Idempotency-Key");

if (idempotencyKey) {
  const existing = getIdempotencyResult(getInstance().db, idempotencyKey);
  if (existing) {
    // Return the previously created capture
    const capture = getCapture(getInstance().db, existing.captureId);
    return c.json({ capture }, 201);
  }
}

// ... create capture as normal ...

if (idempotencyKey) {
  storeIdempotencyKey(getInstance().db, idempotencyKey, capture.id);
}
```

### Anti-Patterns to Avoid
- **Don't add CHECK constraints to SQLite for enum columns:** The project consistently uses TEXT columns with Zod validation at the application layer. Adding a CHECK constraint would break this pattern and make future enum additions require migrations.
- **Don't use in-memory caches for idempotency:** The Mac Mini service auto-restarts. Idempotency keys must survive restarts. Use SQLite.
- **Don't validate `dependsOn` slugs against the projects array:** A project may depend on a slug that exists in a different config (Mac Mini config has different projects). Only validate for cycles, not for existence.
- **Don't store idempotency keys forever:** Add a TTL. 24 hours is sufficient for offline queue retries. A cleanup job or TTL-based query is needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cycle detection | Graph library dependency | 15-line DFS in config.ts | Graph is <50 nodes, DFS is trivial, zero deps |
| UUID generation for idempotency | Custom UUID | Client generates the key (UUID v4 or nanoid) | Server only stores and looks up keys |

**Key insight:** This phase is small enough that everything is hand-rolled. No libraries needed because the problems are all well-bounded.

## Common Pitfalls

### Pitfall 1: Zod Union Discrimination with `dependsOn`
**What goes wrong:** Adding `dependsOn` to `projectEntrySchema` but forgetting `multiCopyEntrySchema` causes multi-copy entries to silently drop the field.
**Why it happens:** `projectConfigEntrySchema` is a `z.union([projectEntrySchema, multiCopyEntrySchema])` -- both branches must have `dependsOn`.
**How to avoid:** Add `dependsOn` to BOTH schemas. Verify with a test that multi-copy entries preserve `dependsOn`.
**Warning signs:** Multi-copy project dependencies silently ignored in cycle detection.

### Pitfall 2: Idempotency Key Table Growth
**What goes wrong:** Idempotency keys accumulate forever, bloating the database.
**Why it happens:** No TTL or cleanup mechanism.
**How to avoid:** Add a `created_at` timestamp column. Purge keys older than 24 hours during scan cycles or on a separate timer. The scan cycle already runs every 5 minutes -- piggyback on it.
**Warning signs:** Growing idempotency_keys table with no cleanup.

### Pitfall 3: Cycle Detection on Non-Existent Slugs
**What goes wrong:** `dependsOn: ["nonexistent-project"]` -- should this error?
**Why it happens:** The user might reference a project that's in the Mac Mini config but not the local config.
**How to avoid:** Only detect cycles. Do NOT validate that referenced slugs exist. Log a warning for unresolved slugs at info level, but don't fail. The cycle detection DFS naturally skips nodes with no outgoing edges.
**Warning signs:** Config load failure on valid cross-config references.

### Pitfall 4: Idempotency Race Condition
**What goes wrong:** Two identical requests arrive simultaneously, both pass the dedup check, both insert.
**Why it happens:** The check-then-insert is not atomic.
**How to avoid:** Use a UNIQUE constraint on the idempotency key column. The second insert will fail with SQLITE_CONSTRAINT. Catch this and return the existing capture. Alternatively, wrap check+insert in a SQLite transaction (the project already uses this pattern in `upsertHealthFinding`).
**Warning signs:** Duplicate captures despite idempotency header.

### Pitfall 5: Migration Journal Consistency
**What goes wrong:** Adding a new migration file (0008) but forgetting to update `_journal.json`, causing Drizzle migrator to skip it.
**Why it happens:** Migrations in this project are hand-written, not auto-generated by `drizzle-kit generate`.
**How to avoid:** Add both the `.sql` file AND the corresponding entry in `drizzle/meta/_journal.json`. Check that the `idx` is sequential and the `tag` matches the filename.
**Warning signs:** Migration runs silently without creating the table.

### Pitfall 6: Header Extraction Case Sensitivity
**What goes wrong:** `Idempotency-Key` header not found because of case mismatch.
**Why it happens:** HTTP headers are case-insensitive per spec, but implementations vary.
**How to avoid:** Hono's `c.req.header("Idempotency-Key")` is case-insensitive (Hono normalizes headers). This is safe. Verify with a test using lowercase `idempotency-key`.
**Warning signs:** Tests pass with exact case but fail with lowercase.

## Code Examples

### Idempotency Keys Table Schema
```typescript
// packages/api/src/db/schema.ts
export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    captureId: text("capture_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idempotency_created_at_idx").on(table.createdAt),
  ]
);
```

### Migration SQL
```sql
-- packages/api/drizzle/0008_idempotency.sql
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`capture_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idempotency_created_at_idx` ON `idempotency_keys` (`created_at`);
```

### Idempotency Key Queries
```typescript
// packages/api/src/db/queries/idempotency.ts
import { eq, lt } from "drizzle-orm";
import type { DrizzleDb } from "../index.js";
import { idempotencyKeys } from "../schema.js";

export function checkIdempotencyKey(
  db: DrizzleDb,
  key: string
): { captureId: string } | undefined {
  return db
    .select({ captureId: idempotencyKeys.captureId })
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .get();
}

export function storeIdempotencyKey(
  db: DrizzleDb,
  key: string,
  captureId: string
): void {
  db.insert(idempotencyKeys)
    .values({ key, captureId, createdAt: new Date() })
    .run();
}

export function purgeExpiredKeys(db: DrizzleDb, ttlMs: number = 86_400_000): void {
  const cutoff = new Date(Date.now() - ttlMs);
  db.delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, cutoff))
    .run();
}
```

### Config with dependsOn
```json
{
  "projects": [
    {
      "name": "Mission Control",
      "slug": "mission-control",
      "path": "/Users/ryanstern/mission-control",
      "host": "local",
      "tagline": "Personal operating environment"
    },
    {
      "name": "NexusClaw",
      "slug": "nexusclaw",
      "path": "/Users/ryanstern/nexusclaw",
      "host": "local",
      "dependsOn": ["mission-control"],
      "tagline": "Native iOS client for ZeroClaw AI gateway"
    }
  ]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `clientId` in request body for client-side dedup | `Idempotency-Key` header for server-side dedup (IETF RFC 8942) | RFC published 2023 | Standard pattern for retry-safe APIs |
| DB-level enum constraints | App-level Zod enum with TEXT columns | Project convention since v1.0 | New check types never need migrations |

**Deprecated/outdated:**
- None relevant to this phase.

## Open Questions

1. **Idempotency key TTL duration**
   - What we know: 24 hours covers all realistic offline queue scenarios (iOS app might be offline for hours but not days)
   - What's unclear: Whether 24 hours is aggressive enough or too aggressive
   - Recommendation: Default 24 hours, configurable in mc.config.json if needed later. Start with 24h.

2. **Should `dependsOn` reference validation warn or silently skip?**
   - What we know: Cross-config references are valid (Mac Mini config has different projects)
   - What's unclear: Whether unresolved references should produce console warnings
   - Recommendation: Log at debug level only. No warnings -- unresolved refs are expected in split-config scenarios.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via pnpm test) |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | Idempotency-Key header deduplicates captures | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/captures.test.ts -x` | Exists (extend) |
| FOUND-02 | dependsOn field accepted in config; cycles rejected | unit | `pnpm --filter @mission-control/api test -- src/__tests__/lib/config.test.ts -x` | Exists (extend) |
| FOUND-03 | New health check types accepted by schema | unit | `pnpm --filter @mission-control/api test -- src/__tests__/db/queries/health.test.ts -x` | Exists (extend) |
| INTEL-01 | dependsOn in mc.config.json loads without error | unit | `pnpm --filter @mission-control/api test -- src/__tests__/lib/config.test.ts -x` | Exists (extend) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. Tests extend existing files:
- `config.test.ts` -- add `dependsOn` parsing and cycle detection cases
- `captures.test.ts` -- add `Idempotency-Key` header cases
- `health.test.ts` -- add new check type cases

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- all findings verified by direct file reads:
  - `packages/shared/src/schemas/health.ts` -- current healthCheckTypeEnum values
  - `packages/api/src/lib/config.ts` -- config schema and loading
  - `packages/api/src/db/schema.ts` -- all table definitions (TEXT columns, no CHECK constraints)
  - `packages/api/src/routes/captures.ts` -- current POST handler implementation
  - `packages/api/drizzle/0005_git_health.sql` -- health table creation (no enum constraint)
  - `packages/api/drizzle/meta/_journal.json` -- migration journal format (8 entries, idx 0-7)
  - `packages/api/src/db/queries/health.ts` -- upsertHealthFinding pattern (transaction + SELECT-then-UPDATE/INSERT)

### Secondary (MEDIUM confidence)
- IETF RFC 8942 (The Idempotency-Key HTTP Header Field) -- standard for idempotent request handling

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all patterns verified in codebase
- Architecture: HIGH -- extending existing patterns, no new architectural decisions
- Pitfalls: HIGH -- derived from actual codebase inspection (union discrimination, migration journal, SQLite TEXT columns)

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- infrastructure phase with no external dependency concerns)
