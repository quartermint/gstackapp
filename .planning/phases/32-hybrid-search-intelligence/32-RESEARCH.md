# Phase 32: Hybrid Search Intelligence - Research

**Researched:** 2026-03-23
**Domain:** Hybrid search (BM25 + vector + RRF fusion), sqlite-vec, local LLM embeddings, query expansion
**Confidence:** HIGH

## Summary

Phase 32 replaces MC's basic FTS5 keyword search + Gemini query rewriting with a production-grade hybrid search pipeline: BM25 + vector search + Reciprocal Rank Fusion + local query expansion via LM Studio. The existing stack (better-sqlite3, FTS5, Drizzle ORM, Vercel AI SDK) supports this upgrade with two new dependencies: `sqlite-vec` (native vector extension) and `@ai-sdk/openai-compatible` (LM Studio provider).

The architecture follows qmd's proven patterns: content-addressable storage via SHA-256 hash dedup, sqlite-vec two-step query pattern (vector query first, enrich with metadata second), RRF fusion with k=60 and weighted query variants, and graceful degradation when LM Studio is unavailable. The existing `search_index` FTS5 table remains as-is for BM25; a new `vec_search_index` vec0 virtual table stores embeddings alongside content hashes; and a SQLite-based job queue handles async embedding generation.

**Primary recommendation:** Use `sqlite-vec` 0.1.7 via npm with `@ai-sdk/openai-compatible` for LM Studio embeddings (nomic-embed-text-v1.5, 768 dimensions). Implement RRF fusion in application code. Keep FTS5 as the always-available fast path; vector search is an additive quality improvement that degrades gracefully.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Invisible upgrade -- same search box, better results behind the scenes. No new UI elements for search.
- **D-02:** sqlite-vec extension for vector embeddings, using LM Studio's OpenAI-compatible embedding endpoint
- **D-03:** Content-addressable storage via SHA-256 hash dedup for all indexed content (captures, commits, knowledge)
- **D-04:** Hybrid BM25 + vector search with Reciprocal Rank Fusion: `score = sum(weight / (k + rank + 1))`, k=60, original query gets 2x weight
- **D-05:** Query expansion via LM Studio replacing Gemini query rewriting. Falls back to direct FTS5 if LM Studio unavailable.
- **D-06:** Context annotations on projects returned with search results (like qmd's context tree)
- **D-07:** CLAUDE.md content indexed in unified search_index (currently separate LIKE query in knowledge.ts)
- **D-08:** Cross-encoder reranking optional quality pass -- implement if model performance allows
- **D-09:** Async job queue for embedding work: start with SQLite-based job table (not BullMQ+Redis)
- **D-10:** sqlite-vec two-step query pattern: vector query first (no JOINs), enrich with metadata second. sqlite-vec hangs when combined with JOINs.
- **D-11:** Start with Qwen3-Coder-30B for query expansion via LM Studio. Migrate to dedicated small model later if needed.

### Claude's Discretion
- Embedding model dimensions and chunking strategy
- RRF parameter tuning (k value, weight distribution)
- Which content types get vector embeddings vs FTS5-only
- Reranking implementation details

### Deferred Ideas (OUT OF SCOPE)
- Fine-tuned query expansion model (like qmd's custom Qwen3-1.7B) -- optimize later
- Named indexes for multiple search contexts -- not needed for single-user
- MCP search tool enhancement -- after search pipeline is proven
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRCH-01 | sqlite-vec extension with local embedding model via LM Studio | sqlite-vec 0.1.7 npm package loads into better-sqlite3 via `sqliteVec.load(db)`. LM Studio exposes `/v1/embeddings` endpoint. Vercel AI SDK `@ai-sdk/openai-compatible` provides `embed()` and `embedMany()` functions. Recommend nomic-embed-text-v1.5 (768 dim, Matryoshka support). |
| SRCH-02 | Content-addressable storage for all indexed content | SHA-256 hash dedup pattern already used in knowledge.ts (`contentHash` field). Extend to all content types. Content hash becomes the FK between FTS5 rows and vec0 rows -- if hash exists in vec0, skip re-embedding. |
| SRCH-03 | Hybrid BM25 + vector search with Reciprocal Rank Fusion | RRF formula: `score = sum(weight / (k + rank + 1))`, k=60. BM25 from existing FTS5 `bm25(search_index)`. Vector similarity from `vec_search_index` KNN query. Fuse in application-layer TypeScript. Original query gets 2x weight per D-04. |
| SRCH-04 | Query expansion via LM Studio replacing Gemini query rewriting | Replace `ai-query-rewriter.ts` Gemini calls with LM Studio chat completions via `@ai-sdk/openai-compatible`. Generate typed expansions (lex/vec). Falls back to direct FTS5 if LM Studio health != "ready". |
| SRCH-05 | Context annotations on projects returned with search results | Use existing project tagline + CLAUDE.md first paragraph as context annotation. Return alongside search results as `projectContext` field. No new data needed -- combine existing `projects.tagline` and `project_knowledge.content` (truncated). |
| SRCH-06 | CLAUDE.md content indexed in unified search (not separate LIKE query) | Index knowledge content into both FTS5 `search_index` (source_type = "knowledge") and `vec_search_index`. Replace `searchKnowledge()` LIKE query in knowledge.ts with unified search pipeline. |
| SRCH-07 | Cross-encoder reranking via LM Studio for top candidates | Optional quality pass. Use LM Studio chat completion to score (query, document) pairs for top 20 results. Position-aware blending: top results trust RRF more (75/25), deep results trust reranker more (40/60). Skip entirely if LM Studio unavailable. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** -- no `any` types, use `unknown`
- **Zod schemas** for all API boundaries (request validation, response shapes)
- **Naming**: files `kebab-case.ts`, types `PascalCase`, functions `camelCase`, constants `SCREAMING_SNAKE_CASE`
- **Typed errors**: `AppError` class with `code` and `status` properties
- **Conventional commits**: `feat(scope):`, `fix(scope):`, `chore(scope):`, etc.
- **Module system**: ESM (`"type": "module"`) throughout
- **Testing**: Vitest, `pnpm test`
- **Database**: SQLite via better-sqlite3 + Drizzle ORM, data in `./data/` (gitignored), FTS5 for full-text search
- **API-first**: Dashboard, iOS, CLI, MCP are all clients of the Hono API
- **Persist first, enrich later**: Captures hit SQLite immediately, AI categorizes async

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sqlite-vec | 0.1.7 | Vector search SQLite extension | Only production-grade vector extension for SQLite. Loads into better-sqlite3 via `sqliteVec.load(db)`. Supports vec0 virtual tables with metadata columns, partition keys, and KNN search. |
| @ai-sdk/openai-compatible | 2.0.37 | LM Studio provider for Vercel AI SDK | Official Vercel AI SDK provider for OpenAI-compatible endpoints. Provides `embed()`, `embedMany()`, `generateText()`. Already used pattern in MC (AI SDK + Google provider). |
| nomic-embed-text-v1.5 | GGUF | Local embedding model via LM Studio | 768-dim default, Matryoshka support (64-768 flexible), GGUF format, outperforms OpenAI ada-002. Load in LM Studio on Mac Mini. |

### Supporting (already in project)
| Library | Version | Purpose | Role in Phase |
|---------|---------|---------|---------------|
| better-sqlite3 | ^11.7.0 | SQLite driver | Loads sqlite-vec extension, executes vec0 queries |
| drizzle-orm | ^0.38.0 | ORM | Schema for new tables (embedding_jobs, etc). Vec0 tables managed via raw SQL. |
| ai (Vercel AI SDK) | ^6.0.116 | AI abstractions | `embed()`, `embedMany()`, `generateText()` for LM Studio |
| hono | ^4.6.0 | API framework | Search route enhancement |
| zod | ^3.24.0 | Schema validation | Extended search response schemas |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sqlite-vec (npm) | node-llama-cpp in-process embeddings | qmd uses this for zero-dependency embedding. MC already has LM Studio on Mac Mini -- no need for in-process GPU management. LM Studio approach is simpler. |
| nomic-embed-text-v1.5 | embedding-gemma-300M | qmd uses embeddinggemma. nomic-embed-text-v1.5 has better benchmarks, Matryoshka support for dimension flexibility, and broader LM Studio support. |
| SQLite job table | BullMQ + Redis | D-09 locks this: start simple with SQLite. Upgrade if scale demands it. MC has ~35 projects, ~500 captures -- SQLite job queue is plenty. |

**Installation:**
```bash
pnpm --filter @mission-control/api add sqlite-vec @ai-sdk/openai-compatible
```

**Version verification:** sqlite-vec 0.1.7 confirmed via `npm view sqlite-vec version` (2026-03-23). @ai-sdk/openai-compatible 2.0.37 confirmed via `npm view`.

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
├── db/
│   ├── queries/
│   │   ├── search.ts              # Extended: hybrid search orchestrator
│   │   ├── vector-search.ts       # NEW: sqlite-vec query functions
│   │   ├── embedding-jobs.ts      # NEW: job queue CRUD
│   │   └── knowledge.ts           # Modified: remove searchKnowledge LIKE query
│   ├── schema.ts                  # Extended: embeddingJobs table
│   └── index.ts                   # Modified: load sqlite-vec extension
├── services/
│   ├── ai-query-rewriter.ts       # Modified: LM Studio replaces Gemini
│   ├── lm-studio.ts               # Extended: inference + embedding client
│   ├── embedding-service.ts       # NEW: embedding generation + job processing
│   ├── rrf-fusion.ts              # NEW: Reciprocal Rank Fusion
│   ├── reranker.ts                # NEW: optional cross-encoder reranking
│   └── enrichment.ts              # Modified: trigger embedding on capture create
├── routes/
│   └── search.ts                  # Modified: hybrid pipeline integration
drizzle/
└── 0011_vector_search.sql         # NEW: vec0 table + embedding_jobs + content hashes
packages/shared/src/schemas/
└── api.ts                         # Extended: search response with vector scores
```

### Pattern 1: sqlite-vec Two-Step Query (D-10)
**What:** Vector search and metadata enrichment are separate SQL operations.
**When to use:** ALWAYS when querying sqlite-vec. The extension hangs when vec0 queries are combined with JOINs.
**Example:**
```typescript
// Source: https://alexgarcia.xyz/sqlite-vec/features/knn.html
// Step 1: Vector KNN query -- returns content_hash + distance only
const vectorResults = sqlite.prepare(`
  SELECT content_hash, distance
  FROM vec_search_index
  WHERE embedding MATCH ?
    AND k = ?
`).all(queryEmbedding, limit);

// Step 2: Enrich with metadata from regular tables
const enriched = vectorResults.map(vr => {
  const meta = sqlite.prepare(`
    SELECT content, source_type, source_id, project_slug, created_at
    FROM search_content
    WHERE content_hash = ?
  `).get(vr.content_hash);
  return { ...meta, vectorDistance: vr.distance };
});
```

### Pattern 2: Reciprocal Rank Fusion (D-04)
**What:** Combine ranked lists from BM25 and vector search into a single fused ranking.
**When to use:** Every hybrid search query.
**Example:**
```typescript
// Source: CONTEXT.md D-04 + https://medium.com/@devalshah1619/rrf-explained
interface RankedResult {
  contentHash: string;
  rank: number;
  source: 'bm25' | 'vector';
  weight: number;
}

const K = 60;

function computeRrfScores(
  rankedLists: RankedResult[][]
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const list of rankedLists) {
    for (const item of list) {
      const current = scores.get(item.contentHash) ?? 0;
      scores.set(
        item.contentHash,
        current + item.weight / (K + item.rank + 1)
      );
    }
  }

  return scores;
}

// Original query gets 2x weight (D-04)
// BM25 results from original query: weight = 2.0
// Vector results from original query: weight = 2.0
// BM25 results from expanded query: weight = 1.0
// Vector results from expanded query: weight = 1.0
```

### Pattern 3: Content-Addressable Storage (D-03)
**What:** SHA-256 hash of content is the dedup key. If hash exists, skip re-embedding.
**When to use:** Before embedding any content.
**Example:**
```typescript
// Source: Existing knowledge.ts contentHash pattern
import { createHash } from 'node:crypto';

function contentHash(text: string): string {
  // Normalize CRLF (existing pattern from Phase 24)
  const normalized = text.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

// Before embedding: check if hash already exists in vec_search_index
function needsEmbedding(sqlite: Database, hash: string): boolean {
  const row = sqlite.prepare(
    'SELECT 1 FROM search_content WHERE content_hash = ? AND embedded = 1'
  ).get(hash);
  return !row;
}
```

### Pattern 4: LM Studio Embedding via Vercel AI SDK
**What:** Use `@ai-sdk/openai-compatible` to call LM Studio's `/v1/embeddings` endpoint.
**When to use:** Generating embeddings for indexing and query-time embedding.
**Example:**
```typescript
// Source: https://ai-sdk.dev/providers/openai-compatible-providers/lmstudio
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embed, embedMany } from 'ai';

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://100.123.8.125:1234/v1',  // Mac Mini LM Studio
});

// Single embedding (query-time)
const { embedding } = await embed({
  model: lmstudio.embeddingModel('text-embedding-nomic-embed-text-v1.5'),
  value: 'how does the capture pipeline work',
});
// embedding is number[] -- convert to Float32Array for sqlite-vec

// Batch embeddings (indexing)
const { embeddings } = await embedMany({
  model: lmstudio.embeddingModel('text-embedding-nomic-embed-text-v1.5'),
  values: ['chunk 1 text', 'chunk 2 text', 'chunk 3 text'],
});
```

### Pattern 5: Graceful Degradation
**What:** Search always works. Vector search and query expansion are additive quality improvements.
**When to use:** Core design principle -- never let AI unavailability break search.
**Example:**
```typescript
// Search pipeline degradation levels:
// Level 0 (full): Query expansion + BM25 + Vector + RRF + Reranking
// Level 1 (no reranking): Query expansion + BM25 + Vector + RRF
// Level 2 (no expansion): Direct BM25 + Vector + RRF
// Level 3 (BM25 only): FTS5 keyword search (current behavior)

// Decision tree:
// LM Studio "ready"? → Level 0 or 1 (based on latency budget)
// LM Studio "loading"? → Level 3 (FTS5 only)
// LM Studio "unavailable"? → Level 3 (FTS5 only)
// Embeddings exist for content? → Include vector results
// No embeddings yet? → BM25 only for that content
```

### Anti-Patterns to Avoid
- **JOINing vec0 tables directly:** sqlite-vec hangs on complex JOINs. Always use the two-step pattern (D-10).
- **Blocking API on embedding generation:** Embeddings are async. Never make a search request wait for embedding generation. Use the job queue.
- **Replacing FTS5 with vector search:** BM25 and vector search are complementary. BM25 excels at exact keyword matches; vector search finds semantic similarities. Both must exist.
- **Storing embeddings in the FTS5 table:** FTS5 and vec0 are separate virtual tables with different storage engines. Keep them separate, linked by content_hash.
- **Trusting reranker over retrieval for top results:** qmd's position-aware blending trusts retrieval more for top results (75/25) and reranker more for deep results (40/60). Don't let the reranker destroy good keyword matches.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | Custom distance calculations + brute force scan | sqlite-vec vec0 virtual table | Optimized C extension with KNN indexing. Orders of magnitude faster than brute force. |
| Embedding generation | Custom model loading / ONNX runtime | LM Studio + @ai-sdk/openai-compatible | LM Studio manages GPU, model lifecycle, batching. Zero model management code in MC. |
| Text embedding format | Custom serialization | Float32Array.buffer | sqlite-vec expects raw float buffers. Float32Array is the standard bridge. |
| Content hashing | Custom normalization | crypto.createHash('sha256') with CRLF normalization | Node.js built-in. Already established pattern in knowledge.ts (Phase 24). |
| Query expansion prompting | Custom prompt engineering from scratch | Adapt qmd's typed expansion pattern (lex/vec) | Proven pattern: generate keyword (lex) and semantic (vec) variants. |

**Key insight:** The heavy lifting is in sqlite-vec (vector storage/search) and LM Studio (embedding/inference). MC's code orchestrates between these systems and handles degradation. The application layer is fusion logic + job orchestration + graceful degradation -- not ML infrastructure.

## Common Pitfalls

### Pitfall 1: sqlite-vec JOIN Hangs
**What goes wrong:** Combining vec0 KNN queries with JOINs to other tables causes sqlite-vec to hang indefinitely.
**Why it happens:** sqlite-vec's query planner doesn't optimize cross-table JOINs correctly. The KNN scan runs unbounded.
**How to avoid:** Always use the two-step pattern (D-10). First query vec0 for content_hash + distance, then enrich from regular tables.
**Warning signs:** Query taking >5 seconds, connection timeouts in tests.

### Pitfall 2: Embedding Model Not Loaded in LM Studio
**What goes wrong:** LM Studio is running (health probe returns "ready" for chat model) but embedding model isn't loaded. Embedding calls fail silently or return errors.
**Why it happens:** LM Studio loads models on demand. The embedding model (nomic-embed-text-v1.5) must be explicitly loaded alongside the chat model (qwen3-coder).
**How to avoid:** Extend the health probe to check for embedding model availability specifically. Add an embedding model target to `lmStudioConfigSchema` in config.ts.
**Warning signs:** Embedding jobs failing with connection errors despite LM Studio showing "ready".

### Pitfall 3: Float32Array Buffer Alignment
**What goes wrong:** Passing a JavaScript number[] array to sqlite-vec instead of Float32Array.buffer causes incorrect results or crashes.
**Why it happens:** sqlite-vec expects raw IEEE 754 float32 binary blobs, not JSON arrays.
**How to avoid:** Always convert: `new Float32Array(embedding).buffer` before binding to sqlite-vec parameters.
**Warning signs:** "Wrong number of dimensions" errors, garbage distance values.

### Pitfall 4: Embedding Dimension Mismatch
**What goes wrong:** Vec0 table created with float[768] but embeddings generated with different dimensions.
**Why it happens:** Switching embedding models or using Matryoshka truncation without updating table schema.
**How to avoid:** Store embedding dimension in config. Validate at startup. If dimension changes, re-embed everything (job queue handles this).
**Warning signs:** sqlite-vec errors about vector length mismatch.

### Pitfall 5: Blocking Search on Embedding Generation
**What goes wrong:** Search endpoint waits for query embedding before returning any results. If LM Studio is slow (cold model), search hangs for 5-30 seconds.
**Why it happens:** Calling `embed()` synchronously in the search request path without a timeout.
**How to avoid:** Set a tight timeout (2s) on query-time embedding. If it times out, fall back to BM25-only results. The job queue handles indexing-time embeddings separately.
**Warning signs:** Search latency spikes correlated with LM Studio cold starts.

### Pitfall 6: FTS5 search_index Becomes Stale for Knowledge Content
**What goes wrong:** Knowledge content indexed in FTS5 but not updated when CLAUDE.md files change.
**Why it happens:** Currently knowledge aggregation updates `project_knowledge` table but doesn't re-index in `search_index`.
**How to avoid:** Hook into the knowledge upsert flow to re-index both FTS5 and queue vector re-embedding when content_hash changes.
**Warning signs:** Searching for recently updated CLAUDE.md content returns stale results.

## Code Examples

### Vec0 Table Creation (Migration)
```sql
-- Source: https://alexgarcia.xyz/sqlite-vec/features/knn.html
-- 0011_vector_search.sql

-- Content registry: links content_hash to source metadata
CREATE TABLE IF NOT EXISTS search_content (
  content_hash TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL,      -- 'capture' | 'commit' | 'project' | 'knowledge'
  source_id TEXT NOT NULL,
  project_slug TEXT,
  created_at TEXT NOT NULL,
  embedded INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS search_content_source_idx
  ON search_content(source_type, source_id);

-- Vector index: separate from content for two-step pattern
CREATE VIRTUAL TABLE IF NOT EXISTS vec_search_index USING vec0(
  content_hash TEXT PRIMARY KEY,
  embedding float[768] distance_metric=cosine
);

-- Embedding job queue: SQLite-based async processing (D-09)
CREATE TABLE IF NOT EXISTS embedding_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'processing' | 'complete' | 'failed'
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS embedding_jobs_status_idx
  ON embedding_jobs(status);

-- LLM cache table for query expansion and reranking results
CREATE TABLE IF NOT EXISTS llm_cache (
  cache_key TEXT PRIMARY KEY,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS llm_cache_expires_idx ON llm_cache(expires_at);
```

### Loading sqlite-vec in Database Init
```typescript
// Source: https://alexgarcia.xyz/sqlite-vec/js.html
// Modify packages/api/src/db/index.ts
import * as sqliteVec from 'sqlite-vec';

export function createDatabase(dbPath: string = ...): DatabaseInstance {
  const sqlite = new Database(dbPath);

  // Load sqlite-vec extension BEFORE pragmas
  sqliteVec.load(sqlite);

  // Performance pragmas (existing)
  sqlite.pragma('journal_mode = WAL');
  // ... rest of existing pragmas

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });

  return { db, sqlite };
}
```

### LM Studio Embedding Client
```typescript
// Source: https://ai-sdk.dev/providers/openai-compatible-providers/lmstudio
// packages/api/src/services/lm-studio.ts (extend existing)
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embed, embedMany, generateText, Output } from 'ai';

const EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';
const EMBEDDING_DIMENSIONS = 768;

export function createLmStudioProvider(baseURL: string) {
  return createOpenAICompatible({
    name: 'lmstudio',
    baseURL,
  });
}

export async function generateEmbedding(
  provider: ReturnType<typeof createLmStudioProvider>,
  text: string
): Promise<Float32Array> {
  const { embedding } = await embed({
    model: provider.embeddingModel(EMBEDDING_MODEL),
    value: text,
    maxRetries: 1,
  });
  return new Float32Array(embedding);
}

export async function generateEmbeddings(
  provider: ReturnType<typeof createLmStudioProvider>,
  texts: string[]
): Promise<Float32Array[]> {
  const { embeddings } = await embedMany({
    model: provider.embeddingModel(EMBEDDING_MODEL),
    values: texts,
    maxRetries: 1,
  });
  return embeddings.map(e => new Float32Array(e));
}
```

### RRF Fusion Implementation
```typescript
// packages/api/src/services/rrf-fusion.ts
interface FusionCandidate {
  contentHash: string;
  rank: number;
  weight: number;
}

const RRF_K = 60;

export function fuseResults(
  rankedLists: FusionCandidate[][]
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const list of rankedLists) {
    for (const item of list) {
      const current = scores.get(item.contentHash) ?? 0;
      scores.set(
        item.contentHash,
        current + item.weight / (RRF_K + item.rank + 1)
      );
    }
  }

  return scores;
}

// Sort by fused score descending
export function rankByFusion(scores: Map<string, number>): string[] {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hash]) => hash);
}
```

## Discretion Recommendations

### Embedding Dimensions: 768 (full nomic-embed-text-v1.5)
**Rationale:** MC's corpus is small (~35 projects, ~500 captures, ~5000 commits). Storage is not a concern. 768 dimensions gives best retrieval quality. Matryoshka allows reducing to 256 or 384 later if needed without re-embedding the model -- just truncate stored vectors and recreate the vec0 table.

### Chunking Strategy: No chunking for v2.0 Phase 32
**Rationale:** MC content is naturally small:
- Captures: typically 1-3 sentences (well under 512 tokens)
- Commit messages: 1-2 lines
- Project metadata: name + tagline (< 50 tokens)
- CLAUDE.md: the only potentially long content (1-5KB)

For CLAUDE.md, embed the first 512 tokens (roughly the project overview section) plus embed each major heading section separately. This gives both a document-level embedding and section-level granularity. Commit messages and captures are embedded whole.

### Content Types for Vector Embeddings: All four types
**Rationale:** Every content type benefits from semantic search:
- **Captures**: "how does the capture pipeline work" should find relevant captures even without keyword "capture"
- **Commits**: "performance improvements" should find commits about optimization even if they say "optimize" not "performance"
- **Projects**: Semantic project discovery
- **Knowledge (CLAUDE.md)**: The highest-value content for semantic search -- architectural decisions, patterns, conventions

### RRF Parameters: k=60, original query 2x weight
**Rationale:** k=60 is the standard value from the original RRF paper, proven across many domains. 2x weight for original query ensures user intent is preserved even through query expansion. These are locked in D-04 but the recommendation aligns.

### Reranking: Implement but gate behind latency budget
**Rationale:** Cross-encoder reranking via LM Studio chat is expensive (100-500ms per candidate pair). Gate behind a 2-second total budget. Rerank top 20 candidates. Use position-aware blending from qmd: top 5 results get 75% RRF / 25% reranker, remaining get 40% RRF / 60% reranker. Skip entirely if budget exceeded or LM Studio unavailable.

## State of the Art

| Old Approach (v1.0-v1.4) | Current Approach (v2.0 Phase 32) | When Changed | Impact |
|--------------------------|----------------------------------|--------------|--------|
| FTS5 keyword search only | Hybrid BM25 + vector + RRF | Phase 32 | Semantic understanding without keyword matches |
| Gemini API for query rewriting | LM Studio local LLM for query expansion | Phase 32 | No external API dependency for search |
| LIKE query for knowledge search | Unified FTS5 + vector index | Phase 32 | CLAUDE.md content searchable alongside captures/commits |
| Single FTS5 query → results | Multi-signal pipeline → fused ranking | Phase 32 | Dramatically better relevance for natural language queries |

**Deprecated/outdated:**
- `@ai-sdk/google` for search query rewriting: replaced by `@ai-sdk/openai-compatible` pointing at LM Studio
- `searchKnowledge()` LIKE query in knowledge.ts: replaced by unified search pipeline
- `rewriteQuery()` Gemini call in ai-query-rewriter.ts: replaced by local query expansion

## Open Questions

1. **Embedding model loading in LM Studio**
   - What we know: LM Studio exposes `/v1/embeddings` and supports nomic-embed-text-v1.5 GGUF
   - What's unclear: Can LM Studio load both a chat model (Qwen3-Coder-30B) and embedding model (nomic-embed-text-v1.5) simultaneously? Or does one unload the other?
   - Recommendation: Test on Mac Mini during execution. If only one model at a time, embedding jobs run in batches when embedding model is active, query expansion uses chat model. Worst case: embed at indexing time, skip query-time embedding.

2. **sqlite-vec in-memory database for tests**
   - What we know: `sqliteVec.load(db)` works with better-sqlite3 including `:memory:` databases
   - What's unclear: Whether the npm package includes prebuilt binaries for all platforms or requires compilation
   - Recommendation: Test during execution. The npm package includes platform-specific binaries (sqlite-vec-darwin-arm64 confirmed at 0.1.7).

3. **Existing FTS5 search_index migration**
   - What we know: FTS5 virtual tables cannot be ALTERed. The existing `search_index` must remain as-is.
   - What's unclear: How to add knowledge content to the existing search_index without breaking existing queries
   - Recommendation: INSERT knowledge content into existing FTS5 search_index with source_type = 'knowledge'. No schema change needed -- the INSERT is the only change. Vec0 is a completely separate table.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v22.22.0 | -- |
| pnpm | Package management | Yes | 9.15.0 | -- |
| better-sqlite3 | Database | Yes | ^11.7.0 (installed) | -- |
| sqlite-vec (npm) | Vector search | Not yet installed | 0.1.7 (registry) | -- (required) |
| @ai-sdk/openai-compatible | LM Studio embeddings | Not yet installed | 2.0.37 (registry) | -- (required) |
| LM Studio (Mac Mini) | Embedding generation | Yes (health probe exists) | Running at 100.123.8.125:1234 | Graceful degradation to BM25-only |
| nomic-embed-text-v1.5 | Embedding model | Unknown (needs loading in LM Studio) | GGUF | Graceful degradation to BM25-only |
| Qwen3-Coder-30B | Query expansion | Yes (existing target model) | Loaded in LM Studio | Direct FTS5 query (no expansion) |

**Missing dependencies with no fallback:**
- `sqlite-vec` and `@ai-sdk/openai-compatible` must be installed via pnpm (install step required)

**Missing dependencies with fallback:**
- nomic-embed-text-v1.5 model in LM Studio: if not loaded, all search falls back to BM25-only (graceful degradation per D-05)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | sqlite-vec loads and vec0 table accepts/queries embeddings | unit | `pnpm --filter @mission-control/api test -- src/__tests__/db/queries/vector-search.test.ts -x` | Wave 0 |
| SRCH-02 | Content-addressable storage deduplicates by SHA-256 hash | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/embedding-service.test.ts -x` | Wave 0 |
| SRCH-03 | RRF fusion combines BM25 + vector ranked lists correctly | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/rrf-fusion.test.ts -x` | Wave 0 |
| SRCH-04 | Query expansion generates typed variants via LM Studio (mocked) | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/ai-query-rewriter.test.ts -x` | Exists (needs extension) |
| SRCH-04 | Falls back to FTS5 when LM Studio unavailable | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts -x` | Exists (needs extension) |
| SRCH-05 | Context annotations returned with search results | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts -x` | Exists (needs extension) |
| SRCH-06 | Knowledge content searchable in unified pipeline | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/search.test.ts -x` | Exists (needs extension) |
| SRCH-07 | Reranking improves result order for top candidates (mocked) | unit | `pnpm --filter @mission-control/api test -- src/__tests__/services/reranker.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/db/queries/vector-search.test.ts` -- covers SRCH-01 (sqlite-vec load, vec0 CRUD, KNN query)
- [ ] `packages/api/src/__tests__/services/embedding-service.test.ts` -- covers SRCH-02 (content hash dedup, job queue)
- [ ] `packages/api/src/__tests__/services/rrf-fusion.test.ts` -- covers SRCH-03 (fusion scoring, weight handling, edge cases)
- [ ] `packages/api/src/__tests__/services/reranker.test.ts` -- covers SRCH-07 (position-aware blending, timeout, skip)
- [ ] Extend `packages/api/src/__tests__/services/ai-query-rewriter.test.ts` -- covers SRCH-04 (LM Studio expansion, typed variants)
- [ ] Extend `packages/api/src/__tests__/routes/search.test.ts` -- covers SRCH-03, SRCH-05, SRCH-06 (hybrid results, context, knowledge)

## Sources

### Primary (HIGH confidence)
- [sqlite-vec official docs](https://alexgarcia.xyz/sqlite-vec/) - vec0 syntax, KNN queries, metadata columns, partition keys, distance metrics
- [sqlite-vec npm](https://www.npmjs.com/package/sqlite-vec) - version 0.1.7, better-sqlite3 integration via `sqliteVec.load(db)`
- [sqlite-vec KNN docs](https://alexgarcia.xyz/sqlite-vec/features/knn.html) - Two-step CTE pattern, MATCH syntax, k parameter
- [sqlite-vec metadata blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html) - Metadata columns, partition keys, auxiliary columns, filtering in KNN WHERE
- [Vercel AI SDK LM Studio provider](https://ai-sdk.dev/providers/openai-compatible-providers/lmstudio) - @ai-sdk/openai-compatible setup, embed(), embedMany()
- [LM Studio embeddings API](https://lmstudio.ai/docs/developer/openai-compat/embeddings) - POST /v1/embeddings, OpenAI-compatible format
- [nomic-embed-text-v1.5 GGUF](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF) - 768 dimensions, Matryoshka 64-768, GGUF format

### Secondary (MEDIUM confidence)
- [tobi/qmd GitHub](https://github.com/tobi/qmd) - Hybrid search architecture, RRF fusion, two-step pattern, content-addressable storage, query expansion
- [tobi/qmd CLAUDE.md](https://github.com/tobi/qmd/blob/main/CLAUDE.md) - Architecture overview, component interaction patterns
- [RRF explanation](https://medium.com/@devalshah1619/mathematical-intuition-behind-reciprocal-rank-fusion-rrf-explained-in-2-mins-002df0cc5e2a) - Formula derivation, k=60 rationale
- [RRF TypeScript implementation](https://alexop.dev/tils/reciprocal-rank-fusion-typescript-vue/) - TypeScript-specific implementation patterns

### Tertiary (LOW confidence)
- LM Studio simultaneous model loading (chat + embedding) -- needs validation on Mac Mini hardware

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- sqlite-vec and @ai-sdk/openai-compatible are well-documented, version-verified, and compatible with existing MC stack
- Architecture: HIGH -- Two-step query pattern, RRF fusion, and content-addressable storage are proven patterns from qmd with the same underlying stack
- Pitfalls: HIGH -- sqlite-vec JOIN hanging is well-documented. LM Studio model loading is the main uncertainty (MEDIUM for that specific item).

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable libraries, no breaking changes expected)
