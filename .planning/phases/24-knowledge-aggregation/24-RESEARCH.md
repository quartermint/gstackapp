# Phase 24: Knowledge Aggregation - Research

**Researched:** 2026-03-21
**Domain:** CLAUDE.md file aggregation, content-hash caching, SSH file reading, stale knowledge detection
**Confidence:** HIGH

## Summary

Phase 24 introduces a new knowledge aggregation subsystem that reads CLAUDE.md files from all registered projects (local and Mac Mini via SSH), stores the raw markdown content in SQLite with content-hash caching, serves it via a new `/api/knowledge/:slug` endpoint, and detects stale knowledge as health findings. This is a well-bounded feature that reuses established codebase patterns extensively.

The project already has every building block needed: SSH execution via `execFile("ssh", ...)` with timeout handling (project-scanner.ts), TTL-based caching (cache.ts), health finding upsert/resolve (health queries), an independent timer pattern (discovery-scanner.ts, star-service.ts), and event bus integration (event-bus.ts). The `stale_knowledge` check type is already registered in the shared health schema enum (added in Phase 23 / FOUND-03). No new dependencies are required.

**Primary recommendation:** Build a `knowledge-aggregator.ts` service following the discovery-scanner pattern (independent hourly timer, SSH batch commands for Mac Mini, content-hash diffing via SHA-256), a `project_knowledge` table (new migration 0009), a `knowledge.ts` query module, and a `knowledge.ts` route file. Reuse existing patterns verbatim -- do not introduce new architectural concepts.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Store CLAUDE.md as raw markdown text -- no structured parsing into sections or JSON columns
- **D-02:** Convention scanner (Phase 26) will pattern-match against raw text with regex -- no need for pre-parsed structure
- **D-03:** `/api/knowledge/:slug` returns raw CLAUDE.md content plus metadata envelope: contentHash, lastModified, fileSize, staleness score
- **D-04:** Dashboard consumes metadata for freshness display; MCP tools return full content for Claude to interpret
- **D-05:** Knowledge aggregation runs on a separate hourly timer (not the 5-minute scan cycle) -- per requirements
- **D-06:** Content-hash caching: only re-read files when git reports changes (KNOW-02)
- **D-07:** SSH failure for Mac Mini projects degrades gracefully -- serve cached content, no errors in dashboard
- **D-08:** CLAUDE.md files >30 days old with >10 commits since last update surface as `stale_knowledge` health findings (KNOW-11)

### Claude's Discretion
- Knowledge table schema design (columns, indexes)
- Content hash algorithm choice
- Exact staleness score calculation formula
- SSH connection pooling/retry strategy

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KNOW-01 | MC aggregates CLAUDE.md content from all local projects and Mac Mini projects via SSH | Local: `readFileSync` or `git show HEAD:CLAUDE.md`. SSH: batch script via `execFile("ssh", ...)` following project-scanner.ts pattern. GitHub-only projects skipped (no filesystem access). |
| KNOW-02 | CLAUDE.md aggregation uses content-hash caching (only re-reads when git reports file changed) | SHA-256 via Node.js `node:crypto`. Store hash in `project_knowledge` table. On scan: compute hash of new content, compare to stored hash, skip DB write if identical. Git change detection via `git log -1 --format=%H -- CLAUDE.md` to get last commit that touched the file. |
| KNOW-03 | Aggregation runs on a separate timer from the main scan cycle with graceful SSH failure handling | Independent `setInterval` in index.ts following discovery-scanner pattern. SSH failures: catch, log warning, serve cached content from DB, do not emit error events. |
| KNOW-11 | Stale knowledge health check flags CLAUDE.md files >30 days old with >10 commits since last update | Pure function like `checkDirtyWorkingTree`. Inputs: `lastModified` date of CLAUDE.md and `commitsSinceUpdate` count. Outputs: `stale_knowledge` health finding (already in enum). Both thresholds must be met (AND logic). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:crypto | (built-in) | SHA-256 content hashing | Zero-dependency, built into Node.js, deterministic |
| node:child_process | (built-in) | SSH command execution for Mac Mini | Already used in project-scanner.ts |
| node:fs | (built-in) | Local CLAUDE.md file reads | Already used throughout codebase |
| better-sqlite3 | 11.7.0 | SQLite storage for knowledge records | Already project dependency |
| drizzle-orm | 0.38.0 | Type-safe ORM for knowledge table | Already project dependency |
| p-limit | 7.3.0 | Concurrency control for parallel reads | Already project dependency |
| hono | 4.6.0 | API route definition | Already project dependency |
| zod | 3.24.0 | Request/response schema validation | Already project dependency |

### Supporting
No new dependencies needed. Everything is built from existing project dependencies.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SHA-256 | MD5 | SHA-256 is standard, 64 hex chars, collision-resistant. MD5 would work but no reason to use it. |
| `node:crypto` | xxhash / murmurhash | Faster but requires a new dependency. CLAUDE.md files are small (<50KB), so speed is irrelevant. |
| `readFileSync` for local | `git show HEAD:CLAUDE.md` | `git show` gives committed content (ignoring uncommitted edits). Either works; `git show` is more consistent with "what's in the repo" semantics. |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
├── services/
│   └── knowledge-aggregator.ts    # Core service: scan, hash, store, detect staleness
├── db/
│   ├── schema.ts                  # Add projectKnowledge table definition
│   └── queries/
│       └── knowledge.ts           # CRUD operations for project_knowledge table
├── routes/
│   └── knowledge.ts               # GET /api/knowledge/:slug, GET /api/knowledge
packages/api/drizzle/
│   └── 0009_knowledge.sql         # Migration: create project_knowledge table
packages/shared/src/schemas/
│   └── knowledge.ts               # Zod schemas for knowledge API responses
```

### Pattern 1: Independent Timer Service
**What:** A background service with its own `setInterval` timer, decoupled from the main project scan cycle.
**When to use:** When a subsystem needs a different polling interval (hourly vs 5-minute scan).
**Example (from discovery-scanner.ts):**
```typescript
export function startKnowledgeScan(
  config: MCConfig,
  db: DrizzleDb,
  sqlite: Database.Database,
  intervalMs?: number
): ReturnType<typeof setInterval> {
  const interval = intervalMs ?? 3_600_000; // 1 hour

  // Run initial scan
  scanAllKnowledge(config, db, sqlite)
    .then((stats) => {
      if (stats.updated > 0) console.log(`Knowledge scan: ${stats.updated} updated`);
    })
    .catch((err) => console.error("Initial knowledge scan failed:", err));

  // Set up recurring scan
  return setInterval(() => {
    scanAllKnowledge(config, db, sqlite)
      .then((stats) => {
        if (stats.updated > 0) console.log(`Knowledge scan: ${stats.updated} updated`);
      })
      .catch((err) => console.error("Knowledge scan failed:", err));
  }, interval);
}
```

### Pattern 2: Content-Hash Caching (KNOW-02)
**What:** Only write to the database when file content actually changes.
**When to use:** When scanning files on a recurring timer and you want to avoid unnecessary writes.
**Example:**
```typescript
import { createHash } from "node:crypto";

function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

async function processKnowledge(slug: string, content: string, db: DrizzleDb): Promise<boolean> {
  const newHash = computeContentHash(content);
  const existing = getKnowledge(db, slug);

  if (existing && existing.contentHash === newHash) {
    return false; // No change, skip write
  }

  upsertKnowledge(db, {
    projectSlug: slug,
    content,
    contentHash: newHash,
    fileSize: Buffer.byteLength(content, "utf-8"),
    lastModified: new Date().toISOString(),
  });
  return true; // Updated
}
```

### Pattern 3: SSH Batch Script for Mac Mini
**What:** Read CLAUDE.md from remote projects via SSH, batching commands into a single SSH connection per project.
**When to use:** For Mac Mini projects where direct filesystem access is unavailable.
**Example:**
```typescript
async function readRemoteClaudeMd(
  sshHost: string,
  projectPath: string
): Promise<{ content: string; lastModified: string; commitsSince: number } | null> {
  try {
    const script = [
      `cd "${projectPath}" 2>/dev/null || exit 1`,
      `echo "===CONTENT==="`,
      `cat CLAUDE.md 2>/dev/null || echo ""`,
      `echo "===LAST_MODIFIED==="`,
      `git log -1 --format=%aI -- CLAUDE.md 2>/dev/null || echo ""`,
      `echo "===COMMITS_SINCE==="`,
      // Count commits since CLAUDE.md was last modified
      `LAST_HASH=$(git log -1 --format=%H -- CLAUDE.md 2>/dev/null); test -n "$LAST_HASH" && git rev-list $LAST_HASH..HEAD --count 2>/dev/null || echo "0"`,
    ].join(" && ");

    const result = await execFile("ssh", ["-o", "ConnectTimeout=5", sshHost, script], {
      timeout: 20_000,
    });

    const content = result.stdout.split("===CONTENT===")[1]?.split("===LAST_MODIFIED===")[0]?.trim() ?? "";
    const lastModified = result.stdout.split("===LAST_MODIFIED===")[1]?.split("===COMMITS_SINCE===")[0]?.trim() ?? "";
    const commitsSince = parseInt(
      result.stdout.split("===COMMITS_SINCE===")[1]?.trim() ?? "0", 10
    );

    if (!content) return null;
    return { content, lastModified, commitsSince };
  } catch {
    return null; // Graceful degradation (D-07)
  }
}
```

### Pattern 4: Stale Knowledge Health Check (KNOW-11)
**What:** Pure function that determines if a CLAUDE.md is stale based on age and commit activity.
**When to use:** During knowledge scan, after reading CLAUDE.md metadata.
**Example:**
```typescript
function checkStaleKnowledge(
  slug: string,
  lastModified: string,
  commitsSinceUpdate: number,
  now?: Date
): HealthFindingInput | null {
  const reference = now ?? new Date();
  const modified = new Date(lastModified);
  if (isNaN(modified.getTime())) return null;

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const ageDays = (reference.getTime() - modified.getTime()) / MS_PER_DAY;

  // Both conditions must be true (AND logic per D-08)
  if (ageDays > 30 && commitsSinceUpdate > 10) {
    return {
      projectSlug: slug,
      checkType: "stale_knowledge",
      severity: "warning",
      detail: `CLAUDE.md is ${Math.floor(ageDays)} days old with ${commitsSinceUpdate} commits since last update`,
      metadata: { ageDays: Math.floor(ageDays), commitsSinceUpdate },
    };
  }
  return null;
}
```

### Pattern 5: Graceful SSH Degradation (D-07)
**What:** On SSH failure, serve cached content from database, never surface errors in dashboard.
**When to use:** All Mac Mini SSH operations.
**Example:**
```typescript
// In knowledge aggregation loop:
if (target.host === "mac-mini") {
  const remote = await readRemoteClaudeMd(sshHost, target.path);
  if (remote === null) {
    // SSH failed -- cached content remains in DB, nothing to update
    console.warn(`Knowledge: SSH failed for ${target.slug}, serving cached`);
    continue; // Move to next project
  }
  // Process normally...
}
```

### Anti-Patterns to Avoid
- **Parsing CLAUDE.md into structured sections:** D-01 explicitly says store as raw markdown. Phase 26 will regex-match against raw text.
- **Running knowledge scan inside the main 5-minute scan cycle:** D-05 mandates a separate hourly timer. Knowledge scan must never delay project scanning.
- **Surfacing SSH errors in the dashboard:** D-07 says graceful degradation. Log warnings server-side, but never create error-type health findings for SSH failures.
- **Using in-memory-only cache without DB persistence:** Knowledge must survive server restarts. Always persist to SQLite; in-memory cache is optional for fast reads.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Content hashing | Custom hash function | `node:crypto` SHA-256 | Battle-tested, zero dependencies, deterministic |
| SSH execution | Custom SSH client library | `execFile("ssh", ...)` with ConnectTimeout | Already proven pattern in project-scanner.ts |
| Concurrent scan throttling | Manual promise queue | `p-limit` | Already in use, handles backpressure |
| Health finding persistence | Custom SQL with dedup | `upsertHealthFinding` from queries/health.ts | Handles SELECT-then-UPDATE/INSERT atomically |
| Event notification | Custom pub/sub | `eventBus.emit()` | Singleton event bus already wired to SSE |

**Key insight:** This phase is almost entirely pattern reuse. The only genuinely new code is the knowledge table schema, the CLAUDE.md content reading logic, and the staleness check function. Everything else is wiring together existing pieces.

## Common Pitfalls

### Pitfall 1: SSH Timeouts Blocking the Entire Scan
**What goes wrong:** If Mac Mini is offline, each SSH attempt waits 20 seconds. With 5 Mac Mini projects, that's 100 seconds of blocking.
**Why it happens:** Sequential SSH calls with long timeouts.
**How to avoid:** Use `p-limit(3)` for parallel SSH reads. Use `-o ConnectTimeout=5` (not the default 30s). Set `execFile` timeout to 10-15 seconds for knowledge reads (CLAUDE.md files are small, so this is generous).
**Warning signs:** Knowledge scan cycle exceeding 60 seconds.

### Pitfall 2: Content Hash Mismatch on Line Endings
**What goes wrong:** The same file content produces different hashes on different platforms (CRLF vs LF).
**Why it happens:** SSH reads may return different line endings than local reads.
**How to avoid:** Normalize line endings before hashing: `content.replace(/\r\n/g, "\n")`.
**Warning signs:** Hash changes on every scan despite no actual content change.

### Pitfall 3: GitHub-Only Projects Have No CLAUDE.md Access
**What goes wrong:** Trying to read CLAUDE.md from `host: "github"` projects fails because there's no filesystem path.
**Why it happens:** GitHub-only entries have no local clone and `gh api` for raw file content is rate-limited.
**How to avoid:** Skip `host: "github"` projects entirely in knowledge aggregation. They have no disk path. If CLAUDE.md content is wanted for GitHub-only repos, that's a future feature (could use `gh api repos/:owner/:repo/contents/CLAUDE.md`).
**Warning signs:** Errors in knowledge scan logs for github-only projects.

### Pitfall 4: Large CLAUDE.md Files Consuming Memory
**What goes wrong:** A massive CLAUDE.md (e.g., 500KB+) causes memory spikes during hashing and storage.
**Why it happens:** Unlikely but possible if someone stores large documentation inline.
**How to avoid:** Add a size guard (e.g., skip files > 500KB with a warning log). In practice, CLAUDE.md files are 1-10KB.
**Warning signs:** Memory usage spikes correlated with knowledge scan cycles.

### Pitfall 5: Race Between Stale Knowledge Resolution and Creation
**What goes wrong:** If the knowledge scan and the main health scan both touch `stale_knowledge` findings, they could create/resolve findings in conflicting order.
**Why it happens:** The main scan's `resolveFindings` call could resolve a `stale_knowledge` finding if it's not in the active check types list.
**How to avoid:** Add `"stale_knowledge"` to the `activeCheckTypes` array in the main scan's resolve call (similar to how `"diverged_copies"` is included). OR only create/resolve `stale_knowledge` findings within the knowledge scan, and have the main scan ignore them.
**Warning signs:** `stale_knowledge` findings appearing and disappearing on each 5-minute cycle.

### Pitfall 6: Multi-Copy Projects and Knowledge Dedup
**What goes wrong:** A project with copies on both local and Mac Mini reads CLAUDE.md twice and stores two records.
**Why it happens:** Multi-copy entries expand into multiple scan targets.
**How to avoid:** Knowledge is per-project (per-slug), not per-copy. Read CLAUDE.md from the first available source (prefer local over SSH for speed) and store once per slug. This mirrors how `upsertProject` only runs once per slug in the scanner.
**Warning signs:** Duplicate knowledge records in the database for multi-copy projects.

## Code Examples

### Database Schema (project_knowledge table)
```typescript
// In packages/api/src/db/schema.ts
export const projectKnowledge = sqliteTable(
  "project_knowledge",
  {
    projectSlug: text("project_slug").primaryKey(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    fileSize: integer("file_size").notNull(),
    lastModified: text("last_modified").notNull(), // ISO date from git log
    commitsSinceUpdate: integer("commits_since_update").notNull().default(0),
    lastScannedAt: text("last_scanned_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("knowledge_last_modified_idx").on(table.lastModified),
  ]
);
```

### Migration SQL (0009_knowledge.sql)
```sql
CREATE TABLE `project_knowledge` (
  `project_slug` text PRIMARY KEY NOT NULL,
  `content` text NOT NULL,
  `content_hash` text NOT NULL,
  `file_size` integer NOT NULL,
  `last_modified` text NOT NULL,
  `commits_since_update` integer NOT NULL DEFAULT 0,
  `last_scanned_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_last_modified_idx` ON `project_knowledge` (`last_modified`);
```

### API Response Shape (D-03)
```typescript
// In packages/shared/src/schemas/knowledge.ts
import { z } from "zod";

export const knowledgeResponseSchema = z.object({
  projectSlug: z.string(),
  content: z.string(),
  contentHash: z.string(),
  lastModified: z.string(),
  fileSize: z.number(),
  stalenessScore: z.number(), // 0-100, 100=fresh, 0=very stale
  commitsSinceUpdate: z.number(),
  lastScannedAt: z.string(),
});

export const knowledgeListResponseSchema = z.object({
  knowledge: z.array(knowledgeResponseSchema.omit({ content: true })),
  total: z.number(),
});
```

### Staleness Score Formula (Claude's Discretion)
```typescript
/**
 * Compute a 0-100 staleness score.
 * 100 = just updated (fresh)
 * 0 = extremely stale
 *
 * Factors:
 * - Age in days (weight: 60%) -- linear decay from 100 to 0 over 90 days
 * - Commits since update (weight: 40%) -- linear decay from 100 to 0 over 50 commits
 */
function computeStalenessScore(lastModified: string, commitsSinceUpdate: number): number {
  const now = new Date();
  const modified = new Date(lastModified);
  if (isNaN(modified.getTime())) return 0;

  const ageDays = (now.getTime() - modified.getTime()) / (24 * 60 * 60 * 1000);
  const ageScore = Math.max(0, Math.min(100, 100 - (ageDays / 90) * 100));
  const commitScore = Math.max(0, Math.min(100, 100 - (commitsSinceUpdate / 50) * 100));

  return Math.round(ageScore * 0.6 + commitScore * 0.4);
}
```

### Local CLAUDE.md Reading
```typescript
async function readLocalClaudeMd(
  projectPath: string
): Promise<{ content: string; lastModified: string; commitsSince: number } | null> {
  try {
    // Use git show to get committed content (consistent with SSH approach)
    const script = [
      `git show HEAD:CLAUDE.md 2>/dev/null`,
      `echo "===DELIM==="`,
      `git log -1 --format=%aI -- CLAUDE.md 2>/dev/null || echo ""`,
      `echo "===DELIM==="`,
      `LAST_HASH=$(git log -1 --format=%H -- CLAUDE.md 2>/dev/null); test -n "$LAST_HASH" && git rev-list $LAST_HASH..HEAD --count 2>/dev/null || echo "0"`,
    ].join(" && ");

    const result = await execFile("sh", ["-c", script], {
      cwd: projectPath,
      timeout: 10_000,
    });

    const parts = result.stdout.split("===DELIM===");
    const content = (parts[0] ?? "").trim();
    const lastModified = (parts[1] ?? "").trim();
    const commitsSince = parseInt((parts[2] ?? "0").trim(), 10);

    if (!content) return null;
    return { content, lastModified: lastModified || new Date().toISOString(), commitsSince };
  } catch {
    return null;
  }
}
```

### Event Bus Integration
```typescript
// New event type to add to event-bus.ts MCEventType union:
// | "knowledge:updated"

// Emitted after knowledge scan completes with changes:
eventBus.emit("mc:event", { type: "knowledge:updated", id: slug });
```

### Route Registration (in app.ts)
```typescript
// Add to import list:
import { createKnowledgeRoutes } from "./routes/knowledge.js";

// Add to chain:
.route("/api", createKnowledgeRoutes(getInstance))
```

### Timer Registration (in index.ts)
```typescript
// Start knowledge scanner (independent hourly timer, per KNOW-03)
let knowledgeTimer: ReturnType<typeof setInterval> | null = null;
if (config) {
  const { db: knowledgeDb, sqlite: knowledgeSqlite } = getDatabase();
  knowledgeTimer = startKnowledgeScan(config, knowledgeDb, knowledgeSqlite);
  console.log("Knowledge scanner started (1-hour interval)");
}

// In shutdown():
if (knowledgeTimer) {
  clearInterval(knowledgeTimer);
  knowledgeTimer = null;
  console.log("Knowledge scanner stopped.");
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via pnpm test) |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KNOW-01 | Aggregates CLAUDE.md from local + SSH projects | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/knowledge-aggregator.test.ts -x` | Wave 0 |
| KNOW-02 | Content-hash caching skips writes on unchanged files | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/knowledge-aggregator.test.ts -x` | Wave 0 |
| KNOW-03 | Separate timer + graceful SSH failure | unit + integration | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/knowledge-aggregator.test.ts -x` | Wave 0 |
| KNOW-11 | Stale knowledge health check (>30d + >10 commits) | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/knowledge-aggregator.test.ts -x` | Wave 0 |
| API | GET /api/knowledge/:slug returns envelope | integration | `pnpm --filter @mission-control/api test -- --run src/__tests__/routes/knowledge.test.ts -x` | Wave 0 |
| API | GET /api/knowledge list endpoint | integration | `pnpm --filter @mission-control/api test -- --run src/__tests__/routes/knowledge.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/services/knowledge-aggregator.test.ts` -- covers KNOW-01, KNOW-02, KNOW-03, KNOW-11
- [ ] `packages/api/src/__tests__/routes/knowledge.test.ts` -- covers API routes
- [ ] Schema migration 0009 -- covers table creation

*(Test infrastructure exists: `createTestDb()`, `createTestApp()`, Vitest config, all patterns established)*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Structured CLAUDE.md parsing | Raw text storage (D-01) | Phase 24 decision | Simpler storage, Phase 26 regex matches against raw |
| Knowledge scan in main loop | Independent hourly timer (D-05) | Phase 24 decision | No interference with 5-minute project scan |

**Nothing deprecated in this domain.** All technologies and patterns used are current and stable.

## Open Questions

1. **GitHub-only projects: should we attempt to read CLAUDE.md via gh API?**
   - What we know: GitHub-only projects have `host: "github"` and `repo: "owner/repo"` but no filesystem path
   - What's unclear: Whether the user wants CLAUDE.md from GitHub-only repos
   - Recommendation: Skip GitHub-only projects in v1.4. They're typically archived/satellite repos. If wanted later, use `gh api repos/:owner/:repo/contents/CLAUDE.md --jq .content | base64 -d` (rate-limited).

2. **Multi-copy projects: which copy's CLAUDE.md takes precedence?**
   - What we know: Some projects (e.g., mission-control) could exist on both local and Mac Mini
   - What's unclear: Whether both copies' CLAUDE.md should be read
   - Recommendation: Prefer local copy (faster, no SSH). Fall back to Mac Mini if local read fails. Store one knowledge record per slug. Currently no multi-copy entries exist in mc.config.json, but the code should handle them.

3. **Reverse SSH (localSshHost): should knowledge scanner support it?**
   - What we know: The project scanner supports `localSshHost` for when MC runs on Mac Mini and scans MacBook projects via reverse SSH
   - What's unclear: Whether the knowledge scanner needs this too
   - Recommendation: Yes, follow the same pattern as project-scanner.ts. If `config.localSshHost` is set, treat "local" projects as SSH targets. This ensures the knowledge scanner works correctly regardless of which machine MC runs on.

## Sources

### Primary (HIGH confidence)
- `packages/api/src/services/project-scanner.ts` -- SSH execution pattern, batch script construction, timer registration
- `packages/api/src/services/discovery-scanner.ts` -- Independent timer pattern, SSH scan for Mac Mini
- `packages/api/src/services/git-health.ts` -- Health check pure function pattern, severity levels
- `packages/api/src/db/queries/health.ts` -- `upsertHealthFinding`, `resolveFindings` patterns
- `packages/api/src/db/schema.ts` -- Table definition patterns, index conventions
- `packages/api/src/services/event-bus.ts` -- Event type definitions, emit pattern
- `packages/api/src/services/cache.ts` -- TTLCache pattern
- `packages/api/src/app.ts` -- Route registration pattern (method chaining)
- `packages/api/src/index.ts` -- Timer registration, shutdown cleanup, getDatabase() pattern
- `packages/shared/src/schemas/health.ts` -- `stale_knowledge` already in `healthCheckTypeEnum`
- `packages/api/drizzle/` -- Migration file naming (0009_knowledge.sql), journal format

### Secondary (MEDIUM confidence)
- `mc.config.json` -- 15 local projects, 5 Mac Mini projects, ~13 GitHub-only projects. ~20 projects need CLAUDE.md scanning.

### Tertiary (LOW confidence)
- None. All findings are from primary source code analysis.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all patterns from existing codebase
- Architecture: HIGH -- direct pattern reuse from discovery-scanner and project-scanner
- Pitfalls: HIGH -- all pitfalls derived from actual code review (SSH timeouts, multi-copy dedup, health finding race)
- Schema design: HIGH -- follows exact conventions of existing tables (projectHealth, projectCopies)

**Research date:** 2026-03-21
**Valid until:** Indefinite -- this is all internal codebase pattern analysis, not external library research
