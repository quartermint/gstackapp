# Phase 35: Active Intelligence Daemon - Research

**Researched:** 2026-03-23
**Domain:** Local LLM inference orchestration, scheduled intelligence generation, caching, async enrichment
**Confidence:** HIGH

## Summary

Phase 35 transforms LM Studio from a passive health probe into an active intelligence engine. The codebase already has the foundational patterns: `lm-studio.ts` provides the health probe and `createLmStudioProvider()`, `ai-query-rewriter.ts` demonstrates structured output via `Output.object({ schema })` with Zod schemas, and `solution-extractor.ts` shows async LLM enrichment with graceful degradation. The intelligence daemon extends these patterns to generate "Previously on..." narratives, daily digests, session routing suggestions, and tool calling -- all via JSON schema constrained generation, all cached with TTLs, and all non-blocking.

The key architectural insight: this phase adds zero new external dependencies for the core intelligence pipeline. The existing `ai` SDK + `@ai-sdk/openai` + LM Studio's OpenAI-compatible API already support JSON schema constrained output. The only new dependency recommendation is `node-cron` (4.2.1) for the daily 6am digest scheduler -- `setInterval` drifts over calendar time and cannot express "at 6am" cleanly.

**Primary recommendation:** Build the intelligence daemon as a service layer (`intelligence-daemon.ts`) with a cache-first architecture. All generation is async and writes to an `intelligence_cache` table. API routes serve from cache. Dashboard components consume cached data. The daemon registers alongside existing timers in `index.ts` and follows the `startXxxScanner()` pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Extend lm-studio.ts from health probe to inference client. Use OpenAI-compatible API (chat completions, embeddings).
- **D-02:** Abstract over specific model -- today Qwen3-Coder-30B, tomorrow dedicated models per task. Daemon manages model lifecycle.
- **D-03:** All local LLM outputs use JSON schema constrained generation. No free-form parsing. Like Foundation Models' @Generable but via JSON schema constraints in the API call.
- **D-04:** Each project card shows AI-generated context restoration narrative. Summarizes recent commits + captures + session outcomes.
- **D-05:** Narratives cached with 1h TTL. Generated async, never blocks API responses.
- **D-06:** Generated at 6am (configurable). Covers overnight commits, captures, findings, session outcomes.
- **D-07:** Cached with 12h TTL. Dashboard pulls from cache on load.
- **D-08:** Track session tier (opus/sonnet/local) vs outcome (commits, duration, files changed). Suggest optimal routing at session start.
- **D-09:** Routing suggestions are informational, never restrict. Existing budget-service.ts pattern.
- **D-10:** Adaptive context injection based on model size. Small models get compact summaries, large models get full context. Stolen from project-nomad's RAG_CONTEXT_LIMITS.
- **D-11:** `intelligence_cache` table with TTL. Like qmd's `llm_cache` -- prevent redundant inference.
- **D-12:** Cache keys: project_slug + generation_type + content_hash of inputs. Invalidate when inputs change.

### Claude's Discretion
- Tool calling interface design (which tools, what schema)
- Model warm/cool lifecycle management
- Narrative prompt engineering
- Digest format and content prioritization
- Scheduling implementation (cron-style vs interval-based)

### Deferred Ideas (OUT OF SCOPE)
- Multi-model orchestration (different models for different tasks) -- start with one model
- Local LLM fine-tuning for MC-specific tasks -- future optimization
- Intelligence API exposed via MCP (let Claude Code query the daemon)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DAEMON-01 | Local LLM query expansion replacing Gemini query rewriting | Already implemented in Phase 32 (ai-query-rewriter.ts uses LM Studio). This phase extends the pattern to other generation types. |
| DAEMON-02 | "Previously on..." AI-generated narrative for project context restoration | New narrative generator service using existing `generateText` + `Output.object` pattern from solution-extractor.ts |
| DAEMON-03 | Smart session routing with learning from historical outcomes | Extend budget-service.ts with outcome tracking; new `session_outcomes` table or extend sessions table |
| DAEMON-04 | Scheduled intelligence -- daily digest at 6am, weekly pattern analysis | node-cron for calendar-time scheduling; intelligence_cache table for storage |
| DAEMON-05 | Local LLM tool calling -- MC defines tools the model can invoke | LM Studio supports OpenAI-compatible tool calling; Qwen3-Coder has native (albeit imperfect) tool support |
| DAEMON-06 | Constrained generation via JSON schema for all local LLM outputs | Already working via `Output.object({ schema })` in ai-query-rewriter.ts and solution-extractor.ts |
| DAEMON-07 | Intelligence cache with TTL -- generated content cached and served without re-generation | New `intelligence_cache` table with TTL-based invalidation |
| DAEMON-08 | Adaptive context injection based on model size | Config-driven context limits; probe LM Studio /v1/models for model metadata |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ai (Vercel AI SDK) | 6.0.134 | Structured text generation, tool calling | Already in use; `Output.object` provides JSON schema constrained output |
| @ai-sdk/openai | 3.0.47 | LM Studio provider via OpenAI-compatible API | Already in use; `createOpenAI` creates LM Studio provider |
| node-cron | 4.2.1 | Calendar-time scheduled tasks | Cron expression for "6am daily" (`0 6 * * *`); `setInterval` drifts over days |
| better-sqlite3 | 11.7.0 | Intelligence cache table | Already in use; synchronous writes for cache |
| drizzle-orm | 0.38.0 | Schema + queries for intelligence_cache | Already in use throughout |
| zod | 3.24.0 | JSON schemas for constrained generation | Already in use; defines output shapes for all LLM outputs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hono | 4.6.0 | New intelligence API routes | Already in use; new routes for narrative, digest, routing |
| @hono/zod-validator | 0.4.0 | Request validation on intelligence routes | Already in use |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-cron | setInterval | setInterval drifts from wall-clock time; cannot express "at 6am" cleanly. node-cron adds ~25KB, cron syntax is readable |
| node-cron | cron (npm) | cron@4.4.0 is heavier (includes tz support); node-cron is simpler for single-tz use |
| Vercel AI SDK Output.object | Raw fetch to LM Studio | Raw fetch works but loses Zod schema integration, retry logic, provider abstraction. AI SDK is already a dependency |

**Installation:**
```bash
pnpm --filter @mission-control/api add node-cron && pnpm --filter @mission-control/api add -D @types/node-cron
```

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
  services/
    intelligence-daemon.ts     # Orchestrator: manages generation lifecycle + scheduling
    narrative-generator.ts     # "Previously on..." narrative generation
    digest-generator.ts        # Daily/weekly digest generation
    routing-advisor.ts         # Smart session routing with historical learning
    intelligence-cache.ts      # Cache read/write/TTL logic
    lm-studio.ts               # Extended: inference client (not just probe)
  db/
    schema.ts                  # + intelligence_cache table
    queries/
      intelligence-cache.ts    # Cache CRUD operations
  routes/
    intelligence.ts            # /api/intelligence/:slug/narrative, /api/intelligence/digest, etc.
  lib/
    config.ts                  # + intelligence config section
packages/web/src/
  components/
    hero/
      hero-card.tsx            # + narrative section
      narrative-panel.tsx      # AI narrative display
    departure-board/
      previously-on.tsx        # Enhanced with AI narrative fallback
    digest/
      daily-digest.tsx         # New: morning digest panel
  hooks/
    use-narrative.ts           # Fetch cached narrative for slug
    use-digest.ts              # Fetch cached daily digest
```

### Pattern 1: Cache-First Intelligence
**What:** All intelligence generation writes to `intelligence_cache` table. API routes read from cache. If cache miss or expired, return null/stale and trigger async regeneration.
**When to use:** Every intelligence endpoint (narrative, digest, routing suggestion).
**Example:**
```typescript
// Source: Established MC pattern (solution-extractor.ts + lm-studio.ts)
export async function getNarrative(db: DrizzleDb, slug: string): Promise<CachedNarrative | null> {
  // 1. Check cache
  const cached = getCacheEntry(db, slug, 'narrative');
  if (cached && !isExpired(cached, NARRATIVE_TTL_MS)) {
    return JSON.parse(cached.content) as CachedNarrative;
  }

  // 2. Trigger async regeneration (never block)
  queueMicrotask(() => void generateNarrative(db, slug));

  // 3. Return stale or null
  return cached ? JSON.parse(cached.content) as CachedNarrative : null;
}
```

### Pattern 2: Structured Generation via Output.object
**What:** All LLM outputs use `generateText` + `Output.object({ schema })` with Zod schemas for guaranteed JSON structure.
**When to use:** Every LLM call in the daemon.
**Example:**
```typescript
// Source: Existing pattern from ai-query-rewriter.ts and solution-extractor.ts
const narrativeSchema = z.object({
  summary: z.string().describe("2-3 sentence TV recap style narrative"),
  highlights: z.array(z.string()).describe("Key events since last session"),
  openThreads: z.array(z.string()).describe("Unfinished work or dirty tree items"),
  suggestedFocus: z.string().nullable().describe("What to work on next"),
});

const { output } = await generateText({
  model: provider("qwen3-coder"),
  output: Output.object({ schema: narrativeSchema }),
  system: "You are a project context restoration assistant...",
  prompt: `Summarize recent activity for project "${slug}":\n\n${contextPayload}`,
});
```

### Pattern 3: Timer Registration (setInterval for probes, node-cron for calendar)
**What:** Use `setInterval` for periodic tasks (existing pattern) and `node-cron` for calendar-anchored tasks (6am digest).
**When to use:** Digest generation at specific time of day; narrative regeneration on interval.
**Example:**
```typescript
// Source: node-cron docs + existing startLmStudioProbe pattern
import cron from 'node-cron';

export function startIntelligenceDaemon(config: IntelligenceConfig): { stop: () => void } {
  // Calendar-anchored: daily digest at 6am
  const digestTask = cron.schedule(config.digestCron ?? '0 6 * * *', () => {
    void generateDailyDigest(db, config);
  });

  // Interval: narrative cache refresh every 30 minutes
  const narrativeTimer = setInterval(() => {
    void refreshStaleNarratives(db, config);
  }, 30 * 60_000);

  return {
    stop: () => {
      digestTask.stop();
      clearInterval(narrativeTimer);
    },
  };
}
```

### Pattern 4: Graceful Degradation
**What:** Every LLM call checks `getLmStudioStatus().health === "ready"` before attempting inference. Returns null on unavailability.
**When to use:** Always. LM Studio may be down, model may not be loaded.
**Example:**
```typescript
// Source: Established pattern from solution-extractor.ts line 235
if (getLmStudioStatus().health !== "ready") {
  return null; // Graceful degradation -- caller handles null
}
```

### Anti-Patterns to Avoid
- **Blocking API responses with LLM inference:** Never await LLM generation in a route handler. Always serve from cache, trigger async regeneration.
- **Free-form LLM output parsing:** Never use regex/string parsing on LLM output. Always use `Output.object({ schema })` for guaranteed structure.
- **Single monolithic daemon function:** Split by concern (narrative, digest, routing) with shared cache layer, not one giant orchestrator.
- **Using setInterval for daily tasks:** Will drift from wall-clock time. Use node-cron for "at 6am" scheduling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema constrained generation | Custom response parsing | `Output.object({ schema })` from AI SDK | AI SDK handles schema-to-response_format conversion, retry, validation |
| Calendar scheduling | Custom date math + setInterval | node-cron | Cron expressions are readable, handle DST, don't drift |
| LLM provider abstraction | Custom fetch wrapper | `createLmStudioProvider()` + AI SDK | Provider handles URL construction, API key, error handling, streaming |
| Cache TTL management | Custom expiry logic in route handlers | Dedicated `intelligence-cache.ts` service | Centralizes TTL logic, prevents scattered cache management |
| Content hashing for cache keys | Custom hash logic | Reuse `computeContentHash()` from embedding.ts | Already handles CRLF normalization, SHA-256 |

**Key insight:** MC already has all the building blocks. The intelligence daemon is an orchestration layer that composes existing services (LM Studio provider, cache, event bus, project data queries) into scheduled generation pipelines.

## Common Pitfalls

### Pitfall 1: LLM Inference Blocking API Responses
**What goes wrong:** Route handler awaits LLM generation, causing 5-30 second response times.
**Why it happens:** Natural temptation to generate on-demand when cache is empty.
**How to avoid:** Cache-first architecture. Return null/stale from cache, trigger async regeneration via `queueMicrotask`. Dashboard handles "generating..." state gracefully.
**Warning signs:** API response times >1s on intelligence endpoints.

### Pitfall 2: Qwen3-Coder Tool Calling Reliability
**What goes wrong:** Qwen3-Coder-30B has known issues with native function calling -- frequently omits opening `<tool_call>` XML tags.
**Why it happens:** Training issue with the model's tool call format (documented in QwenLM/Qwen3-Coder#475).
**How to avoid:** For DAEMON-05 (tool calling), prefer `response_format: json_schema` over native tool calling. Define tool schemas as JSON output objects, then execute tool calls from the structured response. Alternative: use LM Studio's structured output mode which uses grammar-constrained sampling (bypasses the XML formatting issue).
**Warning signs:** Tool calls returning malformed XML, missing `<tool_call>` tags, or partial function arguments.

### Pitfall 3: Cache Invalidation Race Conditions
**What goes wrong:** Multiple requests trigger narrative regeneration simultaneously, causing duplicate LLM calls and cache write races.
**Why it happens:** First request finds cache empty, triggers regeneration. Second request arrives before regeneration completes, also triggers regeneration.
**How to avoid:** Use a generation lock (in-memory Set of `slug:type` keys currently being generated). Skip regeneration if lock exists. Lock is cleared on completion or timeout.
**Warning signs:** Duplicate LLM calls visible in logs, higher than expected inference count.

### Pitfall 4: Context Window Overflow
**What goes wrong:** Narrative generator stuffs too many commits + captures + session data into the prompt, exceeding model context window.
**Why it happens:** Active projects may have hundreds of recent commits and captures.
**How to avoid:** DAEMON-08 (adaptive context injection). Define context budgets per model size. For Qwen3-Coder-30B (256K context), budget 8K tokens for narrative generation context. Truncate oldest items first. Count tokens approximately (4 chars per token).
**Warning signs:** LLM returning truncated or incoherent narratives, or timeout on generation.

### Pitfall 5: Stale Digest After Config Change
**What goes wrong:** User changes digest schedule in config, but existing cron job keeps running on old schedule.
**Why it happens:** Config is loaded once at startup. Changing `mc.config.json` doesn't restart the daemon.
**How to avoid:** Accept this limitation for v1 -- config changes require server restart. Document this behavior. The existing scanner timers have the same limitation.
**Warning signs:** Digest generating at unexpected times after config edit.

### Pitfall 6: Empty Intelligence on First Run
**What goes wrong:** Dashboard loads, all intelligence panels show "No data" because no generation has run yet.
**Why it happens:** Cache is empty on first boot, and scheduled generation hasn't triggered yet.
**How to avoid:** Run an initial generation pass for all active projects at daemon startup (5s delay like existing scanners). Use the same `setTimeout(() => { ... }, 5_000)` pattern from index.ts. Generate narratives for the 5 most recently active projects first.
**Warning signs:** All intelligence panels empty after first deploy.

## Code Examples

Verified patterns from the existing codebase:

### Intelligence Cache Table Schema
```typescript
// Source: Pattern from schema.ts solutions table + qmd's llm_cache concept
export const intelligenceCache = sqliteTable(
  "intelligence_cache",
  {
    id: text("id").primaryKey(), // nanoid
    projectSlug: text("project_slug"),        // null for global (e.g., daily digest)
    generationType: text("generation_type", {
      enum: ["narrative", "digest", "routing_suggestion", "weekly_pattern"],
    }).notNull(),
    inputHash: text("input_hash").notNull(),  // SHA-256 of generation inputs
    content: text("content").notNull(),       // JSON stringified output
    modelId: text("model_id"),                // Which model generated this
    generatedAt: integer("generated_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("cache_slug_type_uniq").on(table.projectSlug, table.generationType),
    index("cache_expires_at_idx").on(table.expiresAt),
    index("cache_generation_type_idx").on(table.generationType),
  ]
);
```

### Narrative Generation (Output.object Pattern)
```typescript
// Source: Pattern from ai-query-rewriter.ts lines 131-147, solution-extractor.ts lines 240-266
import { generateText, Output } from "ai";
import { z } from "zod";

const narrativeSchema = z.object({
  summary: z.string().describe("2-3 sentence TV-recap style narrative of recent project activity"),
  highlights: z.array(z.string()).describe("3-5 key events: commits, captures, session outcomes"),
  openThreads: z.array(z.string()).describe("Unfinished work: dirty tree, pending captures, active sessions"),
  suggestedFocus: z.string().nullable().describe("Recommended next action based on project state"),
});

export type ProjectNarrative = z.infer<typeof narrativeSchema>;

export async function generateProjectNarrative(
  slug: string,
  context: NarrativeContext,
  lmStudioUrl: string,
): Promise<ProjectNarrative | null> {
  if (getLmStudioStatus().health !== "ready") return null;

  try {
    const provider = createLmStudioProvider(lmStudioUrl);
    const { output } = await generateText({
      model: provider("qwen3-coder"),
      output: Output.object({ schema: narrativeSchema }),
      system: `You are a project context restoration assistant for Mission Control...`,
      prompt: buildNarrativePrompt(slug, context),
    });
    return output ?? null;
  } catch {
    return null;
  }
}
```

### Session Routing Advisor (Extending budget-service.ts)
```typescript
// Source: Pattern from budget-service.ts suggestTier()
export async function getRoutingSuggestion(
  db: DrizzleDb,
  projectSlug: string,
  lmStudioUrl: string,
): Promise<RoutingSuggestion | null> {
  // 1. Query historical session outcomes for this project
  const outcomes = getSessionOutcomes(db, projectSlug, { limit: 20 });

  // 2. Calculate tier effectiveness
  const tierStats = computeTierStats(outcomes);

  // 3. If LM Studio available, generate natural language suggestion
  if (getLmStudioStatus().health === "ready") {
    return generateRoutingSuggestion(tierStats, lmStudioUrl);
  }

  // 4. Fallback: rule-based suggestion (like existing suggestTier)
  return buildRuleBasedSuggestion(tierStats);
}
```

### Timer Registration in index.ts
```typescript
// Source: Pattern from index.ts lines 67-121
import cron from 'node-cron';

// Inside the config block after existing timers:
let intelligenceCleanup: (() => void) | null = null;

if (config) {
  setTimeout(() => {
    // ... existing scanner startups ...

    // Start intelligence daemon
    const { db: intelDb } = getDatabase();
    intelligenceCleanup = startIntelligenceDaemon(intelDb, config);
    console.log("Intelligence daemon started (narratives + daily digest)");
  }, 5_000);
}

// In shutdown():
if (intelligenceCleanup) {
  intelligenceCleanup();
  intelligenceCleanup = null;
  console.log("Intelligence daemon stopped.");
}
```

### New Event Types
```typescript
// Source: Pattern from event-bus.ts MCEventType union
// Add to MCEventType:
| "intelligence:narrative_generated"
| "intelligence:digest_generated"
| "intelligence:cache_refreshed"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw fetch to LM Studio | `createLmStudioProvider` + AI SDK | Phase 32 (March 2026) | Type-safe, structured output, provider abstraction |
| Gemini-only query rewriting | LM Studio local query expansion | Phase 32 (March 2026) | Works offline, no API costs |
| Free-form LLM output | `Output.object({ schema })` | Phase 32-34 (March 2026) | Guaranteed JSON structure via grammar-constrained sampling |
| Health probe only | Full inference client | This phase | LM Studio becomes active intelligence engine |
| setInterval for all scheduling | node-cron for calendar tasks | This phase | Calendar-anchored scheduling without drift |

**Deprecated/outdated:**
- `@ai-sdk/google` for query rewriting: replaced by local LM Studio in Phase 32. Still used for capture enrichment.
- Manual `response_format` in fetch: replaced by AI SDK's `Output.object` abstraction.

## Open Questions

1. **DAEMON-05 Tool Calling Implementation Strategy**
   - What we know: LM Studio supports OpenAI-compatible tool calling. Qwen3-Coder has native but unreliable tool calling (known issue #475). `Output.object` with JSON schema is reliable.
   - What's unclear: Whether to implement true tool calling (LM Studio parses tool_calls) or "tool calling via structured output" (LLM returns a JSON object describing which tool to call, MC executes it).
   - Recommendation: Use structured output approach for v1. Define a `toolCallSchema` with `z.discriminatedUnion` for tool selection. This is more reliable than native tool calling with current Qwen3-Coder. Native tool calling can be revisited when model support improves.

2. **Narrative Context Budget**
   - What we know: Qwen3-Coder-30B has 256K token context window. DAEMON-08 requires adaptive context injection.
   - What's unclear: Optimal token budget for narrative generation (how much context = good narrative without wasting inference time).
   - Recommendation: Start with 4K tokens of context for narratives (approx 16KB of text). Include last 10 commits, last 5 captures, last 3 session outcomes, and current git state. This leaves ample room and keeps inference under 10 seconds.

3. **Routing Suggestion Source Data**
   - What we know: `sessions` table has `tier`, `startedAt`, `endedAt`, `filesJson`. `commits` table has commit data by project and time range.
   - What's unclear: Whether the existing session data is sufficient for meaningful routing suggestions, or if we need to extend the sessions table with outcome metrics.
   - Recommendation: Compute outcomes from existing data (duration from timestamps, commit count from commits table, file count from filesJson). No schema change needed for sessions -- the `buildSessionSignal()` function in solution-extractor.ts already computes these metrics.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DAEMON-01 | Query expansion already works (Phase 32) | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/ai-query-rewriter.test.ts` | Yes (existing) |
| DAEMON-02 | Narrative generation returns structured output | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/narrative-generator.test.ts` | Wave 0 |
| DAEMON-03 | Routing advisor computes tier stats from session history | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/routing-advisor.test.ts` | Wave 0 |
| DAEMON-04 | Digest generation at scheduled time | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/digest-generator.test.ts` | Wave 0 |
| DAEMON-05 | Tool calling returns structured tool invocation | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/intelligence-tools.test.ts` | Wave 0 |
| DAEMON-06 | All LLM outputs validate against Zod schemas | unit | Covered by DAEMON-02/04/05 tests | Wave 0 |
| DAEMON-07 | Intelligence cache stores/retrieves with TTL | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/db/queries/intelligence-cache.test.ts` | Wave 0 |
| DAEMON-08 | Context injection adapts to model size | unit | `pnpm --filter @mission-control/api test -- --run src/__tests__/services/context-adapter.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/services/narrative-generator.test.ts` -- covers DAEMON-02
- [ ] `packages/api/src/__tests__/services/routing-advisor.test.ts` -- covers DAEMON-03
- [ ] `packages/api/src/__tests__/services/digest-generator.test.ts` -- covers DAEMON-04
- [ ] `packages/api/src/__tests__/services/intelligence-tools.test.ts` -- covers DAEMON-05
- [ ] `packages/api/src/__tests__/db/queries/intelligence-cache.test.ts` -- covers DAEMON-07
- [ ] `packages/api/src/__tests__/services/context-adapter.test.ts` -- covers DAEMON-08
- [ ] `packages/api/src/__tests__/routes/intelligence.test.ts` -- covers intelligence API routes
- [ ] `packages/api/src/__tests__/services/intelligence-daemon.test.ts` -- covers daemon lifecycle

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** -- no `any` types, use `unknown`
- **Zod schemas** for all API boundaries (request validation, response shapes)
- **Naming**: files `kebab-case.ts`, types `PascalCase`, functions `camelCase`, constants `SCREAMING_SNAKE_CASE`
- **Typed errors**: `AppError` class with `code` and `status` properties
- **Conventional commits**: `feat(scope):`, `fix(scope):`, `chore(scope):`, etc.
- **Module system**: ESM (`"type": "module"`) throughout
- **Test framework**: Vitest
- **Database**: SQLite via better-sqlite3 + Drizzle ORM
- **No `any` types** -- use `unknown` instead
- **API-first**: Dashboard, iOS, CLI, MCP are all clients of the same Hono API

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| LM Studio (Mac Mini) | All DAEMON-* requirements | Conditional | N/A (probed at runtime) | Graceful degradation -- return null, serve stale cache |
| Node.js | Runtime | Yes | 20+ (assumed) | -- |
| pnpm | Build | Yes | Installed | -- |
| node-cron | DAEMON-04 (daily digest) | Not yet installed | 4.2.1 (npm) | setInterval with drift (not recommended) |

**Missing dependencies with no fallback:**
- None (LM Studio unavailability is handled by graceful degradation)

**Missing dependencies with fallback:**
- node-cron: not installed yet, install as part of phase implementation

## Sources

### Primary (HIGH confidence)
- LM Studio Structured Output docs (https://lmstudio.ai/docs/developer/openai-compat/structured-output) -- JSON schema constrained generation via response_format
- LM Studio Tool Use docs (https://lmstudio.ai/docs/developer/openai-compat/tools) -- OpenAI-compatible tool calling
- Vercel AI SDK LM Studio integration (https://ai-sdk.dev/providers/openai-compatible-providers/lmstudio) -- Provider setup, embedding, text generation
- AI SDK Core Structured Data docs (https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) -- Output.object pattern
- Existing codebase: `ai-query-rewriter.ts`, `solution-extractor.ts`, `lm-studio.ts`, `budget-service.ts` -- established patterns

### Secondary (MEDIUM confidence)
- QwenLM/Qwen3-Coder#475 (https://github.com/QwenLM/Qwen3-Coder/issues/475) -- Tool calling reliability issues with Qwen3-Coder-30B
- node-cron npm (https://www.npmjs.com/package/node-cron) -- Scheduling library capabilities

### Tertiary (LOW confidence)
- jdhodges.com local LLM tool calling eval (https://www.jdhodges.com/blog/local-llms-on-tool-calling-2026-pt1-local-lm/) -- Tool calling reliability varies by model and server

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all core libraries already in use except node-cron (verified via npm)
- Architecture: HIGH -- extends well-established patterns in the codebase (solution-extractor, ai-query-rewriter, knowledge-aggregator)
- Pitfalls: HIGH -- tool calling issues verified via GitHub issue, cache patterns documented in existing code
- Tool calling (DAEMON-05): MEDIUM -- Qwen3-Coder's native tool calling is unreliable; structured output workaround is solid but less flexible

**Research date:** 2026-03-23
**Valid until:** 2026-04-15 (LM Studio API stable; node-cron mature)
