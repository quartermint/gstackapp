# Phase 34: Knowledge Compounding - Research

**Researched:** 2026-03-23
**Domain:** Solutions registry, session-to-knowledge pipeline, compound score metrics, MCP integration
**Confidence:** HIGH

## Summary

Phase 34 builds MC's learning system -- a solutions registry that captures knowledge from Claude Code sessions, stores structured solution documents in SQLite, surfaces relevant learnings at session startup via MCP, and tracks compound score (knowledge reuse rate) on the dashboard.

The infrastructure for this phase is already in place: session stop hooks fire to `/api/sessions/hook/stop` with session_id, session startup hooks fire to `/api/sessions/hook/start`, MCP tools like `cross_project_search` query the API, and hybrid search (Phase 32) indexes content in FTS5 + sqlite-vec. The key new work is: (1) a `solutions` table with structured metadata, (2) a solution extraction pipeline triggered by session stop, (3) solution indexing in hybrid search, (4) MCP startup banner enrichment with relevant learnings, and (5) a compound score API + dashboard widget.

**Primary recommendation:** Follow the existing "persist first, enrich later" pattern. Session stop creates a solution candidate row synchronously. LM Studio enrichment (extracting structured metadata from session data) runs async. Solution candidates queue for human review (accept/edit/dismiss). Accepted solutions get indexed in hybrid search and become searchable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Solutions stored in SQLite table (not markdown files). MC is API-first -- dashboard, MCP, and iOS all need to query solutions via API.
- **D-02:** Structured metadata: module, problem_type, symptoms, root_cause, tags, severity. Like CE's YAML frontmatter but in database columns.
- **D-03:** Solutions indexed in Phase 32's hybrid search alongside captures, commits, knowledge.
- **D-04:** Auto-generate solution candidates from Claude Code session stop hooks. Claude decides the heuristic for what constitutes a "significant" session (user deferred this).
- **D-05:** Persist first, review later -- auto-generated solutions are candidates, queued for human accept/edit/dismiss. Matches MC's existing capture philosophy.
- **D-06:** Session startup MCP banner includes relevant learnings from past sessions. Search solutions DB for project-relevant precedent.
- **D-07:** `cross_project_search` MCP tool extended to include solutions.
- **D-08:** Dashboard metric tracking knowledge reuse rate over time. How often solutions get referenced by sessions.

### Claude's Discretion
- What makes a session "significant" enough for auto-capture (commit count, duration, file count -- Claude picks the heuristic)
- Solution candidate presentation UX in dashboard
- Compound score visualization (number, chart, badge)
- How solution candidates surface for review (notification, dedicated section, inline)

### Deferred Ideas (OUT OF SCOPE)
- Manual `/compound` command equivalent for MC CLI
- Solution sharing across MC instances (multi-user future)
- Solution quality scoring (which solutions are most helpful)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMP-01 | Solutions registry -- `solutions` table with structured metadata | New Drizzle table with module, problem_type, symptoms, root_cause, tags, severity columns; follows knowledge/captures table patterns |
| COMP-02 | Auto-capture from Claude Code session stop hooks | Extend POST /api/sessions/hook/stop to trigger solution candidate generation; existing session data (projectSlug, filesJson, duration, commitCount) provides signal for significance heuristic |
| COMP-03 | Learnings surface in MCP session startup banner | Extend knowledge-digest.sh hook or create new learnings-digest.sh that queries /api/solutions/relevant?cwd=... to find project-relevant past solutions |
| COMP-04 | Cross-session knowledge -- solutions from any project searchable by all sessions | Extend MCP `cross_project_search` tool to include solutions source type in search results |
| COMP-05 | Compound score -- track which solutions get referenced and by which sessions | New `solution_references` table tracking session_id -> solution_id links; API endpoint for compound score calculation |
| COMP-06 | Solutions indexed in hybrid search (Phase 32 dependency) | Add 'solution' to SearchSourceType; `indexSolution()` function in search.ts; embedding via existing backfill service |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** -- no `any` types, use `unknown`
- **Zod schemas** for all API boundaries (request validation, response shapes)
- **Naming**: files `kebab-case.ts`, types `PascalCase`, functions `camelCase`, constants `SCREAMING_SNAKE_CASE`
- **Typed errors**: `AppError` class with `code` and `status` properties
- **Conventional commits**: `feat(scope):`, `fix(scope):`, `chore(scope):`, etc.
- **Module system**: ESM (`"type": "module"`) throughout
- **Database**: SQLite via better-sqlite3 + Drizzle ORM, migrations in `packages/api/drizzle/`
- **Vitest** for testing: `pnpm test`
- **API-first**: All data exposed via Hono API, consumed by dashboard/MCP/iOS

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.38.0 | Schema + queries for solutions table | Already used for all MC tables |
| better-sqlite3 | ^11.7.0 | Raw SQL for FTS5 indexing and migrations | Already used throughout |
| hono | ^4.6.0 | API routes for solutions CRUD | Already used for all routes |
| ai (Vercel AI SDK) | ^6.0.116 | LM Studio calls for solution extraction | Already used by reranker + query expander |
| @ai-sdk/openai | ^3.0.47 | OpenAI-compatible provider for LM Studio | Already used |
| sqlite-vec | ^0.1.7 | Vector embeddings for solution search | Already loaded at DB init |
| zod | (shared) | Schema validation for solution API | Already used for all schemas |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @modelcontextprotocol/sdk | (mcp pkg) | MCP tool registration | Extending cross_project_search |
| vitest | (dev) | Test framework | All new tests |

**No new dependencies required.** Everything builds on the existing stack.

## Architecture Patterns

### Recommended Project Structure (new files)
```
packages/api/src/
├── db/
│   ├── schema.ts                    # Add solutions + solution_references tables
│   └── queries/
│       └── solutions.ts             # CRUD for solutions + references
├── routes/
│   └── solutions.ts                 # API routes for solutions
├── services/
│   └── solution-extractor.ts        # LM Studio solution extraction logic
└── __tests__/
    ├── routes/solutions.test.ts
    ├── services/solution-extractor.test.ts
    └── queries/solutions.test.ts

packages/api/drizzle/
└── 0013_solutions.sql               # Migration for solutions tables

packages/shared/src/
├── schemas/solution.ts              # Zod schemas for solutions API
└── types/                           # Solution type exports

packages/mcp/src/tools/
└── cross-project-search.ts          # Extend to include solutions

packages/web/src/
├── hooks/use-solutions.ts           # Data fetching hook
├── hooks/use-compound-score.ts      # Compound score hook
└── components/compound/
    ├── compound-score.tsx            # Score widget
    └── solution-review.tsx           # Solution candidate review UI
```

### Pattern 1: Solutions Table Schema (D-01, D-02)
**What:** SQLite table with structured metadata columns matching CE's YAML frontmatter
**When to use:** Core data model -- must exist before any other COMP requirement

```typescript
// In packages/api/src/db/schema.ts
export const solutions = sqliteTable(
  "solutions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id"),              // source session
    projectSlug: text("project_slug"),           // primary project
    title: text("title").notNull(),              // short description
    content: text("content").notNull(),          // full solution text
    contentHash: text("content_hash").notNull(), // SHA-256 for dedup
    module: text("module"),                      // e.g., "packages/api/src/services"
    problemType: text("problem_type", {
      enum: ["bug_fix", "architecture", "performance", "integration", "configuration", "testing", "deployment"],
    }),
    symptoms: text("symptoms"),                  // what went wrong (searchable)
    rootCause: text("root_cause"),               // why it happened
    tagsJson: text("tags_json"),                 // JSON array of tags
    severity: text("severity", {
      enum: ["low", "medium", "high", "critical"],
    }).default("medium"),
    status: text("status", {
      enum: ["candidate", "accepted", "dismissed"],
    }).notNull().default("candidate"),
    referenceCount: integer("reference_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
  },
  (table) => [
    index("solutions_project_slug_idx").on(table.projectSlug),
    index("solutions_status_idx").on(table.status),
    index("solutions_problem_type_idx").on(table.problemType),
    index("solutions_session_id_idx").on(table.sessionId),
    uniqueIndex("solutions_content_hash_uniq").on(table.contentHash),
  ]
);

export const solutionReferences = sqliteTable(
  "solution_references",
  {
    id: text("id").primaryKey(),
    solutionId: text("solution_id").notNull(),
    sessionId: text("session_id").notNull(),
    referenceType: text("reference_type", {
      enum: ["startup_banner", "search_result", "mcp_query"],
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("sol_ref_solution_id_idx").on(table.solutionId),
    index("sol_ref_session_id_idx").on(table.sessionId),
  ]
);
```

### Pattern 2: Session Significance Heuristic (D-04 -- Claude's Discretion)
**What:** Determine which sessions are worth extracting solutions from
**When to use:** Called at session stop to decide whether to generate a solution candidate

**Recommended heuristic (compound trigger):**
A session is "significant" when it demonstrates problem-solving work, not just routine operations.

```typescript
interface SessionSignal {
  durationMinutes: number;     // from startedAt to endedAt
  filesCount: number;          // from filesJson array length
  commitCount: number;         // git log between startedAt and endedAt for project
  projectSlug: string | null;
}

function isSignificantSession(signal: SessionSignal): boolean {
  // Skip sessions with no project context (can't compound without project)
  if (!signal.projectSlug) return false;

  // Gate 1: Duration -- skip trivial sessions (<5 min)
  if (signal.durationMinutes < 5) return false;

  // Gate 2: Evidence of work -- need either commits or file touches
  if (signal.filesCount < 3 && signal.commitCount === 0) return false;

  // Gate 3: Meaningful work threshold
  // Any session with commits has produced artifacts worth documenting
  if (signal.commitCount >= 1) return true;

  // Long sessions (>30 min) with file activity are likely problem-solving
  if (signal.durationMinutes >= 30 && signal.filesCount >= 5) return true;

  // Many files touched (>10) suggests significant refactoring/fixing
  if (signal.filesCount >= 10) return true;

  return false;
}
```

**Rationale:** This is conservative but catches the important cases:
- Bug fix sessions: usually have commits + moderate duration
- Architecture sessions: long duration + many files
- Quick fixes: short duration, few files -- not worth a solution doc

### Pattern 3: Solution Extraction via LM Studio (D-04, D-05)
**What:** Generate structured solution from session data using local LLM
**When to use:** After session stop hook fires for a significant session

```typescript
// Reuse existing LM Studio patterns from ai-query-rewriter.ts
import { generateText, Output } from "ai";
import { createLmStudioProvider, getLmStudioStatus } from "./lm-studio.js";

const solutionExtractionSchema = z.object({
  title: z.string().describe("One-line description of what was solved"),
  problemType: z.enum([...]),
  symptoms: z.string().describe("What went wrong or what needed to change"),
  rootCause: z.string().describe("Why it happened"),
  solution: z.string().describe("What was done to fix/implement it"),
  tags: z.array(z.string()).describe("Keywords for searchability"),
  severity: z.enum(["low", "medium", "high", "critical"]),
  module: z.string().nullable().describe("Primary module affected"),
});
```

**Fallback when LM Studio unavailable:** Create a minimal solution candidate with just the session metadata (project, files, duration) and mark as `needs_enrichment`. Enrich lazily when LM Studio comes back. This matches MC's graceful degradation pattern.

### Pattern 4: FTS5 + Vector Indexing for Solutions (D-03, COMP-06)
**What:** Index solutions in unified search alongside captures, commits, knowledge
**When to use:** After a solution is accepted (status change from candidate to accepted)

```typescript
// In search.ts -- add 'solution' to SearchSourceType
export type SearchSourceType = "capture" | "commit" | "project" | "knowledge" | "solution";

// New indexing function following indexKnowledge pattern
export function indexSolution(
  sqlite: Database.Database,
  solution: { id: string; content: string; projectSlug: string | null; createdAt: string }
): void {
  const sourceId = `solution:${solution.id}`;
  sqlite.prepare(
    `DELETE FROM search_index WHERE source_type = 'solution' AND source_id = ?`
  ).run(sourceId);
  sqlite.prepare(
    `INSERT INTO search_index(content, source_type, source_id, project_slug, created_at)
     VALUES (?, 'solution', ?, ?, ?)`
  ).run(solution.content, sourceId, solution.projectSlug, solution.createdAt);
}
```

**Embedding:** The existing backfill service (from Phase 32) processes the search_index table and generates embeddings for new entries. Adding solutions to search_index automatically gets them into vector search -- no additional embedding code needed.

### Pattern 5: Session Startup Learnings Banner (D-06, COMP-03)
**What:** Add relevant past solutions to the MCP/hook startup context
**When to use:** On every session start for projects with existing solutions

Two implementation paths (not mutually exclusive):

**Path A: New SessionStart hook** (simpler, lower latency)
```bash
# ~/.claude/hooks/learnings-digest.sh
# Called at SessionStart, queries MC API for relevant solutions
MC_API="${MC_API_URL:-http://100.123.8.125:3000}"
CWD="${PWD}"
ENCODED_CWD=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$CWD'))")
DATA=$(curl -sf --max-time 5 "$MC_API/api/solutions/relevant?cwd=$ENCODED_CWD&limit=3" 2>/dev/null) || exit 0
# Format and print banner
```

**Path B: Extend existing knowledge-digest.sh** (fewer hooks, richer context)
Add a `solutions` field to the existing `/api/knowledge/digest` response.

**Recommendation:** Path B -- extend knowledge-digest endpoint. Fewer hooks means less latency at session startup, and the solutions context logically belongs with the knowledge context. The existing hook already resolves cwd to project slug.

### Pattern 6: Compound Score Tracking (D-08, COMP-05)
**What:** Track which solutions are referenced by sessions, compute reuse rate
**When to use:** When startup banner shows a solution to a session, or when search returns a solution

```typescript
// Record a reference when a solution is surfaced
function recordSolutionReference(
  db: DrizzleDb,
  solutionId: string,
  sessionId: string,
  type: "startup_banner" | "search_result" | "mcp_query"
): void {
  // Insert reference
  // Increment referenceCount on solutions table
}

// Compound score calculation
function getCompoundScore(db: DrizzleDb): {
  totalSolutions: number;
  referencedSolutions: number;
  totalReferences: number;
  reuseRate: number;          // referenced / total (0-1)
  trend: "up" | "flat" | "down"; // compared to 30d ago
} { ... }
```

### Anti-Patterns to Avoid
- **Don't generate solutions synchronously in the stop hook response.** LM Studio calls take 2-10 seconds. The stop hook must return fast (Claude Code has a 5s timeout). Use `queueMicrotask` for async extraction, same as session event emission.
- **Don't index candidate solutions in search.** Only index after acceptance. Otherwise search results fill with unreviewed, possibly low-quality content.
- **Don't make solution extraction block on LM Studio.** Create minimal candidate with session metadata, enrich later. Same "persist first, enrich later" pattern as captures.
- **Don't track references without session context.** A reference without a session_id is useless for compound scoring. Always require session context.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Content dedup | Custom hash logic | `computeContentHash()` from embedding.ts | Already handles CRLF normalization, SHA-256, cross-platform |
| FTS5 indexing | Custom indexing code | `indexSolution()` following `indexKnowledge()` pattern | Consistent with existing search pipeline |
| LM Studio calls | Raw fetch to LM Studio | `generateText` + `Output.object` from Vercel AI SDK | Already used by query expander and reranker, handles errors |
| Event broadcasting | Custom pub/sub | `eventBus.emit("mc:event", ...)` | SSE infrastructure already wired |
| Search pipeline | Custom search | `hybridSearch()` from hybrid-search.ts | Already handles BM25 + vector + RRF fusion |
| ID generation | Custom ID function | `crypto.randomUUID()` | Node.js built-in, used throughout MC |

**Key insight:** Phase 34 is almost entirely glue -- connecting existing session infrastructure to existing search infrastructure via a new solutions table. The pattern for every operation already exists somewhere in the codebase.

## Common Pitfalls

### Pitfall 1: Session Stop Hook Timeout
**What goes wrong:** LM Studio solution extraction takes >5s, Claude Code's HTTP hook times out, solution never generated
**Why it happens:** HTTP hooks in `~/.claude/settings.json` have `"timeout": 5` (seconds)
**How to avoid:** The stop hook response MUST be synchronous and fast. Solution extraction runs async via `queueMicrotask`. The hook response just confirms session stop. Extraction happens after response.
**Warning signs:** Solution candidates never appearing despite significant sessions

### Pitfall 2: Commit Count Calculation
**What goes wrong:** Significance heuristic uses commit count, but session table doesn't store commit count
**Why it happens:** Session stop only gets session_id. Commit count requires querying commits table for project + time range.
**How to avoid:** Count commits in the commits table where `projectSlug = session.projectSlug AND authorDate BETWEEN startedAt AND endedAt`. The data is already there from project scanner.
**Warning signs:** All sessions flagged as insignificant despite having commits

### Pitfall 3: SearchSourceType Extension Breaking Types
**What goes wrong:** Adding 'solution' to SearchSourceType breaks existing TypeScript exhaustive checks
**Why it happens:** Existing code may have switch/if statements on sourceType that don't handle 'solution'
**How to avoid:** Search for all uses of `SearchSourceType` and `sourceType` in the codebase. Update all pattern matches. The shared schema type also needs updating.
**Warning signs:** TypeScript compile errors or runtime "unexpected sourceType" errors

### Pitfall 4: Duplicate Solution Candidates
**What goes wrong:** Same session generates multiple solution candidates (hook fires multiple times, or retry)
**Why it happens:** Claude Code hooks can fire more than once. Network retries on timeout.
**How to avoid:** Use `contentHash` uniqueness constraint. Also check `sessionId` uniqueness on solutions table -- one solution per session maximum.
**Warning signs:** Database unique constraint violations in logs

### Pitfall 5: LM Studio Model Context for Extraction
**What goes wrong:** LM Studio generates poor-quality solution extractions because it has no context about the session's actual work
**Why it happens:** Session data in DB is limited: project slug, files touched, duration. No conversation content.
**How to avoid:** Use commit messages as the primary signal. Commits table has all messages for the project during the session window. File paths provide module context. This is much richer than just "session lasted 30 min touching 12 files."
**Warning signs:** Generic, unhelpful solution titles like "Fixed various issues in project"

### Pitfall 6: Shared Schema Export Gap
**What goes wrong:** New solution types not available in web package for dashboard components
**Why it happens:** Forgetting to export from `packages/shared/src/index.ts`
**How to avoid:** Follow the exact pattern from capture schemas: define in `schemas/solution.ts`, export from `index.ts`, add to types.
**Warning signs:** Import errors in web package for solution types

## Code Examples

### Session Stop Hook Extension
```typescript
// In packages/api/src/routes/sessions.ts -- extend the stop handler
// After existing session stop logic, trigger solution extraction
.post("/sessions/hook/stop", zValidator("json", hookStopSchema), (c) => {
  const hook = c.req.valid("json");
  const db = getInstance().db;

  try {
    const session = updateSessionStatus(db, hook.session_id, "completed");
    clearHeartbeatDebounce(hook.session_id);
    resolveSessionConflicts(getInstance().sqlite, hook.session_id);

    // Async solution extraction (fire-and-forget, same pattern as event emission)
    queueMicrotask(() => {
      eventBus.emit("mc:event", { type: "session:ended", id: session.id });

      // NEW: Trigger solution candidate generation for significant sessions
      try {
        generateSolutionCandidate(db, getInstance().sqlite, session);
      } catch {
        // Solution generation is best-effort -- never block session stop
      }
    });

    return c.json({ session });
  } catch {
    return c.json({ ok: true });
  }
});
```

### Solution Candidate Generation
```typescript
// In packages/api/src/services/solution-extractor.ts
export async function generateSolutionCandidate(
  db: DrizzleDb,
  sqlite: Database.Database,
  session: Session
): Promise<void> {
  // 1. Check significance
  const signal = buildSessionSignal(db, session);
  if (!isSignificantSession(signal)) return;

  // 2. Gather context (commit messages during session)
  const commits = getCommitsInTimeRange(db, session.projectSlug, session.startedAt, session.endedAt);
  const files = session.filesJson ? JSON.parse(session.filesJson) : [];

  // 3. Build solution content (with or without LM Studio)
  const content = buildSolutionContent(commits, files, session);
  const contentHash = computeContentHash(content);

  // 4. Check for duplicate
  if (solutionExistsForHash(db, contentHash)) return;

  // 5. Create candidate
  const solutionId = crypto.randomUUID();
  createSolution(db, {
    id: solutionId,
    sessionId: session.id,
    projectSlug: session.projectSlug,
    title: buildTitle(commits),
    content,
    contentHash,
    status: "candidate",
  });

  // 6. Async LM Studio enrichment (if available)
  if (getLmStudioStatus().health === "ready") {
    try {
      const enrichment = await extractSolutionMetadata(content, session.projectSlug);
      if (enrichment) {
        updateSolutionMetadata(db, solutionId, enrichment);
      }
    } catch {
      // Enrichment failure is ok -- candidate still exists with basic info
    }
  }

  // 7. Emit event for dashboard
  eventBus.emit("mc:event", {
    type: "solution:candidate",
    id: solutionId,
    data: { projectSlug: session.projectSlug },
  });
}
```

### Extending Knowledge Digest for Learnings (COMP-03)
```typescript
// Extend GET /api/knowledge/digest to include relevant solutions
// Add to the response shape:
{
  slug: "mission-control",
  relatedProjects: ["openefb", "sfr"],
  violations: 0,
  staleKnowledge: false,
  // NEW: Past solutions relevant to this project
  learnings: [
    {
      id: "abc-123",
      title: "SQLite WAL mode lock contention during parallel tests",
      problemType: "bug_fix",
      severity: "high",
      snippet: "Use separate DB instances per test to avoid WAL locks..."
    }
  ]
}
```

### Compound Score API
```typescript
// GET /api/solutions/compound-score
{
  totalSolutions: 24,
  acceptedSolutions: 18,
  referencedSolutions: 12,
  totalReferences: 47,
  reuseRate: 0.67,     // 12/18 accepted solutions have been referenced
  weeklyTrend: [
    { week: "2026-W12", references: 8 },
    { week: "2026-W13", references: 15 },
  ]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Markdown files (CE plugin) | SQLite + API (MC) | Phase 34 design | API-first enables dashboard, MCP, iOS access |
| Manual `/ce:compound` trigger | Auto-trigger on session stop | Phase 34 design | Zero-friction knowledge capture |
| Cloud LLM for extraction (CE) | Local LM Studio | Phase 32 established | No API costs, offline-capable |
| File-based search (CE grep) | Hybrid BM25 + vector | Phase 32 shipped | Semantic search across solutions |

**Key evolution from CE plugin:** CE writes markdown files to `docs/solutions/` and reads them with `learnings-researcher` agent (grep/read). MC stores in SQLite and indexes in hybrid search. Both capture the same knowledge but MC's approach enables API-first access across all clients.

## Open Questions

1. **Commit message quality for extraction**
   - What we know: Commit messages are the richest signal available from session data. MC uses conventional commits.
   - What's unclear: How good are LM Studio extractions when given only commit messages + file paths (no conversation context)?
   - Recommendation: Start with commit messages as primary input. If extraction quality is poor, consider also ingesting the `~/.claude/logs/sessions.jsonl` file for additional context (duration, stop reason). Do NOT try to access conversation content (it's not persisted in accessible form).

2. **Review UX placement**
   - What we know: Solution candidates need accept/edit/dismiss workflow.
   - What's unclear: Where in the dashboard? Dedicated section? Inline with captures? Notification badge?
   - Recommendation: Add a "Solutions" section to the dashboard sidebar (similar to how captures and sessions are surfaced). Show a badge count for pending candidates. Keep review lightweight -- a card with accept/edit/dismiss buttons.

3. **Compound score granularity**
   - What we know: D-08 says "knowledge reuse rate over time."
   - What's unclear: Per-project or global? Weekly or rolling?
   - Recommendation: Global compound score as the primary metric (simple, motivating). Per-project breakdown available on drill-down. Weekly bucketing for trend display.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` (workspace root, delegates to packages) |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMP-01 | Solutions table CRUD (create, read, update status, query by project/type) | unit | `pnpm --filter @mission-control/api test -- tests/queries/solutions.test.ts -x` | Wave 0 |
| COMP-02 | Session significance heuristic + solution candidate generation | unit | `pnpm --filter @mission-control/api test -- tests/services/solution-extractor.test.ts -x` | Wave 0 |
| COMP-02 | Session stop hook triggers solution extraction | integration | `pnpm --filter @mission-control/api test -- tests/routes/sessions.test.ts -x` | Extend existing |
| COMP-03 | Knowledge digest endpoint includes learnings | integration | `pnpm --filter @mission-control/api test -- tests/routes/knowledge.test.ts -x` | Extend existing |
| COMP-04 | Cross-project search includes solutions | integration | `pnpm --filter @mission-control/api test -- tests/routes/search.test.ts -x` | Extend existing |
| COMP-05 | Solution reference recording + compound score calculation | unit | `pnpm --filter @mission-control/api test -- tests/queries/solutions.test.ts -x` | Wave 0 |
| COMP-06 | Solution FTS5 indexing + hybrid search | integration | `pnpm --filter @mission-control/api test -- tests/services/hybrid-search.test.ts -x` | Extend existing |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/queries/solutions.test.ts` -- covers COMP-01, COMP-05
- [ ] `packages/api/src/__tests__/services/solution-extractor.test.ts` -- covers COMP-02
- [ ] `packages/shared/src/schemas/solution.ts` -- Zod schemas for API validation

*(No framework install needed -- Vitest already configured)*

## Sources

### Primary (HIGH confidence)
- `packages/api/src/db/schema.ts` -- existing table patterns (captures, sessions, projectKnowledge, fewShotExamples)
- `packages/api/src/routes/sessions.ts` -- existing hook/stop handler with async event emission pattern
- `packages/api/src/services/ai-query-rewriter.ts` -- existing LM Studio + Vercel AI SDK structured output pattern
- `packages/api/src/db/queries/search.ts` -- existing FTS5 indexing pattern (indexCapture, indexKnowledge, indexCommit)
- `packages/api/src/db/queries/embeddings.ts` -- existing vector embedding upsert pattern
- `packages/api/src/services/hybrid-search.ts` -- existing RRF fusion search pipeline
- `packages/api/src/services/event-bus.ts` -- existing SSE event types and emission pattern
- `packages/mcp/src/tools/cross-project-search.ts` -- existing MCP tool pattern
- `~/.claude/settings.json` -- existing Claude Code hooks (SessionStart, Stop, heartbeat)
- `~/.claude/hooks/knowledge-digest.sh` -- existing startup banner pattern
- `~/.claude/hooks/session-summary.sh` -- existing stop hook logging pattern

### Secondary (MEDIUM confidence)
- [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) -- solution document structure, `/ce:compound` workflow, `learnings-researcher` pattern
- [compound-engineering README](https://github.com/EveryInc/compound-engineering-plugin/blob/main/plugins/compound-engineering/README.md) -- plugin structure with 6 parallel agents for solution extraction

### Tertiary (LOW confidence)
- None -- all patterns verified against existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all existing libraries
- Architecture: HIGH -- every pattern has a direct precedent in the codebase
- Pitfalls: HIGH -- based on actual code inspection (hook timeouts, DB constraints, type system)
- Solution extraction quality: MEDIUM -- depends on LM Studio + commit message quality (untested)

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable -- no fast-moving external dependencies)
