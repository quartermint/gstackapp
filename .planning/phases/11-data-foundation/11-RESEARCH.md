# Phase 11: Data Foundation - Research

**Researched:** 2026-03-16
**Domain:** Drizzle ORM schema, Zod type system, model tier derivation, infrastructure scripts
**Confidence:** HIGH

## Summary

Phase 11 is a pure data-layer phase -- no API routes, no dashboard, no hooks. It lays the schema, types, configuration, and infrastructure that Phases 12-15 build on. The existing codebase has mature, well-documented patterns for all four deliverables: Drizzle table definitions in `schema.ts`, Zod schemas in `packages/shared/src/schemas/`, config extension with backward-compatible defaults in `lib/config.ts`, and numbered SQL migrations in `packages/api/drizzle/`.

The one significant research finding that contradicts the CONTEXT.md assumption: **HTTP hooks are NOT fire-and-forget**. Claude Code waits for the HTTP response (up to the configured timeout, default 30s). Only command hooks support `"async": true` for true fire-and-forget. This does not block Phase 11 (schemas/types only), but it informs how the Zod schemas should be designed -- the MC API must respond quickly (< 100ms) so HTTP hook latency stays acceptable, and the session creation endpoint should do minimal work synchronously.

**Primary recommendation:** Follow exact existing patterns -- new table in `schema.ts`, new Zod schema file, additive config with defaults, hand-written SQL migration file + journal entry. No new dependencies needed for this phase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `sessions` table follows existing Drizzle patterns: text IDs, integer timestamps with `mode: "timestamp"`
- `budget_entries` not needed as separate table -- budget is derived from session data (count by tier, group by week)
- `filesJson` stored as TEXT (JSON array of absolute file paths) on the sessions table -- no separate join table
- Status enum: `active`, `completed`, `abandoned` -- matches existing pattern from captures table
- Model tier derivation: Parse from model string prefix: `startsWith('claude-opus')` -> opus, `startsWith('claude-sonnet')` -> sonnet, everything else -> local
- Config-driven tier mapping in `mc.config.json` with regex patterns for future-proofing
- Default to "unknown" tier for unrecognized model strings, log a warning
- Use HTTP hooks (not command hooks) for session reporting -- Claude's discretion on implementation
- Hook events: SessionStart (create session), Stop (mark completed), PostToolUse for Write/Edit only (heartbeat with files_touched)
- New Zod file: `packages/shared/src/schemas/session.ts`
- Tier enum values: `opus`, `sonnet`, `local`, `unknown`
- INFR-01: Minimal deployment scripts following mac-mini-ops v1.0 conventions, `/opt/services/mission-control/`, svc CLI compatible

### Claude's Discretion
- INFR-01 implementation details (user did not need to weigh in)
- Hook strategy implementation (HTTP hooks preferred, fire-and-forget semantics)

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SESS-02 | MC stores session lifecycle with status machine (active -> completed/abandoned) | Sessions table schema with status enum, Drizzle table definition pattern from captures table, Zod schemas for session lifecycle types |
| BUDG-01 | MC derives model tier from session model string (opus/sonnet/local) | Model tier derivation function with prefix matching + config-driven regex patterns, tier enum in Zod schemas |
| INFR-01 | Update MC infra/ scripts to use svc conventions and /opt/services/ paths | Launchd plist + install script following mac-mini-ops conventions, backward-compatible config loading |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.38.4 | Schema definition + type-safe queries | Already powers all MC tables |
| drizzle-kit | 0.30.6 | Migration generation | Already generates MC migrations |
| zod | 3.24.x | Schema validation at API boundaries | Already used for all shared schemas |
| better-sqlite3 | 11.7.x | SQLite driver | Already the MC database driver |
| nanoid | 5.x | ID generation for new rows | Already used in captures, ports, etc. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 2.1.x | Testing | Already configured for all packages |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Text ID (nanoid) | Integer autoincrement | CC provides session_id as text; using text matches source data + captures pattern |
| JSON text column for files | Normalized join table | Single-user, no need for relational file queries; JSON text is simpler and matches existing metadata columns |
| Separate budget_entries table | Derived from sessions | User decision: budget is count-by-tier-per-week derived from sessions, not a separate ledger |

**Installation:**
```bash
# No new dependencies needed for Phase 11
# All required libraries already installed
```

## Architecture Patterns

### Recommended Project Structure

New files and modifications for Phase 11:
```
packages/
  api/
    drizzle/
      0006_sessions.sql              # NEW: migration SQL
      meta/
        _journal.json                # MODIFY: add entry for 0006
    src/
      db/
        schema.ts                    # MODIFY: add sessions table
        queries/
          sessions.ts                # NEW: session CRUD queries
      lib/
        config.ts                    # MODIFY: add models section
        model-tier.ts                # NEW: tier derivation function
  shared/
    src/
      schemas/
        session.ts                   # NEW: Zod schemas
      types/
        index.ts                     # MODIFY: add session types
      index.ts                       # MODIFY: export session schemas
infra/                               # NEW: deployment scripts
  install.sh                         # install script
  mission-control.plist              # launchd plist
```

### Pattern 1: Drizzle Table Definition (from schema.ts)

**What:** Define tables using `sqliteTable()` with text IDs, integer timestamps, and inline index definitions.
**When to use:** Every new table.
**Example:**
```typescript
// Source: packages/api/src/db/schema.ts (captures table pattern)
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),                    // CC session_id or nanoid
    source: text("source", {
      enum: ["claude-code", "aider"],
    }).notNull(),
    model: text("model"),                           // raw model string
    tier: text("tier", {
      enum: ["opus", "sonnet", "local", "unknown"],
    }).notNull(),
    projectSlug: text("project_slug"),              // nullable - resolved from cwd
    cwd: text("cwd").notNull(),
    status: text("status", {
      enum: ["active", "completed", "abandoned"],
    }).notNull().default("active"),
    filesJson: text("files_json"),                  // JSON array of file paths
    taskDescription: text("task_description"),
    stopReason: text("stop_reason"),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp" }),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("sessions_status_idx").on(table.status),
    index("sessions_project_slug_idx").on(table.projectSlug),
    index("sessions_started_at_idx").on(table.startedAt),
    index("sessions_tier_idx").on(table.tier),
  ]
);
```

**Key conventions from existing schema:**
- Text primary keys (never autoincrement for domain tables -- only health/copies use autoincrement)
- `integer("col", { mode: "timestamp" })` for all timestamps (returns Date objects from Drizzle)
- Inline enum via `text("col", { enum: [...] })`
- Index definitions in the third argument function using array syntax
- `notNull()` chained after type, `.default()` for status columns

### Pattern 2: Zod Schema File (from schemas/health.ts)

**What:** One Zod schema file per domain. Exports enums, input schemas, response schemas.
**When to use:** Every new API boundary type.
**Example:**
```typescript
// Source: packages/shared/src/schemas/session.ts (following health.ts pattern)
import { z } from "zod";

export const sessionSourceEnum = z.enum(["claude-code", "aider"]);
export const sessionStatusEnum = z.enum(["active", "completed", "abandoned"]);
export const modelTierEnum = z.enum(["opus", "sonnet", "local", "unknown"]);

export const createSessionSchema = z.object({
  sessionId: z.string().min(1),
  source: sessionSourceEnum,
  model: z.string().nullable().optional(),
  cwd: z.string().min(1),
  taskDescription: z.string().nullable().optional(),
});

export const heartbeatSchema = z.object({
  filesTouched: z.array(z.string()).optional(),
  toolName: z.string().optional(),
});

// ... response schemas, list query schemas
```

**Conventions from existing schemas:**
- Enums exported separately for reuse
- Input schemas have `min(1)` on required strings
- Nullable fields use `.nullable().optional()` pattern
- Response schemas extend base schemas with computed fields (like `healthFindingResponseSchema.extend({ isNew })`)

### Pattern 3: Config Extension with Backward Compatibility (from lib/config.ts)

**What:** Add new optional section to `mcConfigSchema` with defaults so existing configs load without changes.
**When to use:** Any new config section.
**Example:**
```typescript
// Source: packages/api/src/lib/config.ts
// Existing pattern: z.array().default([]) and z.string().default("value")

const modelTierMappingSchema = z.object({
  pattern: z.string(),      // regex pattern to match model strings
  tier: z.enum(["opus", "sonnet", "local"]),
});

export const mcConfigSchema = z.object({
  projects: z.array(projectConfigEntrySchema),
  dataDir: z.string().default("./data"),
  services: z.array(serviceEntrySchema).default([]),
  macMiniSshHost: z.string().default("ryans-mac-mini"),
  // NEW: model tier mapping with sensible defaults
  modelTiers: z.array(modelTierMappingSchema).default([
    { pattern: "^claude-opus", tier: "opus" },
    { pattern: "^claude-sonnet", tier: "sonnet" },
  ]),
});
```

**Critical:** Using `.default([...])` ensures existing `mc.config.json` files without a `modelTiers` key still parse successfully. Tested via existing config test pattern.

### Pattern 4: Hand-Written SQL Migration (from drizzle/0005_git_health.sql)

**What:** Write the migration SQL directly. Add entry to `_journal.json`. Generate snapshot via `drizzle-kit` or skip (project has migrations without corresponding snapshots).
**When to use:** When adding new tables (not modifying existing).
**Example:**
```sql
-- 0006_sessions.sql
CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `source` text NOT NULL,
  `model` text,
  `tier` text NOT NULL,
  `project_slug` text,
  `cwd` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `files_json` text,
  `task_description` text,
  `stop_reason` text,
  `started_at` integer NOT NULL,
  `last_heartbeat_at` integer,
  `ended_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`);
--> statement-breakpoint
CREATE INDEX `sessions_project_slug_idx` ON `sessions` (`project_slug`);
--> statement-breakpoint
CREATE INDEX `sessions_started_at_idx` ON `sessions` (`started_at`);
--> statement-breakpoint
CREATE INDEX `sessions_tier_idx` ON `sessions` (`tier`);
```

**Journal entry format:**
```json
{
  "idx": 6,
  "version": "6",
  "when": <epoch_ms>,
  "tag": "0006_sessions",
  "breakpoints": true
}
```

### Pattern 5: Query Module (from db/queries/captures.ts)

**What:** Pure functions that take `DrizzleDb` and return typed results. Used by routes and services.
**When to use:** Every table needs a query module.
**Example:**
```typescript
// Source: packages/api/src/db/queries/captures.ts pattern
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { sessions } from "../schema.js";
import type { CreateSession } from "@mission-control/shared";

export function createSession(db: DrizzleDb, data: CreateSession) {
  const now = new Date();
  const id = data.sessionId; // Use CC-provided session ID
  db.insert(sessions).values({
    id,
    source: data.source,
    model: data.model ?? null,
    tier: deriveTier(data.model),
    cwd: data.cwd,
    status: "active",
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  }).run();
  return getSession(db, id);
}
```

### Pattern 6: Type Export Registration (from shared/src/types/index.ts + index.ts)

**What:** Every new schema requires adding type exports to `types/index.ts` and schema exports to `index.ts`.
**When to use:** Every new schema file.

The shared package has a three-file registration pattern:
1. `schemas/session.ts` -- define schemas
2. `types/index.ts` -- add `export type Session = z.infer<typeof sessionSchema>;`
3. `index.ts` -- add `export { ... } from "./schemas/session.js";` and `export type { ... } from "./types/index.js";`

### Anti-Patterns to Avoid

- **Separate budget_entries table:** User decision locks this -- budget is derived from sessions, not a separate table. Do not create a `session_budgets` or `budget_entries` table.
- **`mode: "timestamp"` inconsistency:** The existing codebase uses `integer("col", { mode: "timestamp" })` for all timestamp columns in domain tables. Do NOT use `text` columns with ISO strings for timestamps (even though `projectHealth` uses text dates -- that was a v1.1 pattern that was not carried forward).
- **Foreign key to projects table:** `projectSlug` on sessions should NOT have a foreign key constraint. Sessions may reference projects before they're scanned. Match via config path resolution, not database FK.
- **Over-engineering tier derivation:** The function should be 10-15 lines, not a class hierarchy. `startsWith` checks + config regex fallback is sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration SQL | Hand-constructing CREATE TABLE strings | Drizzle-kit generate or hand-write matching schema.ts | Drizzle runs migrations on startup via `migrate()` -- just needs valid SQL + journal entry |
| ID generation | UUID/crypto functions | `nanoid` (already in deps) or use CC session_id directly | CC provides session_id in hook payloads; use it as primary key |
| JSON column handling | Custom serialization | SQLite JSON functions + `text("col")` | `JSON.parse`/`JSON.stringify` at query layer, same as `metadata` column on health findings |
| Config validation | Manual field checking | Zod schema with `.default()` | mcConfigSchema already validates; just extend it |

**Key insight:** Phase 11 introduces zero new patterns. Every deliverable follows an existing MC pattern with a different domain name.

## Common Pitfalls

### Pitfall 1: HTTP Hook Latency Assumption
**What goes wrong:** The CONTEXT.md and v1.2 research describe HTTP hooks as "fire-and-forget." In reality, HTTP hooks wait for a response (up to timeout). Only command hooks support `"async": true`.
**Why it happens:** Early research conflated HTTP hooks' non-blocking error handling (timeouts/failures don't crash CC) with async execution.
**How to avoid:** Design the session creation endpoint to respond in < 100ms. Set HTTP hook timeout to 5 seconds. Do minimal work in the handler -- insert row, return 200. Emit SSE events asynchronously after response. The Zod schemas should validate quickly (no async operations in schema validation).
**Warning signs:** Claude Code feels sluggish after adding hooks. Session start takes noticeably longer.
**Confidence:** HIGH -- verified from official Claude Code hooks documentation.

### Pitfall 2: Migration Breaks Existing Database
**What goes wrong:** New migration alters existing tables or uses features not compatible with existing SQLite DB.
**Why it happens:** Accidental column renames, type changes, or trying to add NOT NULL columns without defaults to existing tables.
**How to avoid:** Phase 11 migration is purely additive -- new `sessions` table only. No ALTER TABLE on existing tables. Test with `createDatabase(":memory:")` in Vitest to verify migration applies cleanly.
**Warning signs:** `pnpm test` fails on test DB setup.

### Pitfall 3: Config Schema Breaks on Existing mc.config.json
**What goes wrong:** Adding `modelTiers` as a required field causes existing configs without it to fail validation.
**Why it happens:** Forgetting `.default()` on the new config section.
**How to avoid:** Always use `.default([...])` for new config arrays, `.default("value")` for new config strings. Write a test that parses the current `mc.config.json` against the updated schema.
**Warning signs:** API server crashes on startup with "Invalid config" error.

### Pitfall 4: Timestamp Mode Mismatch Between Schema and Migration
**What goes wrong:** Drizzle schema uses `integer("col", { mode: "timestamp" })` but migration SQL uses `text` or wrong column type. Queries return wrong types.
**Why it happens:** Writing migration SQL by hand without cross-referencing the Drizzle schema definition.
**How to avoid:** Ensure migration SQL uses `integer` for all timestamp columns. Mode is a Drizzle abstraction -- SQLite stores epoch integers. Compare migration SQL against existing migrations (0004, 0005) for timestamp columns.
**Warning signs:** `new Date()` values not round-tripping correctly through DB.

### Pitfall 5: Shared Package Index Not Updated
**What goes wrong:** New schemas defined in `session.ts` but not exported from `index.ts` or types not added to `types/index.ts`. Web package can't import session types.
**Why it happens:** Three files need updating for every new schema file. Easy to forget one.
**How to avoid:** Checklist: (1) `schemas/session.ts` created, (2) `types/index.ts` has type aliases, (3) `index.ts` exports both schemas and types.
**Warning signs:** TypeScript compile error in web package when importing from `@mission-control/shared`.

## Code Examples

Verified patterns from the existing codebase:

### Sessions Table (Drizzle Schema)
```typescript
// Source: Synthesized from packages/api/src/db/schema.ts patterns
// Follows captures table pattern: text PK, integer timestamps, enum columns
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: ["claude-code", "aider"] }).notNull(),
    model: text("model"),
    tier: text("tier", { enum: ["opus", "sonnet", "local", "unknown"] }).notNull(),
    projectSlug: text("project_slug"),
    cwd: text("cwd").notNull(),
    status: text("status", {
      enum: ["active", "completed", "abandoned"],
    }).notNull().default("active"),
    filesJson: text("files_json"),
    taskDescription: text("task_description"),
    stopReason: text("stop_reason"),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp" }),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("sessions_status_idx").on(table.status),
    index("sessions_project_slug_idx").on(table.projectSlug),
    index("sessions_started_at_idx").on(table.startedAt),
    index("sessions_tier_idx").on(table.tier),
  ]
);
```

### Model Tier Derivation Function
```typescript
// Source: CONTEXT.md decision + config-driven approach
import type { MCConfig } from "./config.js";

export type ModelTier = "opus" | "sonnet" | "local" | "unknown";

/**
 * Derive model tier from a model string.
 * Uses config-driven regex patterns first, falls back to prefix matching.
 */
export function deriveModelTier(
  modelString: string | null | undefined,
  config?: MCConfig
): ModelTier {
  if (!modelString) return "unknown";

  // Config-driven matching (future-proofed)
  if (config?.modelTiers) {
    for (const mapping of config.modelTiers) {
      if (new RegExp(mapping.pattern).test(modelString)) {
        return mapping.tier;
      }
    }
  }

  // Built-in prefix matching (always works)
  if (modelString.startsWith("claude-opus")) return "opus";
  if (modelString.startsWith("claude-sonnet")) return "sonnet";

  // If none matched, it's a local/third-party model
  // But we don't know for sure, so return "local" for non-Anthropic models
  // and "unknown" only if completely unrecognizable
  return "local";
}
```

Note: The CONTEXT.md says "everything else -> local" but also says "default to 'unknown' for unrecognized." The resolution: non-Anthropic model strings (e.g., "qwen3-coder-30b") are "local" via the fallback. The "unknown" tier is reserved for `null`/`undefined` model strings (when the hook doesn't provide a model). This way, the budget dashboard can show meaningful tiers for all sessions that have a model string.

### Config Extension
```typescript
// Source: packages/api/src/lib/config.ts extension pattern
const modelTierMappingSchema = z.object({
  pattern: z.string().min(1),
  tier: z.enum(["opus", "sonnet", "local"]),
});

export type ModelTierMapping = z.infer<typeof modelTierMappingSchema>;

// Add to existing mcConfigSchema:
export const mcConfigSchema = z.object({
  projects: z.array(projectConfigEntrySchema),
  dataDir: z.string().default("./data"),
  services: z.array(serviceEntrySchema).default([]),
  macMiniSshHost: z.string().default("ryans-mac-mini"),
  // NEW in v1.2
  modelTiers: z.array(modelTierMappingSchema).default([
    { pattern: "^claude-opus", tier: "opus" },
    { pattern: "^claude-sonnet", tier: "sonnet" },
  ]),
});
```

### Event Bus Extension
```typescript
// Source: packages/api/src/services/event-bus.ts
// Add session event types to MCEventType union:
export type MCEventType =
  | "capture:created"
  | "capture:enriched"
  | "capture:archived"
  | "scan:complete"
  | "health:changed"
  | "copy:diverged"
  // v1.2 Session events
  | "session:started"
  | "session:ended"
  | "session:conflict"
  | "session:abandoned"
  | "budget:updated";
```

### Zod Session Schemas
```typescript
// Source: Following packages/shared/src/schemas/health.ts pattern
import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────
export const sessionSourceEnum = z.enum(["claude-code", "aider"]);
export const sessionStatusEnum = z.enum(["active", "completed", "abandoned"]);
export const modelTierEnum = z.enum(["opus", "sonnet", "local", "unknown"]);

// ── Input Schemas ──────────────────────────────────────────────────
export const createSessionSchema = z.object({
  sessionId: z.string().min(1),
  source: sessionSourceEnum,
  model: z.string().nullable().optional(),
  cwd: z.string().min(1),
  taskDescription: z.string().nullable().optional(),
});

export const heartbeatSchema = z.object({
  filesTouched: z.array(z.string()).optional(),
  toolName: z.string().optional(),
});

export const stopSessionSchema = z.object({
  stopReason: z.string().nullable().optional(),
});

// ── Response Schemas ───────────────────────────────────────────────
export const sessionSchema = z.object({
  id: z.string(),
  source: sessionSourceEnum,
  model: z.string().nullable(),
  tier: modelTierEnum,
  projectSlug: z.string().nullable(),
  cwd: z.string(),
  status: sessionStatusEnum,
  filesJson: z.string().nullable(),     // JSON array, parsed at display layer
  taskDescription: z.string().nullable(),
  stopReason: z.string().nullable(),
  startedAt: z.string().datetime(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const sessionResponseSchema = sessionSchema.extend({
  elapsedMinutes: z.number().optional(),  // computed: now - startedAt
});

export const listSessionsQuerySchema = z.object({
  status: sessionStatusEnum.optional(),
  projectSlug: z.string().optional(),
  source: sessionSourceEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Drizzle migrations via `drizzle-kit generate` only | Hybrid: some generated, some hand-written SQL + journal entry | v1.1 (March 2026) | Hand-written migrations are acceptable; just need SQL + journal entry |
| Separate budget table | Derived from sessions table (COUNT + GROUP BY) | CONTEXT.md decision | One less table to manage, budget is always consistent with session data |
| Command hooks with shell scripts | HTTP hooks (POST to API directly) | CC feature (Jan 2026) | Cleaner, no shell scripts to maintain for session reporting |

**Important correction from project research:**
- v1.2 research ARCHITECTURE.md describes `session_budgets` and `lm_status` tables. Per CONTEXT.md decision, `budget_entries` is NOT a separate table. Budget is derived from sessions.
- v1.2 research describes HTTP hooks as fire-and-forget. Per official docs (verified), HTTP hooks are NOT async. MC API must respond quickly.

## Open Questions

1. **Should `agent_id` be stored on sessions?**
   - What we know: Claude Code hook payloads include `agent_id` for subagent sessions (Task tool). Subagents share the parent's `session_id`.
   - What's unclear: Whether subagent activity should be tracked as separate sessions or merged into the parent.
   - Recommendation: Add an optional `agentId` column to sessions table now (nullable text). Don't build subagent handling logic yet -- just preserve the data for Phase 12 to use.

2. **Exact `infra/` script content for INFR-01**
   - What we know: Should follow mac-mini-ops v1.0 conventions with `/opt/services/mission-control/` paths and svc CLI compatibility.
   - What's unclear: Exact launchd plist configuration (which user, working directory, env vars).
   - Recommendation: Create minimal `infra/install.sh` and `infra/mission-control.plist` based on existing service patterns. The scripts should work for Mac Mini deployment but are not critical-path for the session feature.

3. **HTTP hook timeout setting for session reporting**
   - What we know: Default is 30s. Non-2xx/timeout is non-blocking (CC continues).
   - What's unclear: Whether 5s timeout is appropriate or if we should use 2s.
   - Recommendation: The Zod schemas and API design should assume < 100ms response time. Timeout setting is a Phase 12 concern (hook configuration), but schema design in Phase 11 should support fast validation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-02 | Sessions table exists with correct columns and indexes | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/db/queries/sessions.test.ts -x` | Wave 0 |
| SESS-02 | Session CRUD queries (create, get, list, update status) | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/db/queries/sessions.test.ts -x` | Wave 0 |
| BUDG-01 | Model tier derivation from model strings | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/lib/model-tier.test.ts -x` | Wave 0 |
| BUDG-01 | Config-driven tier mapping with regex patterns | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/lib/model-tier.test.ts -x` | Wave 0 |
| INFR-01 | Config backward compatibility (existing config still loads) | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/lib/config.test.ts -x` | Exists (extend) |
| SESS-02 | Zod schemas validate correct inputs and reject invalid ones | unit | `pnpm --filter @mission-control/shared vitest run -x` | Wave 0 |
| SESS-02 | Event bus accepts new session event types | unit | `pnpm --filter @mission-control/api vitest run src/__tests__/services/event-bus.test.ts -x` | Exists (extend) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/db/queries/sessions.test.ts` -- covers SESS-02 (session CRUD)
- [ ] `packages/api/src/__tests__/lib/model-tier.test.ts` -- covers BUDG-01 (tier derivation)
- [ ] Extend `packages/api/src/__tests__/lib/config.test.ts` -- covers INFR-01 (backward compat)
- [ ] Extend `packages/api/src/__tests__/services/event-bus.test.ts` -- covers session events

## Sources

### Primary (HIGH confidence)
- Existing MC codebase: `packages/api/src/db/schema.ts`, `packages/shared/src/schemas/health.ts`, `packages/api/src/lib/config.ts`, `packages/api/src/db/queries/captures.ts` -- patterns verified by reading source
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- HTTP hook behavior, async only for command hooks, hook payload schemas
- Drizzle ORM 0.38.4 / drizzle-kit 0.30.6 -- installed versions verified via `package.json`

### Secondary (MEDIUM confidence)
- [Claude Code Async Hooks Article](https://reading.sh/claude-code-async-hooks-what-they-are-and-when-to-use-them-61b21cd71aad) -- confirms `async: true` is command-hook-only
- v1.2 project research (`ARCHITECTURE.md`, `STACK.md`, `FEATURES.md`, `PITFALLS.md`) -- comprehensive but some assumptions corrected above

### Tertiary (LOW confidence)
- INFR-01 implementation details -- mac-mini-ops v1.0 conventions not directly verified; based on CONTEXT.md description

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used extensively in MC
- Architecture: HIGH -- every pattern directly observed in existing codebase
- Pitfalls: HIGH -- HTTP hook latency verified against official docs; migration/config pitfalls from existing test patterns
- Validation: HIGH -- test framework and patterns well-established

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable -- foundational data layer, unlikely to change)
