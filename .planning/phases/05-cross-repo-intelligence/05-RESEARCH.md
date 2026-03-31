# Phase 5: Cross-Repo Intelligence - Research

**Researched:** 2026-03-30
**Domain:** Vector embeddings, semantic similarity search, cross-repo pattern matching
**Confidence:** HIGH

## Summary

Phase 5 adds the "Seen in your other repos" intelligence layer -- the core differentiator for gstackapp. The implementation requires three capabilities: (1) embedding all findings via an external embedding API after pipeline completion, (2) querying sqlite-vec for cross-repo matches above a similarity threshold, and (3) surfacing matches in both PR comments and the dashboard detail view.

**Critical discovery: Anthropic does not offer an embedding model.** The CONTEXT.md decision D-01 references "Claude embeddings API" which does not exist. Anthropic officially recommends Voyage AI as their embedding partner. The best fit for code review findings is `voyage-code-3` ($0.18/MTok, first 200M tokens free) or `voyage-3.5` ($0.06/MTok for general purpose). An alternative is OpenAI `text-embedding-3-small` at $0.02/MTok. This research recommends Voyage AI since Anthropic explicitly partners with them and `voyage-code-3` is optimized for code-related content.

**Primary recommendation:** Use Voyage AI `voyage-code-3` (1024-dim, cosine distance) with sqlite-vec `vec0` virtual tables. Embed findings post-pipeline in the orchestrator's completion path. Query for cross-repo matches at comment render time. Store the embedding model identifier alongside vectors (per Pitfall 12) to enable future model migration.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Claude embeddings API for finding similarity -- consistent quality with the review pipeline, API cost per embed (**NOTE: Claude does not have an embeddings API; Anthropic recommends Voyage AI -- research recommends voyage-code-3 as closest match to this intent**)
- **D-02:** Embed all findings on pipeline completion (collection started in Phase 2 via sqlite-vec)
- **D-03:** sqlite-vec brute-force KNN search sufficient for single-user scale (<100K embeddings)
- **D-04:** "Seen in your other repos" callouts appear when cosine similarity exceeds threshold (tune empirically)
- **D-05:** Cross-repo matches surfaced in both PR comments (inline callout) and dashboard PR detail view
- **D-06:** Callout design: warm gold highlight (#FFD166) per DESIGN.md, with repo name + finding reference

### Claude's Discretion
- Exact similarity threshold (start with 0.85, tune based on false positive rate)
- How to handle cross-repo matches when the matched finding was marked as false positive
- Embedding batch size and rate limiting
- Whether to embed the full finding text or a normalized representation

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| XREP-01 | All findings embedded via sqlite-vec on pipeline completion | Embedding service module (voyage-code-3 API call) + vec0 virtual table insertion in orchestrator completion path |
| XREP-02 | Cross-repo matches surface "Seen in your other repos" callouts when similarity exceeds threshold | KNN query with cosine distance + metadata filtering by repo exclusion + threshold check in comment-renderer |
| XREP-03 | Cross-repo insights appear in both PR comment and dashboard detail view | Comment-renderer cross-repo section + new `/api/pipelines/:id` response field + dashboard CrossRepoInsights component |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack:** Hono + SQLite + Drizzle + React -- no additions needed, sqlite-vec was pre-decided
- **AI Provider:** Claude API only for reviews; embeddings require external provider (Voyage AI)
- **Deploy:** Mac Mini via Tailscale Funnel
- **Auth:** None for Phase 1
- **Display:** Desktop-only, dark mode only, 1024px min-width
- **Design:** Must follow DESIGN.md -- cross-repo insight highlight color is `#FFD166` (warm gold)
- **GSD Workflow:** All changes through GSD commands

## Standard Stack

### Core (Phase 5 additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sqlite-vec | 0.1.8 | Vector storage + KNN search | Pre-decided in CLAUDE.md. Zero-dependency C extension for better-sqlite3. Brute-force KNN sufficient at <100K scale. |
| voyageai | 0.2.1 | Embedding generation | Anthropic's official embedding partner. TypeScript SDK with auto-retries. voyage-code-3 model optimized for code. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Voyage AI (voyage-code-3) | OpenAI text-embedding-3-small | 9x cheaper ($0.02 vs $0.18/MTok) but lower quality for code-related content. Adds a second API provider (OpenAI key). |
| Voyage AI (voyage-code-3) | Voyage voyage-3.5 | General purpose, 3x cheaper ($0.06/MTok). Slightly worse for code-specific findings but good enough. |
| External API embeddings | Local model (e.g., nomic-embed) | Zero cost, no API dependency. But adds model hosting complexity and lower quality. Not worth it for Phase 1. |

**Recommendation on D-01 discrepancy:** The CONTEXT.md says "Claude embeddings API" but this does not exist. Anthropic's official documentation states they do not offer embedding models and recommends Voyage AI. Use `voyage-code-3` (code-optimized, 1024 dimensions, $0.18/MTok with 200M free tokens) as the closest match to D-01's intent of "consistent quality with the review pipeline." This requires a `VOYAGE_API_KEY` environment variable.

**Installation:**
```bash
npm install -w packages/api sqlite-vec voyageai
```

## Architecture Patterns

### Recommended Module Structure
```
packages/api/src/
  embeddings/
    client.ts          # Voyage AI client singleton
    embed.ts           # Embed finding text -> Float32Array
    store.ts           # sqlite-vec vec0 table operations (insert/query)
    search.ts          # Cross-repo similarity search (KNN + filtering)
    index.ts           # Barrel export
```

### Pattern 1: Post-Pipeline Embedding Ingestion

**What:** After the orchestrator sets COMPLETED status, embed all findings from this run and insert into the vec0 virtual table.
**When to use:** Always, on every completed pipeline run.
**Why:** Findings must be embedded before cross-repo intelligence can surface. Embedding happens post-pipeline to avoid adding latency to the review itself.

**Integration point in orchestrator.ts:**
```typescript
// After line 238 (Set COMPLETED status)
// Before the pipeline:completed event emission

// Embed findings for cross-repo intelligence (XREP-01)
embedPipelineFindings(input.runId).catch((err) => {
  logger.error({ runId: input.runId, error: (err as Error).message },
    'Finding embedding failed (non-fatal)')
})
```

**Key design choice:** Embedding is fire-and-forget from the orchestrator's perspective. A failed embedding should NOT fail the pipeline or prevent the PR comment from posting. The pipeline is complete; embeddings are additive intelligence.

### Pattern 2: sqlite-vec vec0 Virtual Table with Metadata

**What:** A vec0 virtual table stores finding embeddings with metadata columns for efficient KNN queries that filter by repo.
**When to use:** For all vector storage and retrieval in this phase.

**Schema:**
```sql
CREATE VIRTUAL TABLE vec_findings USING vec0(
  finding_id TEXT PRIMARY KEY,
  embedding float[1024] distance_metric=cosine,
  repo_full_name TEXT,
  stage TEXT,
  severity TEXT,
  +title TEXT,
  +description TEXT,
  +file_path TEXT
);
```

**Design decisions:**
- `finding_id` links back to the `findings` table via primary key
- `repo_full_name` as metadata column enables `WHERE repo_full_name != :current_repo` filtering in KNN queries
- `stage` and `severity` as metadata columns enable further filtering
- `+title`, `+description`, `+file_path` as auxiliary columns (prefix `+`) avoid JOIN overhead when displaying results
- 1024 dimensions matches voyage-code-3 default output
- `distance_metric=cosine` per D-04

### Pattern 3: Cross-Repo KNN Query with Repo Exclusion

**What:** When rendering a PR comment, query for similar findings from OTHER repos.
**When to use:** At comment render time (after pipeline completes) and in the dashboard detail API.

```sql
SELECT finding_id, title, description, file_path,
       repo_full_name, distance
FROM vec_findings
WHERE embedding MATCH ?
  AND k = 5
  AND repo_full_name != ?;
```

**Key insight:** The `repo_full_name != :current_repo` metadata filter ensures we only surface cross-repo matches, not same-repo duplicates. This is the core "Seen in your other repos" logic.

### Pattern 4: Normalized Finding Text for Embedding

**What:** Construct a standardized text representation of each finding for embedding, rather than embedding raw unstructured text.
**When to use:** When calling the embedding API.

```typescript
function normalizeFindingText(finding: {
  title: string
  description: string
  category: string
  severity: string
  filePath?: string | null
  suggestion?: string | null
}): string {
  const parts = [
    `[${finding.severity}] ${finding.category}: ${finding.title}`,
    finding.description,
  ]
  if (finding.filePath) parts.push(`File: ${finding.filePath}`)
  if (finding.suggestion) parts.push(`Suggestion: ${finding.suggestion}`)
  return parts.join('\n')
}
```

**Rationale:** Structured normalization produces more consistent embeddings than raw text. Including severity, category, and file path helps the embedding capture the semantic context of the finding, not just the text.

### Anti-Patterns to Avoid

- **Embedding at stage completion time:** Adds latency to the critical path. Embed after all stages complete.
- **Blocking pipeline on embedding failures:** Embeddings are additive; a Voyage API failure should never prevent a PR comment from posting.
- **Embedding without model version tracking:** Per Pitfall 12, store the model ID. If you switch models later, old embeddings become incompatible.
- **Using L2 distance for text similarity:** Cosine distance is standard for text embeddings. L2 is sensitive to vector magnitude.
- **Querying without repo exclusion:** Without `repo_full_name != :current_repo`, you'll surface same-repo duplicates instead of cross-repo patterns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text embedding generation | Custom local model / TF-IDF | Voyage AI voyage-code-3 | Code-optimized embeddings, API-based, Anthropic-recommended |
| Vector storage + KNN | Custom distance calculation loops | sqlite-vec vec0 virtual table | C extension, optimized brute-force KNN, metadata filtering |
| Float32 vector serialization | Manual Buffer manipulation | `new Float32Array(array).buffer` | Standard JS typed array API, sqlite-vec expects Buffer |
| Cosine similarity calculation | Manual dot product / normalization | sqlite-vec `distance_metric=cosine` | Built into the virtual table, handles normalization |
| Embedding rate limiting | Custom retry logic | voyageai SDK auto-retry | SDK has built-in exponential backoff (2 retries) |

**Key insight:** sqlite-vec handles the hard parts (distance calculation, KNN optimization, metadata filtering). Voyage AI handles embedding generation. The custom code is purely orchestration: when to embed, what text to embed, and where to display results.

## Common Pitfalls

### Pitfall 1: Embedding Model Drift (from PITFALLS.md #12)
**What goes wrong:** You switch from voyage-code-3 to a newer model. Old embeddings (1024-dim from old model) are incompatible with new embeddings. Similarity scores become meaningless.
**Why it happens:** Different models produce different vector spaces even at the same dimensionality.
**How to avoid:** Store `embedding_model` alongside each vector. When changing models, re-embed all historical findings or maintain separate vec0 tables per model version.
**Warning signs:** Similarity scores suddenly cluster around 0.5 (random) instead of showing meaningful spread.

### Pitfall 2: False Cross-Repo Matches at Low Thresholds
**What goes wrong:** Setting the similarity threshold too low (e.g., 0.7) surfaces dozens of vague "cross-repo matches" that are generic coding patterns, not meaningful insights. "Add error handling" matches "Add input validation" because both are about adding defensive code.
**Why it happens:** Code review findings share a lot of semantic overlap in natural language. Generic findings will match across any two repos.
**How to avoid:** Start at 0.85 threshold (per Claude's discretion). Only lower after manual review of match quality. Log all matches with their scores for threshold tuning.
**Warning signs:** More than 3 cross-repo matches per finding, or matches that feel like "of course any project would have this."

### Pitfall 3: Voyage API Latency Adding to Pipeline Duration
**What goes wrong:** Embedding N findings after pipeline completion adds N * API_call_latency to the total time before the PR comment is posted.
**Why it happens:** Sequential embedding calls. Each Voyage API call takes 100-500ms.
**How to avoid:** Batch embeddings in a single API call. Voyage supports multiple inputs in one request (batch embedding). For N findings, send one API call with N texts, not N calls with 1 text each. Maximum batch is 128 inputs per request.
**Warning signs:** Pipeline "completed" but PR comment appears 5-10 seconds later.

### Pitfall 4: sqlite-vec Extension Not Loaded
**What goes wrong:** Code tries to create vec0 virtual table but gets "no such module: vec0" error.
**Why it happens:** sqlite-vec must be explicitly loaded into the better-sqlite3 connection before any vec0 operations. Currently `client.ts` does NOT load sqlite-vec.
**How to avoid:** Call `sqliteVec.load(sqlite)` in `client.ts` after the Database is created and before any operations. This must happen once at startup.
**Warning signs:** Runtime error on first pipeline completion after Phase 5 deployment.

### Pitfall 5: Float32Array Buffer Binding in better-sqlite3
**What goes wrong:** Passing a JavaScript number array directly to sqlite-vec queries produces wrong results or errors.
**Why it happens:** sqlite-vec expects binary BLOB data (Float32Array buffer), not JSON arrays.
**How to avoid:** Always convert to `new Float32Array(vector).buffer` before binding as a parameter.
**Warning signs:** "wrong number of dimensions" errors, or all similarity scores returning 0.

## Code Examples

### Loading sqlite-vec in client.ts
```typescript
// Source: sqlite-vec npm docs + alexgarcia.xyz/sqlite-vec/js.html
import * as sqliteVec from 'sqlite-vec'
import Database, { type Database as DatabaseType } from 'better-sqlite3'

const sqlite = new Database(config.databasePath)

// Load sqlite-vec extension BEFORE any vec0 operations
sqliteVec.load(sqlite)

// Verify loaded
const [{ version }] = sqlite
  .prepare('SELECT vec_version() as version')
  .all() as any[]
console.log(`sqlite-vec loaded: ${version}`)
```

### Creating the vec0 Virtual Table
```typescript
// Source: alexgarcia.xyz/sqlite-vec features docs
function initVecTable(db: DatabaseType): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_findings USING vec0(
      finding_id TEXT PRIMARY KEY,
      embedding float[1024] distance_metric=cosine,
      repo_full_name TEXT,
      stage TEXT,
      severity TEXT,
      +title TEXT,
      +description TEXT,
      +file_path TEXT
    );
  `)
}
```

### Embedding Findings via Voyage AI
```typescript
// Source: voyageai npm package (0.2.1) + Voyage docs
import { VoyageAIClient } from 'voyageai'

const EMBEDDING_MODEL = 'voyage-code-3'
const EMBEDDING_DIMENSIONS = 1024

const voyage = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY,
})

async function embedTexts(
  texts: string[]
): Promise<Float32Array[]> {
  const response = await voyage.embed({
    input: texts,
    model: EMBEDDING_MODEL,
    inputType: 'document',
  })

  return response.data!.map((item) =>
    new Float32Array(item.embedding!)
  )
}
```

### Inserting Embeddings into vec0
```typescript
// Source: sqlite-vec docs -- Float32Array buffer binding
function insertFindingEmbedding(
  db: DatabaseType,
  findingId: string,
  embedding: Float32Array,
  metadata: {
    repoFullName: string
    stage: string
    severity: string
    title: string
    description: string
    filePath: string | null
  }
): void {
  const stmt = db.prepare(`
    INSERT INTO vec_findings(
      finding_id, embedding, repo_full_name, stage, severity,
      title, description, file_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    findingId,
    embedding.buffer,   // CRITICAL: pass .buffer, not the Float32Array
    metadata.repoFullName,
    metadata.stage,
    metadata.severity,
    metadata.title,
    metadata.description,
    metadata.filePath
  )
}
```

### KNN Cross-Repo Query
```typescript
// Source: alexgarcia.xyz/sqlite-vec/features/knn.html
interface CrossRepoMatch {
  finding_id: string
  title: string
  description: string
  file_path: string | null
  repo_full_name: string
  distance: number
}

function findCrossRepoMatches(
  db: DatabaseType,
  queryEmbedding: Float32Array,
  currentRepo: string,
  threshold: number = 0.85,
  k: number = 5
): CrossRepoMatch[] {
  const stmt = db.prepare(`
    SELECT finding_id, title, description, file_path,
           repo_full_name, distance
    FROM vec_findings
    WHERE embedding MATCH ?
      AND k = ?
      AND repo_full_name != ?
  `)

  const results = stmt.all(
    queryEmbedding.buffer,
    k,
    currentRepo
  ) as CrossRepoMatch[]

  // Filter by similarity threshold
  // Cosine distance: 0 = identical, 2 = opposite
  // Cosine similarity = 1 - cosine_distance
  // threshold 0.85 means distance < 0.15
  const maxDistance = 1 - threshold
  return results.filter((r) => r.distance <= maxDistance)
}
```

### PR Comment Cross-Repo Section
```typescript
// Integration into comment-renderer.ts
function renderCrossRepoSection(
  matches: CrossRepoMatch[]
): string {
  if (matches.length === 0) return ''

  const lines = [
    '',
    '---',
    '',
    '### Seen in your other repos',
    '',
  ]

  for (const match of matches) {
    const similarity = ((1 - match.distance) * 100).toFixed(0)
    lines.push(
      `> **${match.title}** -- ` +
      `\`${match.repo_full_name}\` ` +
      `(${similarity}% similar)`
    )
    if (match.file_path) {
      lines.push(`> File: \`${match.file_path}\``)
    }
    lines.push('')
  }

  return lines.join('\n')
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Anthropic recommended Voyage AI as embedding partner | Still current (no Claude-native embeddings) | Ongoing since 2024 | Must use external provider for embeddings |
| sqlite-vec brute-force only | sqlite-vec 0.1.8 adds metadata columns + partition keys | Nov 2024 | Enables filtered KNN queries without JOINs |
| voyage-code-2 | voyage-code-3 (1024-dim, 32K context) | Dec 2024 | Better code retrieval quality |

**Key version:** sqlite-vec 0.1.8 is the current stable release. It supports metadata columns (for WHERE filtering in KNN) and auxiliary columns (for sidecar data). This eliminates the need for JOINs back to the findings table for basic match display.

## Open Questions

1. **D-01 Discrepancy: Claude does not have an embeddings API**
   - What we know: Anthropic recommends Voyage AI. voyage-code-3 is code-optimized. The CONTEXT.md says "Claude embeddings API."
   - What's unclear: Whether the user intended Voyage AI specifically, or any embedding provider.
   - Recommendation: Proceed with Voyage AI voyage-code-3 as the closest match to intent. Flag in plan for user confirmation. Requires new env var `VOYAGE_API_KEY`.

2. **False positive filtering in cross-repo matches**
   - What we know: Findings can be marked with feedbackVote = 'down' (false positive).
   - What's unclear: Should a finding marked as false positive in repo A still surface as a cross-repo match in repo B?
   - Recommendation: Exclude findings with `feedbackVote = 'down'` from cross-repo match results. A false positive in one repo is likely noise in another. Implement as a post-query filter (not metadata filter, since feedbackVote can change after embedding).

3. **Embedding batch size for Voyage API**
   - What we know: Voyage supports up to 128 inputs per API call. Typical pipeline produces 5-50 findings.
   - What's unclear: Whether to batch all findings in one call or chunk.
   - Recommendation: Single batch for all findings from one pipeline run (will be well under 128). Only chunk if a pipeline somehow produces >128 findings.

4. **Re-embedding historical findings**
   - What we know: Phases 2-4 have been running and storing findings without embeddings.
   - What's unclear: Whether to backfill embeddings for existing findings or only embed new ones.
   - Recommendation: Include a one-time backfill script as a plan task. Cross-repo intelligence is only useful with accumulated embeddings.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| sqlite-vec (npm) | Vector storage | Not installed | 0.1.8 (registry) | -- (required) |
| voyageai (npm) | Embedding generation | Not installed | 0.2.1 (registry) | OpenAI text-embedding-3-small |
| VOYAGE_API_KEY | Embedding API auth | Not set | -- | Cannot embed without it |
| better-sqlite3 | Vector extension host | Installed | ^11.8 | -- |
| Node.js | Runtime | Available | ^22 LTS | -- |

**Missing dependencies with no fallback:**
- `VOYAGE_API_KEY` must be obtained from dash.voyageai.com and added to `.env`

**Missing dependencies with fallback:**
- sqlite-vec npm package: just needs `npm install -w packages/api sqlite-vec`
- voyageai npm package: just needs `npm install -w packages/api voyageai`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1 |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `npm run test -w packages/api -- --run` |
| Full suite command | `npm run test -w packages/api -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| XREP-01 | All findings embedded on pipeline completion | integration | `npx vitest run src/__tests__/embeddings.test.ts -t "embeds findings"` | Wave 0 |
| XREP-01 | sqlite-vec vec0 table creation and insertion | unit | `npx vitest run src/__tests__/embeddings.test.ts -t "inserts embedding"` | Wave 0 |
| XREP-01 | Embedding failure does not block pipeline | unit | `npx vitest run src/__tests__/embeddings.test.ts -t "non-fatal"` | Wave 0 |
| XREP-02 | KNN query returns cross-repo matches above threshold | unit | `npx vitest run src/__tests__/cross-repo-search.test.ts -t "above threshold"` | Wave 0 |
| XREP-02 | KNN query excludes same-repo findings | unit | `npx vitest run src/__tests__/cross-repo-search.test.ts -t "excludes same-repo"` | Wave 0 |
| XREP-02 | KNN query excludes false-positive findings | unit | `npx vitest run src/__tests__/cross-repo-search.test.ts -t "excludes false positives"` | Wave 0 |
| XREP-03 | PR comment includes cross-repo callout section | unit | `npx vitest run src/__tests__/comment.test.ts -t "cross-repo callout"` | Wave 0 |
| XREP-03 | Dashboard API returns cross-repo matches | integration | `npx vitest run src/__tests__/pipelines-route.test.ts -t "cross-repo"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -w packages/api -- --run`
- **Per wave merge:** Full suite green
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/embeddings.test.ts` -- covers XREP-01 (embedding ingestion, vec0 operations)
- [ ] `src/__tests__/cross-repo-search.test.ts` -- covers XREP-02 (KNN queries, threshold, filtering)
- [ ] Update `src/__tests__/comment.test.ts` -- add XREP-03 cross-repo comment rendering tests
- [ ] Update `src/__tests__/pipelines-route.test.ts` -- add XREP-03 dashboard API tests
- [ ] Test helper: mock Voyage AI client for deterministic embedding vectors
- [ ] Test helper: sqlite-vec loaded in test DB setup (`src/__tests__/helpers/test-db.ts`)

## Codebase Integration Points

### Files to Modify

| File | Change | Reason |
|------|--------|--------|
| `packages/api/src/db/client.ts` | Add `sqliteVec.load(sqlite)` after Database creation | sqlite-vec extension must be loaded before vec0 tables work |
| `packages/api/src/lib/config.ts` | Add `voyageApiKey` to config schema | VOYAGE_API_KEY environment variable |
| `packages/api/src/pipeline/orchestrator.ts` | Call `embedPipelineFindings()` after COMPLETED status | XREP-01: trigger embedding on pipeline completion |
| `packages/api/src/github/comment-renderer.ts` | Add `renderCrossRepoSection()` and include in `renderComment()` | XREP-03: cross-repo callouts in PR comments |
| `packages/api/src/github/comment.ts` | Pass cross-repo matches to comment renderer | XREP-03: query matches before rendering |
| `packages/api/src/routes/pipelines.ts` | Add cross-repo matches to `GET /:id` response | XREP-03: dashboard detail endpoint |
| `packages/web/src/components/feed/PRDetail.tsx` | Add CrossRepoInsights section after stage findings | XREP-03: dashboard display |
| `packages/web/src/components/layout/BottomStrip.tsx` | Replace placeholder with live cross-repo alerts | XREP-03: intelligence strip |
| `packages/api/package.json` | Add `sqlite-vec` and `voyageai` dependencies | New packages |

### Files to Create

| File | Purpose |
|------|---------|
| `packages/api/src/embeddings/client.ts` | Voyage AI client singleton |
| `packages/api/src/embeddings/embed.ts` | Finding text normalization + batch embedding |
| `packages/api/src/embeddings/store.ts` | vec0 table init, insert, query operations |
| `packages/api/src/embeddings/search.ts` | Cross-repo similarity search with filtering |
| `packages/api/src/embeddings/index.ts` | Barrel export |
| `packages/web/src/components/findings/CrossRepoInsight.tsx` | Individual cross-repo match card (warm gold #FFD166) |

### Existing Patterns to Follow

- **Module-level singleton clients:** Anthropic client in `stage-runner.ts` uses module-level `const anthropic = new Anthropic()`. Follow same pattern for Voyage AI client.
- **Fire-and-forget async operations:** Webhook handler uses `.catch()` for async pipeline dispatch. Follow same pattern for embedding ingestion.
- **Comment-renderer is pure functions:** All rendering in `comment-renderer.ts` is pure string manipulation. Cross-repo section follows this pattern.
- **Config via Zod schema:** Add `voyageApiKey` to the existing `configSchema` in `config.ts`.
- **Test DB setup in helpers:** `src/__tests__/helpers/test-db.ts` sets up the in-memory test database. Must add `sqliteVec.load()` there too.

## Sources

### Primary (HIGH confidence)
- [Anthropic Embeddings Docs](https://platform.claude.com/docs/en/build-with-claude/embeddings) -- Confirms Claude does NOT have embeddings; recommends Voyage AI
- [sqlite-vec JS docs](https://alexgarcia.xyz/sqlite-vec/js.html) -- Node.js usage with better-sqlite3
- [sqlite-vec KNN docs](https://alexgarcia.xyz/sqlite-vec/features/knn.html) -- KNN query syntax, distance metrics, metadata filtering
- [sqlite-vec metadata release blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html) -- Metadata columns, partition keys, auxiliary columns
- [voyageai npm](https://www.npmjs.com/package/voyageai) -- v0.2.1, TypeScript SDK
- [Voyage AI docs](https://docs.voyageai.com/docs/embeddings) -- voyage-code-3 model, pricing, batch API

### Secondary (MEDIUM confidence)
- [Voyage AI pricing](https://docs.voyageai.com/docs/pricing) -- voyage-code-3 at $0.18/MTok, 200M free tokens
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) -- v0.1.8 stable, vec0 examples
- [Embedding models comparison](https://elephas.app/blog/best-embedding-models) -- OpenAI vs Voyage quality/pricing comparison

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- sqlite-vec 0.1.8 verified on npm, voyageai 0.2.1 verified, Anthropic officially recommends Voyage
- Architecture: HIGH -- existing codebase patterns are clear, integration points well-defined
- Pitfalls: HIGH -- embedding drift documented in project PITFALLS.md, threshold tuning is standard ML practice

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable domain, 30-day validity)
