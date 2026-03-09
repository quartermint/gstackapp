# Phase 4: Search & Intelligence - Research

**Researched:** 2026-03-09
**Domain:** Full-text search, AI query rewriting, unified indexing
**Confidence:** HIGH

## Summary

Phase 4 transforms Mission Control from a capture dump into retrievable memory. The user types natural language in the command palette (? prefix), an AI rewriter translates it to optimized FTS5 queries with extracted filters, and a unified index returns ranked results across captures, commits, and projects -- all through the existing `/api/search` endpoint and command palette UI.

The codebase is exceptionally well-positioned for this phase. FTS5 infrastructure exists with BM25 ranking, the AI categorizer pattern (Vercel AI SDK + Gemini 3 Flash + Zod structured output) is proven, and the command palette already has search mode scaffolding with debounced API fetching. The main new work is: (1) a unified `search_index` FTS5 table replacing the separate `captures_fts`/`project_metadata_fts` tables, (2) a `commits` SQLite table persisting git commits from the scanner, (3) an AI query rewriter service, and (4) enhanced result rendering with source badges, snippets, and filter chips.

**Primary recommendation:** Use a contentless-delete FTS5 table (`search_index`) with an UNINDEXED `source_type` column as the discriminator. Populate it via triggers for captures/projects and programmatic inserts for commits during scanner polls. Keep the AI rewriter simple -- structured output that returns an FTS5 query string plus optional filters.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- AI query rewriter: user types natural language, AI rewrites into optimized FTS5 query + extracts structured filters (project, date range, type)
- Smart detection heuristic: short keyword queries (1-2 words, no question words) go straight to FTS5; longer or question-like queries route through AI rewriter
- Graceful fallback: when AI is unavailable, pass query directly to FTS5 keyword search
- No re-ranking or vector search -- AI rewriter is the intelligence layer
- Unified FTS5 index: single `search_index` FTS5 table indexing captures, project metadata, AND commit messages with BM25 ranking
- Persist commits to SQLite: project scanner writes last 50 commits per project to a `commits` table, FTS5 indexes them alongside captures
- Project metadata fields indexed: name, tagline, GSD state/phase info
- One query, mixed results -- unified ranking across all source types
- Flat ranked list with source type badges (capture/commit/project) -- no grouping by type, relevance-first ordering
- Content snippet (~80 chars) with query term highlighting + source type badge + relative timestamp per result
- AI-extracted filters shown as subtle dismissible chips below search input
- Select result -> navigate to context: captures and commits swap hero to their project, project results swap hero to that project
- Command palette only (? prefix) -- no dedicated dashboard search section
- No search history -- palette is transient
- ? prefix is the only way to trigger search
- No new keyboard shortcut required -- Cmd+K then ? is the primary flow
- User setting: optional Cmd+/ shortcut that opens palette pre-filled with ? for one-step search access. Off by default

### Claude's Discretion
- Smart detection heuristic implementation (what counts as "question-like" vs keyword)
- FTS5 unified index schema design (content, source_type, source_id columns)
- AI rewriter prompt engineering
- Commit deduplication strategy on re-scan
- Filter chip component design
- Query term highlighting approach in snippets
- How project metadata is inserted/updated in the search index

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | User can search across all captures, project metadata, and commit messages using natural language from the command palette | Unified FTS5 index + AI query rewriter + existing command palette search mode |
| SRCH-02 | Search results are ranked by relevance with source type indicated (capture, commit, project) | BM25 ranking with column weights + UNINDEXED source_type column + source badges in UI |
| SRCH-03 | AI-powered natural language queries return contextually relevant results (not just keyword matching) | Vercel AI SDK generateText + Output.object + Zod schema for structured query rewriting |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 11.10.0 | SQLite engine (bundles SQLite 3.49.2) | Already used, FTS5 + contentless-delete supported |
| ai (Vercel AI SDK) | 6.0.116 | AI query rewriting via generateText | Already used for capture categorization |
| @ai-sdk/google | 3.0.43 | Gemini 3 Flash model provider | Already configured with API key pattern |
| zod | 3.24.0 | Structured output schema for AI rewriter | Already used for all API boundaries |
| hono | 4.12.5 | API server | Already used |
| cmdk | 1.1.1 | Command palette | Already used, search mode scaffolded |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-orm | 0.38.0 | ORM for commits table schema + regular queries | New commits table via Drizzle, FTS5 stays raw SQL |
| nanoid | 5.0.0 | ID generation for commits | Consistent with captures pattern |
| react | 19.0.0 | UI components for filter chips, enhanced results | Already used |
| tailwindcss | 4.0.0 | Styling for filter chips, source badges | Already used |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Contentless-delete FTS5 | External content FTS5 | External content requires a single content table, but we have 3 source tables. Contentless-delete is simpler for multi-source. |
| Single unified FTS5 table | UNION across 3 separate FTS5 tables | UNION requires 3 queries + manual merge. Single table gives native BM25 cross-source ranking. |
| AI query rewriter | Client-side query parsing | AI handles natural language ("what was I thinking about flights") that regex/parsing cannot. |

**Installation:**
```bash
# No new dependencies needed -- everything is already installed
```

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
  db/
    schema.ts               # Add commits table schema
    queries/
      search.ts             # Replace searchCaptures with searchUnified
      commits.ts            # NEW: commit CRUD for scanner persistence
  services/
    ai-query-rewriter.ts    # NEW: AI rewriter service
    project-scanner.ts      # Extend: persist commits to SQLite
  routes/
    search.ts               # Extend: AI rewriter integration + filter params
  drizzle/
    0003_commits_and_unified_search.sql  # NEW: migration

packages/web/src/
  components/
    command-palette/
      command-palette.tsx    # Extend: enhanced result rendering
      search-result-item.tsx # NEW: result with badge + snippet + timestamp
      filter-chips.tsx       # NEW: dismissible AI filter chips
  hooks/
    use-search.ts            # NEW: search hook with AI filter state
  lib/
    search-utils.ts          # NEW: snippet truncation, highlight helpers

packages/shared/src/
  schemas/
    api.ts                   # Extend: searchQuerySchema + searchResultSchema
```

### Pattern 1: Contentless-Delete Unified FTS5 Index
**What:** A single FTS5 table indexing content from captures, commits, and projects with a discriminator column
**When to use:** When you need cross-source BM25 ranking in a single query
**Example:**
```sql
-- Source: SQLite FTS5 docs (https://sqlite.org/fts5.html)
-- contentless_delete=1 requires SQLite >= 3.43.0 (we have 3.49.2)
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  content,                    -- searchable text (capture text, commit message, project name+tagline)
  source_type UNINDEXED,      -- 'capture' | 'commit' | 'project' (not indexed, just stored)
  source_id UNINDEXED,        -- ID of the source record
  project_slug UNINDEXED,     -- project association for navigation
  created_at UNINDEXED,       -- timestamp for display + date filtering
  content='',                 -- contentless (no external content table)
  contentless_delete=1        -- supports DELETE + INSERT OR REPLACE
);
```

**Key insight:** UNINDEXED columns store metadata alongside the FTS content without bloating the index. The `source_type` and `source_id` columns are stored but not tokenized, so MATCH queries only search `content`. This gives us mixed results with source identification from a single FTS5 MATCH query.

### Pattern 2: AI Query Rewriter with Structured Output
**What:** Reuse the proven Vercel AI SDK + Gemini pattern to translate natural language to FTS5 queries
**When to use:** For question-like queries that need intent extraction
**Example:**
```typescript
// Follows exact pattern from ai-categorizer.ts
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const queryRewriteSchema = z.object({
  ftsQuery: z.string().describe("Optimized FTS5 search query with relevant terms"),
  projectFilter: z.string().nullable().describe("Project slug to filter by, or null"),
  typeFilter: z.enum(["capture", "commit", "project"]).nullable().describe("Source type filter, or null"),
  dateFilter: z.object({
    after: z.string().nullable().describe("ISO date string for 'after' filter, or null"),
    before: z.string().nullable().describe("ISO date string for 'before' filter, or null"),
  }).nullable().describe("Date range filter, or null"),
  reasoning: z.string().describe("Brief explanation of query interpretation"),
});

export type QueryRewriteResult = z.infer<typeof queryRewriteSchema>;
```

### Pattern 3: Smart Detection Heuristic
**What:** Route queries to direct FTS5 or AI rewriter based on query characteristics
**When to use:** Every search query passes through this gate
**Example:**
```typescript
// Heuristic: keyword queries go direct, natural language goes through AI
const QUESTION_WORDS = /^(what|when|where|who|how|why|which|find|show|get)\b/i;
const QUESTION_PATTERNS = /\?$|did i|was i|about the|related to|working on/i;

function needsAIRewrite(query: string): boolean {
  const words = query.trim().split(/\s+/);
  // 1-2 word queries are keywords, go direct to FTS5
  if (words.length <= 2 && !QUESTION_WORDS.test(query)) {
    return false;
  }
  // Question words or patterns -> AI rewrite
  if (QUESTION_WORDS.test(query) || QUESTION_PATTERNS.test(query)) {
    return true;
  }
  // 3+ words without clear keyword intent -> AI rewrite
  return words.length >= 3;
}
```

### Pattern 4: Graceful AI Degradation
**What:** When AI is unavailable, fall back to direct FTS5 keyword search
**When to use:** Always -- mirrors Phase 3 enrichment degradation pattern
**Example:**
```typescript
// Reuse isAIAvailable() from ai-categorizer.ts
import { isAIAvailable } from "./ai-categorizer.js";

async function processSearchQuery(rawQuery: string, projects: ProjectInfo[]) {
  if (!needsAIRewrite(rawQuery) || !isAIAvailable()) {
    // Direct FTS5: sanitize and search
    return { ftsQuery: sanitizeFtsQuery(rawQuery), filters: null };
  }
  try {
    return await rewriteQuery(rawQuery, projects);
  } catch {
    // AI failed: fallback to direct FTS5
    return { ftsQuery: sanitizeFtsQuery(rawQuery), filters: null };
  }
}
```

### Pattern 5: Commit Persistence with Deduplication
**What:** Scanner persists last 50 commits per project to SQLite on each poll cycle
**When to use:** During scanAllProjects -- after git scan, before cache set
**Example:**
```typescript
// Dedup strategy: upsert by (project_slug, hash) composite
// On each scan, upsert all commits from git log -- existing ones update, new ones insert
// No need to delete old commits: the 50-commit window per project means
// the table grows at most to N_projects * 50 rows
function upsertCommit(sqlite: Database.Database, commit: {
  hash: string;
  message: string;
  projectSlug: string;
  authorDate: string;
}) {
  // INSERT OR REPLACE on (project_slug, hash) unique constraint
}
```

### Anti-Patterns to Avoid
- **Multiple FTS5 queries with UNION:** Defeats BM25 cross-source ranking. Use a single unified table instead.
- **External content FTS5 with multi-table VIEW:** Tempting but fragile -- a VIEW across captures+commits+projects would need rowid mapping hacks and trigger maintenance becomes complex.
- **Client-side search result ranking:** The API must return results in rank order. Never re-sort on the client.
- **Synchronous AI rewriting:** The AI call adds 200-500ms latency. The existing 200ms debounce in the palette helps, but the API should still respond fast for keyword queries (no AI path).
- **Indexing archived captures:** Archived captures should still be searchable (CONTEXT.md: "archived captures remain searchable"). Do NOT filter them out of the FTS5 index.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search ranking | Custom TF-IDF scoring | FTS5 BM25 built-in | BM25 handles term frequency, inverse document frequency, document length normalization |
| Query sanitization | Custom regex escaping | Existing `sanitizeFtsQuery()` in search.ts | Already handles FTS5 operator injection, tested |
| Structured AI output | JSON.parse + manual validation | Vercel AI SDK Output.object + Zod | Type-safe, validated, error handling built in |
| Text highlighting | Custom regex-based highlighting | FTS5 `snippet()` function OR client-side mark | FTS5 snippet handles edge cases (overlapping matches, token boundaries) |
| AI availability check | Custom env var checking | Existing `isAIAvailable()` | Already handles both GEMINI_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY |

**Key insight:** The project already has every building block. This phase composes existing pieces (FTS5, AI SDK, command palette) rather than introducing new technology.

## Common Pitfalls

### Pitfall 1: FTS5 Contentless Table Data Loss on Update
**What goes wrong:** With contentless tables (not contentless-delete), you cannot DELETE or UPDATE rows. If you insert a row and need to update it, you're stuck.
**Why it happens:** Contentless FTS5 tables don't store document text, only the index. Without stored text, SQLite can't determine which tokens to remove.
**How to avoid:** Use `contentless_delete=1` (requires SQLite >= 3.43.0). Our better-sqlite3 bundles SQLite 3.49.2, so this is safe. Contentless-delete tables support DELETE and INSERT OR REPLACE.
**Warning signs:** "cannot DELETE from contentless fts5 table" error at runtime.

### Pitfall 2: BM25 Score Direction
**What goes wrong:** Sorting results by BM25 score in wrong direction -- higher scores appear first but BM25 in SQLite returns negative values where MORE negative = better match.
**Why it happens:** Most search engines use positive scores (higher = better). SQLite FTS5 bm25() returns negative scores by convention.
**How to avoid:** `ORDER BY rank` (ascending) NOT `ORDER BY rank DESC`. The existing `searchCaptures()` already does this correctly.
**Warning signs:** Worst matches appearing first in results.

### Pitfall 3: FTS5 Trigger Sync with Contentless-Delete
**What goes wrong:** Using triggers to auto-populate a contentless-delete FTS5 table fails because triggers operate on the source table's rowid, but contentless-delete tables manage their own rowid space.
**Why it happens:** Contentless-delete tables don't use external content tables, so there's no content_rowid mapping. You need explicit INSERT/DELETE, not triggers.
**How to avoid:** For captures and projects, use application-level inserts into the search_index after the Drizzle insert. For commits, insert during scanner persistence. Alternatively, use triggers on the source tables that INSERT into search_index (this works -- the trigger just does a regular INSERT, not a content sync). The key is that the search_index rowid is auto-assigned, not mapped to source rowids.
**Warning signs:** "no such column: new.rowid" errors or missing search results.

### Pitfall 4: AI Rewriter Latency Blocking Search
**What goes wrong:** Every search query waits 300-800ms for AI before showing results.
**Why it happens:** AI rewriter is called synchronously in the search path.
**How to avoid:** The smart detection heuristic is critical -- short keyword queries (most searches) skip AI entirely. For AI-routed queries, the existing 200ms debounce absorbs typing time, and the "Searching..." loading state in the palette provides feedback.
**Warning signs:** Perceived sluggishness on simple keyword searches.

### Pitfall 5: Drizzle Migration Journal Consistency
**What goes wrong:** Hand-written SQL migration files not registered in the Drizzle `_journal.json`, causing migrations to be skipped or re-run.
**Why it happens:** FTS5 virtual tables can't be generated by `drizzle-kit generate` (no virtual table support), so migrations are hand-written.
**How to avoid:** Follow the established pattern: create `0003_*.sql` with `--> statement-breakpoint` markers, and add entry to `drizzle/meta/_journal.json` with the next `idx` value (3) and matching `tag`. Also create a `0003_snapshot.json` (can copy from 0002 and add commits table).
**Warning signs:** Migration not running on startup, or running every startup.

### Pitfall 6: Snippet Length vs. Command Palette Space
**What goes wrong:** FTS5 snippet() returns text that's too long for the compact palette UI, causing overflow or ugly truncation.
**Why it happens:** FTS5 snippet max_tokens parameter controls word count, not character count. 10 tokens could be 80 chars or 200 chars.
**How to avoid:** Use FTS5 `snippet(search_index, 0, '<mark>', '</mark>', '...', 10)` for ~80 char snippets. Apply a character-level truncation as a safety net after FTS5 returns.
**Warning signs:** Long results breaking palette layout.

## Code Examples

### Unified Search Query with BM25
```sql
-- Source: SQLite FTS5 docs (https://sqlite.org/fts5.html)
-- Single query across all source types with BM25 ranking
SELECT
  rowid,
  content,
  source_type,
  source_id,
  project_slug,
  created_at,
  snippet(search_index, 0, '<mark>', '</mark>', '...', 10) AS snippet,
  bm25(search_index) AS rank
FROM search_index
WHERE search_index MATCH ?
ORDER BY rank
LIMIT ?;
```

### Unified Search with Filters
```sql
-- With source_type and project filters from AI rewriter
SELECT
  rowid,
  content,
  source_type,
  source_id,
  project_slug,
  created_at,
  snippet(search_index, 0, '<mark>', '</mark>', '...', 10) AS snippet,
  bm25(search_index) AS rank
FROM search_index
WHERE search_index MATCH ?
  AND (? IS NULL OR source_type = ?)
  AND (? IS NULL OR project_slug = ?)
ORDER BY rank
LIMIT ?;
```

### Insert into Contentless-Delete Search Index
```typescript
// Source: better-sqlite3 + FTS5 contentless-delete pattern
// Insert a capture into the unified search index
function indexCapture(sqlite: Database.Database, capture: {
  id: string;
  rawContent: string;
  projectId: string | null;
  createdAt: number;
}) {
  sqlite.prepare(`
    INSERT INTO search_index(content, source_type, source_id, project_slug, created_at)
    VALUES (?, 'capture', ?, ?, ?)
  `).run(capture.rawContent, capture.id, capture.projectId, capture.createdAt);
}

// Delete a capture from the search index (contentless_delete=1 supports this)
function deindexCapture(sqlite: Database.Database, captureId: string) {
  // With contentless-delete, we can DELETE by matching source_id
  // But we need rowid -- so query first or use a mapping
  // Better approach: store the rowid when indexing, or use a lookup
  sqlite.prepare(`
    DELETE FROM search_index WHERE source_type = 'capture' AND source_id = ?
  `).run(captureId);
}
```

**Important note on contentless-delete DELETE:** With `contentless_delete=1`, you CAN delete by any column condition, not just rowid. This is a key advantage over plain contentless tables. However, you CANNOT use MATCH in the WHERE clause of a DELETE. Use the UNINDEXED columns for filtering deletes.

### AI Query Rewriter Service
```typescript
// Source: Vercel AI SDK docs + existing ai-categorizer.ts pattern
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { isAIAvailable } from "./ai-categorizer.js";

const queryRewriteSchema = z.object({
  ftsQuery: z.string().describe("Space-separated search terms optimized for FTS5 matching"),
  projectFilter: z.string().nullable().describe("Project slug if query references a specific project"),
  typeFilter: z.enum(["capture", "commit", "project"]).nullable().describe("Source type if query asks for a specific type"),
  dateFilter: z.object({
    after: z.string().nullable(),
    before: z.string().nullable(),
  }).nullable().describe("Date range if query references time"),
  reasoning: z.string().describe("Brief explanation of interpretation"),
});

export async function rewriteQuery(
  naturalLanguageQuery: string,
  projects: Array<{ slug: string; name: string; tagline: string | null }>
): Promise<z.infer<typeof queryRewriteSchema>> {
  const modelId = process.env["AI_MODEL"] ?? "gemini-3-flash-preview";
  const projectContext = projects
    .map(p => `- ${p.slug}: ${p.name}${p.tagline ? ` (${p.tagline})` : ""}`)
    .join("\n");

  const { output } = await generateText({
    model: google(modelId),
    output: Output.object({ schema: queryRewriteSchema }),
    prompt: `You are a search query optimizer for a personal project management system.
Given a natural language question, extract:
1. Key search terms for full-text matching (FTS5 format, space-separated words)
2. Project filter if the query mentions a specific project
3. Type filter if asking for captures, commits, or projects specifically
4. Date range if the query mentions time

Available projects:
${projectContext}

User query: "${naturalLanguageQuery}"

Return optimized search parameters.`,
  });

  return output ?? {
    ftsQuery: naturalLanguageQuery,
    projectFilter: null,
    typeFilter: null,
    dateFilter: null,
    reasoning: "AI rewrite returned no output, using raw query",
  };
}
```

### Enhanced Search Result Schema
```typescript
// Source: existing searchResultSchema in packages/shared/src/schemas/api.ts
// Extended for unified search
export const searchResultSchema = z.object({
  id: z.string(),
  content: z.string(),
  snippet: z.string(),
  sourceType: z.enum(["capture", "commit", "project"]),
  sourceId: z.string(),
  projectSlug: z.string().nullable(),
  rank: z.number(),
  createdAt: z.string(),
});

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  query: z.string(),
  rewrittenQuery: z.string().nullable(),
  filters: z.object({
    project: z.string().nullable(),
    type: z.enum(["capture", "commit", "project"]).nullable(),
    dateAfter: z.string().nullable(),
    dateBefore: z.string().nullable(),
  }).nullable(),
});
```

### Commits Table Schema
```typescript
// Source: Drizzle ORM schema pattern from packages/api/src/db/schema.ts
export const commits = sqliteTable(
  "commits",
  {
    id: text("id").primaryKey(), // nanoid
    hash: text("hash").notNull(),
    message: text("message").notNull(),
    projectSlug: text("project_slug").notNull(),
    authorDate: text("author_date").notNull(), // ISO string
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("commits_project_slug_idx").on(table.projectSlug),
    // Unique constraint for deduplication
    index("commits_project_hash_idx").on(table.projectSlug, table.hash),
  ]
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plain contentless FTS5 (`content=''`) | Contentless-delete (`contentless_delete=1`) | SQLite 3.43.0 (2023-08) | Can DELETE rows from contentless tables -- critical for update/remove workflows |
| Separate FTS5 per table + UNION | Single unified FTS5 with UNINDEXED columns | Best practice (not new) | Native cross-source BM25 ranking without manual score merging |
| Manual JSON parsing for AI output | Vercel AI SDK Output.object + Zod | AI SDK v3+ (2024) | Type-safe structured output with built-in validation |

**Deprecated/outdated:**
- `captures_fts` and `project_metadata_fts`: These existing FTS5 tables will be replaced by the unified `search_index`. The old tables and their triggers should be dropped in the migration.

## Open Questions

1. **FTS5 snippet() with contentless-delete: does it work?**
   - What we know: contentless tables return NULL for column reads. snippet() needs column values to generate excerpts.
   - What's unclear: With `contentless_delete=1`, does FTS5 store enough data for snippet()? The docs say contentless-delete tables "support all the same queries as regular FTS5 tables."
   - Recommendation: Test in the first task. If snippet() doesn't work with contentless-delete, use the `content` UNINDEXED column value with client-side highlighting instead. **Update after verification:** According to SQLite docs, contentless-delete tables DO support auxiliary functions including snippet(). The data needed for snippet is stored in the FTS index itself.

2. **Commit volume and index growth**
   - What we know: 50 commits per project, ~15 active projects = ~750 rows. Scanner runs every 5 minutes.
   - What's unclear: Whether upserting 750 commits every 5 minutes causes noticeable write load on the FTS index.
   - Recommendation: Only upsert commits that are new (check hash existence before insert). This reduces writes to 0-5 per scan cycle typically.

3. **AI rewriter prompt tuning**
   - What we know: The prompt needs to translate "what was I thinking about for the flight app" into FTS5 terms like `"flight" "VFR" "navigation" "EFB"` + project filter `efb-212`.
   - What's unclear: How well Gemini 3 Flash handles this specific task without examples.
   - Recommendation: Start with zero-shot prompt, evaluate with 5-10 golden queries, iterate. The graceful fallback means poor AI results still return FTS5 keyword results.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.0 |
| Config file | `packages/api/vitest.config.ts`, `packages/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | Unified search returns captures, commits, AND projects | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts -x` | Partial (captures only) -- needs extension |
| SRCH-01 | AI rewriter translates natural language to FTS5 query | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/ai-query-rewriter.test.ts -x` | No -- Wave 0 |
| SRCH-01 | Smart detection routes keyword vs NL queries | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/ai-query-rewriter.test.ts -x` | No -- Wave 0 |
| SRCH-02 | Results include source_type badge and BM25 ranking | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts -x` | Partial -- needs new assertions |
| SRCH-02 | Commits table persists scanner data | unit | `pnpm --filter @mission-control/api test -- src/__tests__/db/queries/commits.test.ts -x` | No -- Wave 0 |
| SRCH-03 | AI fallback to FTS5 when unavailable | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts -x` | No -- Wave 0 |
| SRCH-03 | Filters (project, type, date) narrow results | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/services/ai-query-rewriter.test.ts` -- covers SRCH-01, SRCH-03 (smart detection, rewriter, fallback)
- [ ] `packages/api/src/__tests__/db/queries/commits.test.ts` -- covers SRCH-02 (commit persistence + dedup)
- [ ] Extend `packages/api/src/__tests__/routes/search.test.ts` -- covers SRCH-01, SRCH-02, SRCH-03 (unified results, source types, filters)

## Sources

### Primary (HIGH confidence)
- [SQLite FTS5 Extension docs](https://sqlite.org/fts5.html) -- contentless-delete tables, snippet(), highlight(), bm25(), UNINDEXED columns, trigger sync
- [Vercel AI SDK structured data docs](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) -- generateText + Output.object + Zod schema pattern
- Existing codebase: `packages/api/src/db/queries/search.ts`, `packages/api/src/services/ai-categorizer.ts`, `packages/web/src/components/command-palette/command-palette.tsx`

### Secondary (MEDIUM confidence)
- [Vercel Academy: Structured Data Extraction](https://vercel.com/academy/ai-sdk/structured-data-extraction) -- practical examples of structured output
- [FTS5 Integration and BM25 Ranking (DeepWiki)](https://deepwiki.com/KohakuBlueleaf/KohakuVault/6.2-fts5-integration-and-bm25-ranking) -- column weight tuning patterns
- [SQLite Full-Text Search practical patterns](https://thelinuxcode.com/sqlite-full-text-search-fts5-in-practice-fast-search-ranking-and-real-world-patterns/) -- snippet/highlight best practices

### Tertiary (LOW confidence)
- Smart detection heuristic design is based on general NLP patterns, not a specific authoritative source -- needs validation with real queries

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and proven in previous phases
- Architecture: HIGH -- FTS5 unified index is well-documented, contentless-delete confirmed available (SQLite 3.49.2 >> 3.43.0 minimum)
- Pitfalls: HIGH -- verified against official SQLite docs and existing codebase patterns
- AI rewriter: MEDIUM -- the Vercel AI SDK pattern is proven, but prompt engineering for query rewriting needs iteration with real queries

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable stack, no fast-moving dependencies)
