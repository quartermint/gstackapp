# Phase 19: gbrain Integration - Research

**Researched:** 2026-04-11
**Domain:** MCP client integration, async prefetch caching, knowledge-aware AI pipelines
**Confidence:** HIGH

## Summary

Phase 19 connects the gbrain MCP server (running on Mac Mini via SSH/stdio transport) to gstackapp's operator pipeline. The gbrain server is a real, deployed system with 30+ MCP tools built on `@modelcontextprotocol/sdk`. The three tools relevant to this phase are `query` (hybrid search with vector + keyword), `get_page` (entity lookup by slug), and `get_links`/`get_backlinks`/`traverse_graph` (related pages). These map to the design doc's `gbrain_search`, `gbrain_entity`, and `gbrain_related` concepts respectively.

The integration has two paths: (1) the operator pipeline's clarification stage needs gbrain context injected into the `generateClarificationQuestion()` function in `packages/api/src/pipeline/clarifier.ts`, and (2) the spawned Claude Code subprocess needs gbrain context available in its system prompt or request.json. Both paths consume the same cached prefetch data stored in a new Postgres table keyed by pipeline run ID.

**Primary recommendation:** Use `@modelcontextprotocol/sdk` Client class with `StdioClientTransport` wrapping `ssh ryans-mac-mini "cd /Volumes/4tb/gbrain && bun run src/cli.ts serve"` -- mirroring exactly how Claude Code already connects to gbrain. Build a thin `GbrainClient` wrapper that maps the three design-doc operations to actual gbrain tool names, handles connection lifecycle, and provides graceful degradation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
User confirmed this phase's key decisions are already locked: async prefetch, graceful degradation, MCP tool interface. All implementation details are Claude's discretion.

### Claude's Discretion
- D-01: How gbrain MCP tools are called from the harness -- tool injection pattern, request format
- D-02: Async prefetch timing and caching strategy -- cache per pipeline run in Postgres, invalidation approach
- D-03: Knowledge surfacing in clarification questions (GB-03) -- how gbrain context enhances questions, attribution style
- D-04: Graceful degradation UX -- "Running without knowledge context" indicator placement and styling
- D-05: Cache schema design in Postgres for gbrain results

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GB-01 | Harness can call gbrain MCP tools (gbrain_search, gbrain_entity, gbrain_related) | GbrainClient wrapper using `@modelcontextprotocol/sdk` Client + StdioClientTransport over SSH. Actual tool names: `query`, `get_page`, `get_links`/`traverse_graph` |
| GB-02 | gbrain queries run as async prefetch at pipeline start, cached per pipeline run in Postgres | New `gbrain_cache` table in Drizzle schema, prefetch triggered in POST /request before clarification, results keyed by request ID |
| GB-03 | For requests naming known project/person, clarification includes context-loaded question from gbrain | Entity detection in request text, `get_page` lookup for known entities, context injected into `generateClarificationQuestion()` system prompt |
| GB-04 | If gbrain MCP server unavailable, pipeline runs with graceful degradation and "Running without knowledge context" flag | Connection timeout (5s), catch-all error handling in GbrainClient, `hasKnowledgeContext` boolean propagated through pipeline events |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack: Hono + Postgres (Neon) + Drizzle + React -- no new frameworks
- AI Provider: @anthropic-ai/sdk for Claude API calls
- Deploy: Mac Mini via Tailscale -- gbrain MCP server runs on the same Mac Mini
- Auth: Not relevant for this phase (pipeline internals)
- Display: Desktop-only, dark mode only (for any UI indicators)
- DESIGN.md must be consulted for any visual changes
- GSD Workflow Enforcement: all work through GSD commands

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | 1.29.0 | MCP client for connecting to gbrain server | Official MCP TypeScript SDK. gbrain server already uses this SDK for its server implementation. Client class provides transport-agnostic connection. [VERIFIED: npm registry] |
| drizzle-orm | ^0.45.2 | Postgres ORM for cache table | Already in stack, used for all DB operations. [VERIFIED: existing package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @anthropic-ai/sdk | ^0.80 | Claude API for clarification with gbrain context | Already in stack, used by clarifier.ts. [VERIFIED: existing package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @modelcontextprotocol/sdk Client | Raw SSH + JSON-RPC over stdio | MCP SDK handles protocol negotiation, capability exchange, tool schema discovery. Hand-rolling is error-prone and fragile. |
| Direct HTTP to gbrain | StdioClientTransport over SSH | gbrain only exposes stdio transport. No HTTP/SSE server exists. [VERIFIED: gbrain MCP server source] |
| In-memory cache | Postgres cache table | Postgres cache survives process restarts, is queryable for audit trail (GB-03 verification), and consistent with existing patterns. |

**Installation:**
```bash
cd packages/api && npm install @modelcontextprotocol/sdk
```

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
├── gbrain/
│   ├── client.ts          # GbrainClient: MCP connection, tool call wrapper
│   ├── prefetch.ts        # Async prefetch orchestrator, entity detection
│   ├── cache.ts           # Postgres cache read/write operations
│   └── types.ts           # Zod schemas for gbrain responses
├── pipeline/
│   ├── clarifier.ts       # MODIFIED: accepts optional gbrain context
│   └── ...
└── db/
    └── schema.ts          # MODIFIED: add gbrain_cache table
```

### Pattern 1: GbrainClient (MCP Client Wrapper)
**What:** Thin wrapper around `@modelcontextprotocol/sdk` Client that maps design-doc tool names to actual gbrain operations, manages SSH transport lifecycle, and returns typed results.
**When to use:** Every gbrain interaction goes through this client.
**Example:**
```typescript
// Source: gbrain MCP server operations.ts (verified via SSH)
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export class GbrainClient {
  private client: Client | null = null
  private transport: StdioClientTransport | null = null
  private connected = false

  async connect(): Promise<boolean> {
    try {
      this.transport = new StdioClientTransport({
        command: 'ssh',
        args: ['-o', 'ConnectTimeout=5', 'ryans-mac-mini',
               'cd /Volumes/4tb/gbrain && bun run src/cli.ts serve'],
      })
      this.client = new Client(
        { name: 'gstackapp', version: '1.0.0' },
        { capabilities: {} },
      )
      await this.client.connect(this.transport)
      this.connected = true
      return true
    } catch {
      this.connected = false
      return false
    }
  }

  /** Design doc: gbrain_search -> actual tool: query (hybrid search) */
  async search(query: string, limit = 10): Promise<GbrainSearchResult[]> {
    if (!this.connected) return []
    const result = await this.client!.callTool({
      name: 'query',
      arguments: { query, limit },
    })
    return parseSearchResult(result)
  }

  /** Design doc: gbrain_entity -> actual tool: get_page */
  async getEntity(slug: string): Promise<GbrainEntity | null> {
    if (!this.connected) return null
    const result = await this.client!.callTool({
      name: 'get_page',
      arguments: { slug, fuzzy: true },
    })
    return parseEntityResult(result)
  }

  /** Design doc: gbrain_related -> actual tool: traverse_graph */
  async getRelated(slug: string, depth = 2): Promise<GbrainRelated[]> {
    if (!this.connected) return []
    const result = await this.client!.callTool({
      name: 'traverse_graph',
      arguments: { slug, depth },
    })
    return parseRelatedResult(result)
  }

  async disconnect(): Promise<void> {
    if (this.transport) await this.transport.close()
    this.connected = false
  }

  get isConnected(): boolean { return this.connected }
}
```
[VERIFIED: gbrain MCP server uses `@modelcontextprotocol/sdk` Server + StdioServerTransport. Tool names verified from `/Volumes/4tb/gbrain/src/core/operations.ts`]

### Pattern 2: Async Prefetch at Pipeline Start
**What:** When a request is submitted (POST /request), immediately kick off gbrain queries in parallel with clarification generation. Cache results in Postgres keyed by request ID.
**When to use:** Every operator request submission.
**Example:**
```typescript
// In operator.ts POST /request handler, after creating the request:
// Don't await -- fire and forget, results cached for later use
prefetchGbrainContext(id, whatNeeded, whatGood).catch(err => {
  logger.warn({ err, requestId: id }, 'gbrain prefetch failed (degraded mode)')
})

// prefetch.ts
export async function prefetchGbrainContext(
  requestId: string,
  whatNeeded: string,
  whatGood: string,
): Promise<void> {
  const client = new GbrainClient()
  const connected = await client.connect()
  if (!connected) {
    await cacheGbrainResult(requestId, { available: false, results: [] })
    return
  }

  try {
    // Parallel queries
    const [searchResults, entities] = await Promise.allSettled([
      client.search(`${whatNeeded} ${whatGood}`, 10),
      detectAndFetchEntities(client, whatNeeded),
    ])

    await cacheGbrainResult(requestId, {
      available: true,
      searchResults: searchResults.status === 'fulfilled' ? searchResults.value : [],
      entities: entities.status === 'fulfilled' ? entities.value : [],
      fetchedAt: new Date().toISOString(),
    })
  } finally {
    await client.disconnect()
  }
}
```
[ASSUMED: Prefetch timing at POST /request is optimal. The user may prefer prefetch at a different point.]

### Pattern 3: Knowledge-Enhanced Clarification (GB-03)
**What:** Before generating clarification questions, load cached gbrain context and inject it into the Claude prompt so questions reference known project/person details.
**When to use:** When `generateClarificationQuestion()` is called and gbrain cache exists for the request.
**Example:**
```typescript
// Modified clarifier.ts
export async function generateClarificationQuestion(
  ctx: ClarificationContext,
  gbrainContext?: GbrainCacheData, // new optional parameter
): Promise<{ question: string; isComplete: boolean }> {
  const client = new Anthropic()

  let knowledgeBlock = ''
  if (gbrainContext?.available && gbrainContext.entities?.length) {
    knowledgeBlock = `\n\nYou have knowledge about the following projects/people mentioned in the request:\n${
      gbrainContext.entities.map(e =>
        `- ${e.title} (${e.type}): ${e.excerpt}`
      ).join('\n')
    }\n\nUse this knowledge to ask more specific, context-aware questions. For example, if they mention "CocoBanana", you know it's a fashion AI platform using Next.js + FastAPI.`
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: `You are helping clarify a non-technical user's request.${knowledgeBlock} Ask one specific, plain-language question...`,
    messages: [{ role: 'user', content: JSON.stringify(ctx) }],
  })
  // ... rest unchanged
}
```
[ASSUMED: Entity excerpt in system prompt is sufficient for context-aware questions. Alternative: inject full page content for deeper context.]

### Pattern 4: Graceful Degradation (GB-04)
**What:** When gbrain MCP server is unavailable, the pipeline continues normally but emits a "Running without knowledge context" indicator via SSE.
**When to use:** When GbrainClient.connect() returns false or any gbrain call throws.
**Example:**
```typescript
// In operator.ts, after prefetch completes:
const cached = await getGbrainCache(requestId)
if (!cached?.available) {
  pipelineBus.emit('pipeline:event', {
    type: 'operator:gbrain:degraded',
    runId: requestId,
    message: 'Running without knowledge context',
    timestamp: new Date().toISOString(),
  })
  // Also store in audit trail for GB-03 verification
  await db.insert(auditTrail).values({
    id: nanoid(),
    userId: user.id,
    requestId,
    action: 'gbrain_unavailable',
    detail: null,
  })
}
```
[VERIFIED: SSE event pattern matches existing `pipelineBus.emit` usage in operator.ts]

### Anti-Patterns to Avoid
- **Inline blocking gbrain calls:** Never call gbrain synchronously during clarification or pipeline execution. Always use prefetched cache. The design doc explicitly decided "async prefetch, not inline blocking." [VERIFIED: PROJECT.md Key Decisions]
- **Keeping MCP connection open:** SSH connections to Mac Mini should be short-lived (connect, query, disconnect). Don't keep a persistent connection -- it will time out and waste resources.
- **Failing the pipeline on gbrain errors:** gbrain is an enhancement, not a requirement. Any gbrain failure must result in degraded mode, never pipeline failure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol negotiation | Custom JSON-RPC over stdio | `@modelcontextprotocol/sdk` Client | Protocol versioning, capability exchange, tool schema discovery all handled. gbrain server uses same SDK. |
| SSH transport management | Manual child_process.spawn + stdio piping | `StdioClientTransport` with ssh command | Handles buffering, message framing, graceful shutdown. |
| Entity detection in text | Custom NLP/regex entity matching | gbrain `resolve_slugs` + `search` | gbrain already has fuzzy slug resolution and full-text search. Use those to detect known entities. |

**Key insight:** The gbrain MCP server already has all the intelligence (hybrid search, entity resolution, graph traversal). gstackapp just needs to be a thin MCP client that calls tools and caches results.

## Common Pitfalls

### Pitfall 1: SSH Connection Timeout
**What goes wrong:** SSH connection to Mac Mini hangs indefinitely if Tailscale is disconnected or Mac Mini is asleep.
**Why it happens:** Default SSH timeout is very long. The `-o ConnectTimeout=5` flag is critical.
**How to avoid:** Always pass ConnectTimeout in SSH args. Add an AbortSignal with 10s timeout on the MCP client connect call. Treat any connection failure as degraded mode.
**Warning signs:** Operator requests hang at the clarification stage.

### Pitfall 2: gbrain Response Parsing
**What goes wrong:** gbrain tool results are JSON strings wrapped in MCP content blocks. Double-parsing or mishandling the content block structure leads to silent failures.
**Why it happens:** MCP `callTool` returns `{ content: [{ type: 'text', text: '...' }] }`. The `text` field contains JSON that needs a second parse.
**How to avoid:** Build typed parse functions with Zod validation for each response type. Log parse failures at warn level, return empty results (degraded mode).
**Warning signs:** gbrain cache contains `null` or empty objects despite the server being reachable.

### Pitfall 3: Cache Invalidation
**What goes wrong:** Stale gbrain data used for a long-running pipeline. gbrain knowledge is updated independently.
**Why it happens:** Cache is per-pipeline-run with no TTL.
**How to avoid:** Per the design doc, cache is per pipeline run -- this is correct for short-lived operator requests (minutes). Don't add TTL complexity. If a request takes >1 hour, the cache is fine because the knowledge context was correct at intake time.
**Warning signs:** N/A -- this is a non-issue for the expected usage pattern.

### Pitfall 4: Entity Name Mismatch
**What goes wrong:** User says "CocoBanana" but gbrain slug is `cocobanana` or `coco-banana`. Exact match fails.
**Why it happens:** gbrain slugs are normalized, user input is not.
**How to avoid:** Use `resolve_slugs` with the `fuzzy: true` parameter on `get_page`. Also use `search` as a fallback for entity detection. [VERIFIED: gbrain `get_page` supports fuzzy slug resolution via `resolve_slugs`]
**Warning signs:** Clarification questions don't show knowledge context despite the entity existing in gbrain.

### Pitfall 5: MCP SDK Import Paths
**What goes wrong:** Import from wrong subpath causes runtime errors (e.g., `@modelcontextprotocol/sdk` vs `@modelcontextprotocol/sdk/client/index.js`).
**Why it happens:** MCP SDK uses subpath exports. The main entry doesn't re-export everything.
**How to avoid:** Use the specific subpath imports: `@modelcontextprotocol/sdk/client/index.js` for Client, `@modelcontextprotocol/sdk/client/stdio.js` for StdioClientTransport.
**Warning signs:** "Module not found" or "is not exported" errors at startup.

## Code Examples

### Cache Table Schema (Drizzle)
```typescript
// Source: existing schema.ts patterns [VERIFIED: codebase]
export const gbrainCache = pgTable('gbrain_cache', {
  id: text('id').primaryKey(),                    // nanoid
  requestId: text('request_id').notNull()
    .references(() => operatorRequests.id),
  available: boolean('available').notNull(),       // false = degraded mode
  searchResults: text('search_results'),           // JSON string
  entities: text('entities'),                      // JSON string
  relatedPages: text('related_pages'),             // JSON string
  fetchedAt: timestamp('fetched_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex('gbrain_cache_request_idx').on(table.requestId),
])
```

### Entity Detection from Request Text
```typescript
// Source: design pattern derived from gbrain operations [VERIFIED]
export async function detectAndFetchEntities(
  client: GbrainClient,
  requestText: string,
): Promise<GbrainEntity[]> {
  // Step 1: Search gbrain for the request text to find relevant pages
  const searchResults = await client.search(requestText, 5)

  // Step 2: Extract unique page slugs that are entity-type (person, project, company)
  const entitySlugs = searchResults
    .filter(r => ['person', 'project', 'company', 'organization'].includes(r.type))
    .map(r => r.slug)
    .filter((v, i, a) => a.indexOf(v) === i)  // dedupe
    .slice(0, 3)  // max 3 entities per request

  // Step 3: Fetch full entity pages
  const entities = await Promise.all(
    entitySlugs.map(slug => client.getEntity(slug))
  )

  return entities.filter((e): e is GbrainEntity => e !== null)
}
```

### Audit Trail for GB-03 Verification
```typescript
// Source: existing audit trail pattern [VERIFIED: operator.ts]
// When gbrain context is used in clarification, log it for verification
await db.insert(auditTrail).values({
  id: nanoid(),
  userId: user.id,
  requestId,
  action: 'gbrain_context_used',
  detail: JSON.stringify({
    entitiesFound: entities.map(e => e.slug),
    searchResultCount: searchResults.length,
    contextInjected: true,
  }),
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct API calls to knowledge bases | MCP protocol for tool discovery + invocation | 2024-2025 | Standardized tool interface, gbrain already adopted |
| Inline knowledge queries blocking pipeline | Async prefetch + cache pattern | Design decision (v2.0) | Eliminates latency concern entirely |
| Hard-coded tool schemas | MCP tool discovery via listTools | MCP SDK 1.x | gbrain can add/remove tools without gstackapp changes |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Prefetch at POST /request time is optimal (before clarification starts) | Architecture Pattern 2 | Low -- prefetch could move to after request creation, just needs to complete before first clarification question reads it |
| A2 | Entity excerpt in system prompt is sufficient for context-aware questions | Architecture Pattern 3 | Medium -- may need full page content for deep context; can be tuned post-implementation |
| A3 | 3 entities max per request is sufficient | Code Examples | Low -- easily adjustable constant |
| A4 | Short-lived SSH connections (connect-query-disconnect) are better than persistent | Anti-Patterns | Low -- if latency becomes an issue, a connection pool can be added later |

## Open Questions

1. **gbrain tool name mapping confirmation**
   - What we know: Design doc says `gbrain_search`, `gbrain_entity`, `gbrain_related`. Actual gbrain tools are named `query`, `get_page`, `traverse_graph`/`get_links`/`get_backlinks`. [VERIFIED: gbrain source code]
   - What's unclear: Whether the design doc names should be used as aliases in the GbrainClient interface (recommended) or if the actual tool names should be exposed.
   - Recommendation: Use design doc names as the GbrainClient method names (`.search()`, `.getEntity()`, `.getRelated()`) that internally call the actual tool names. This matches the requirements wording.

2. **gbrain context for spawned Claude Code subprocess**
   - What we know: The spawner currently writes `request.json` to outputDir and passes a system prompt.
   - What's unclear: Should gbrain context be injected into `request.json` (so Claude Code reads it), into the system prompt, or both?
   - Recommendation: Write gbrain context into `request.json` as a `knowledgeContext` field. The system prompt already instructs Claude to read request.json.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| gbrain MCP server | GB-01, GB-02, GB-03 | Via SSH to Mac Mini | Uses @modelcontextprotocol/sdk | Graceful degradation (GB-04) |
| SSH to ryans-mac-mini | gbrain MCP transport | Yes (Tailscale) | OpenSSH | Pipeline runs without knowledge context |
| @modelcontextprotocol/sdk | MCP client | Not installed yet | 1.29.0 available | Must install |
| Neon Postgres | Cache storage | Yes | Already configured | -- |
| bun (Mac Mini) | gbrain server runtime | Yes (Mac Mini) | -- | -- |

**Missing dependencies with no fallback:**
- `@modelcontextprotocol/sdk` must be installed in packages/api

**Missing dependencies with fallback:**
- gbrain MCP server unavailability is explicitly handled by GB-04 graceful degradation

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.1 |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `cd packages/api && npx vitest run --reporter=verbose` |
| Full suite command | `cd packages/api && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GB-01 | GbrainClient connects and calls MCP tools | unit (mocked transport) | `npx vitest run src/__tests__/gbrain-client.test.ts -x` | Wave 0 |
| GB-02 | Prefetch runs async, caches in Postgres | integration (mocked gbrain) | `npx vitest run src/__tests__/gbrain-prefetch.test.ts -x` | Wave 0 |
| GB-03 | Clarification includes gbrain context when entity found | unit (mocked Claude + gbrain cache) | `npx vitest run src/__tests__/gbrain-clarification.test.ts -x` | Wave 0 |
| GB-04 | Pipeline runs when gbrain unavailable, emits degraded event | unit | `npx vitest run src/__tests__/gbrain-degradation.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/api && npx vitest run src/__tests__/gbrain-*.test.ts`
- **Per wave merge:** `cd packages/api && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/gbrain-client.test.ts` -- covers GB-01
- [ ] `packages/api/src/__tests__/gbrain-prefetch.test.ts` -- covers GB-02
- [ ] `packages/api/src/__tests__/gbrain-clarification.test.ts` -- covers GB-03
- [ ] `packages/api/src/__tests__/gbrain-degradation.test.ts` -- covers GB-04

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A -- internal service communication |
| V3 Session Management | No | N/A |
| V4 Access Control | No | gbrain is read-only for this phase |
| V5 Input Validation | Yes | Zod validation on gbrain response parsing; request text sanitized before gbrain queries |
| V6 Cryptography | No | SSH handles transport encryption |

### Known Threat Patterns for MCP over SSH

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSH command injection via request text | Tampering | Request text passed as MCP tool arguments (JSON), never as shell arguments. SSH command is hardcoded. |
| gbrain response injection | Tampering | Zod validation on all parsed responses. Content treated as untrusted context for prompt injection. |
| DoS via slow gbrain queries | Denial of Service | 10s timeout on MCP connection. Prefetch is fire-and-forget. Pipeline never blocks on gbrain. |

## Sources

### Primary (HIGH confidence)
- gbrain MCP server source: `/Volumes/4tb/gbrain/src/mcp/server.ts` -- verified via SSH, confirms StdioServerTransport + @modelcontextprotocol/sdk
- gbrain operations: `/Volumes/4tb/gbrain/src/core/operations.ts` -- verified via SSH, confirms all tool names and schemas
- Claude settings: `~/.claude/settings.json` -- verified gbrain MCP server SSH command configuration
- gstackapp codebase: `packages/api/src/pipeline/clarifier.ts`, `packages/api/src/pipeline/spawner.ts`, `packages/api/src/db/schema.ts`, `packages/api/src/routes/operator.ts` -- verified integration points
- @modelcontextprotocol/sdk: npm registry, v1.29.0 [VERIFIED]

### Secondary (MEDIUM confidence)
- [MCP TypeScript SDK docs](https://github.com/modelcontextprotocol/typescript-sdk) -- Client API, transport options
- [MCP client development guide](https://modelcontextprotocol.io/docs/develop/build-client) -- connection patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- MCP SDK is the obvious and only choice; gbrain server already uses it
- Architecture: HIGH -- integration points are clear from codebase analysis; prefetch pattern is locked in design doc
- Pitfalls: HIGH -- verified actual tool names, response formats, and SSH transport from gbrain source code

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- gbrain and MCP SDK are deployed and working)
