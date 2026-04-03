# Phase 9: Model Failover Router - Research

**Researched:** 2026-04-03
**Domain:** LLM provider routing, billing cap avoidance, multi-provider failover
**Confidence:** HIGH

## Summary

Phase 9 adds a 3-layer routing system (predictive + proactive + reactive) to the `@gstackapp/harness` package. The router wraps the existing `LLMProvider` interface using the decorator pattern -- callers continue using `provider.createCompletion()` while the router transparently handles failover between Claude, Gemini, and Qwen/OpenAI-compatible providers.

The main technical challenges are: (1) adding SQLite/Drizzle to the harness package for token usage tracking (currently harness has zero DB dependencies), (2) correctly detecting rate limit and billing errors across three different SDK error hierarchies, and (3) implementing background polling of the Anthropic Admin API for proactive cap validation.

**Primary recommendation:** Implement the router as a single `ModelRouter` class implementing `LLMProvider` with internal layer methods. Add `better-sqlite3` + `drizzle-orm` as optional peer dependencies -- the router degrades gracefully (no prediction, reactive-only) when no DB is configured. The `resolveModel()` function becomes the integration seam: it returns a router-wrapped provider instead of a raw provider.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Router wraps LLMProvider -- callers still call provider.createCompletion(), router intercepts and handles failover transparently. Router implements LLMProvider (decorator pattern)
- D-02: Three layers in order: predictive (pre-request check) -> request -> reactive (catch 429/billing errors). Proactive runs on background interval independently
- D-03: Provider chain order configurable, default: claude -> gemini -> qwen. Chain is an ordered array in config
- D-04: On 429 or billing error, mark provider as "degraded" with cooldown timer (default 30 min), retry same request on next provider in chain
- D-05: If all providers degraded, queue in-memory (not persisted) and retry when first cooldown expires. For fallback: 'none', throw immediately
- D-06: Token burn rate tracking uses dedicated SQLite table (token_usage) in harness DB -- not separate WAL file
- D-07: Burn rate: rolling 1-hour window, extrapolate to daily rate, compare against billing cap. Switch if projected to hit cap within 30 min
- D-08: Batch commit: buffer usage records in memory, flush to SQLite every 5 min or on graceful shutdown. DB write failure = log warning and continue
- D-09: 30-minute threshold configurable via ROUTER_PREDICTIVE_THRESHOLD_MINUTES env var
- D-10: Poll provider usage APIs every 15 min (configurable). Only Anthropic has usage API
- D-11: Proactive polling validates predictive layer's burn rate estimate. If API reports higher usage than predicted, recalibrate
- D-12: If no usage API available for a provider, skip proactive checks -- rely on reactive only
- D-13: Router NEVER switches providers mid-tool-loop. Failover only between createCompletion() calls. Mid-conversation failure = entire conversation fails, retry from scratch on next provider
- D-14: Stage-runner already handles retries at conversation level -- router throws ProviderDegradedError that stage-runner catches
- D-15: Three policies: 'none' (single provider, throw on failure), 'quality-aware' (prefer higher-quality, degrade gracefully), 'aggressive' (use whatever's available)
- D-16: gstackapp PR reviews use 'none' default. Harness standalone uses 'quality-aware' default. Both configurable via ROUTER_FALLBACK_POLICY env var
- D-17: Quality-aware routing: CEO and Security stages prefer Opus-tier, queue rather than degrade. Eng/Design/QA accept Sonnet-tier alternatives. Maps to existing PROFILES config
- D-18: Every routing decision logged via pino with structured fields: { event: 'route_decision', provider, reason, burnRate, predictionAccuracy, fallbackPolicy, queueDepth }
- D-19: Prediction accuracy tracked: when provider actually hits cap, compare against predicted time, log delta

### Claude's Discretion
- Internal class structure (single Router class vs separate layer classes)
- SQLite table schema details for token_usage
- Background polling implementation (setInterval vs setTimeout chain)

### Deferred Ideas (OUT OF SCOPE)
- Cost dashboard UI showing burn rates and provider usage
- Auto-tuning of 30-minute predictive threshold based on historical accuracy
- Provider health score (latency, error rate) for smarter routing beyond billing caps
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RTR-01 | Reactive layer catches 429/billing errors and triggers provider failover | SDK error hierarchies documented below -- Anthropic `RateLimitError` (429), OpenAI `RateLimitError` (429), Gemini `GoogleGenerativeAIFetchError` with status 429. All three detectable. |
| RTR-02 | Predictive layer tracks token burn rate and switches 30min before projected cap | SQLite token_usage table design documented. Rolling window query pattern provided. |
| RTR-03 | Proactive layer polls provider usage APIs to validate burn rate predictions | Anthropic Admin API (`/v1/organizations/usage_report/messages`) documented with auth requirements. Gemini/OpenAI have no equivalent -- skip per D-12. |
| RTR-04 | Router chains providers in configurable order (default: Claude -> Gemini -> Qwen) | Config pattern extends existing HarnessConfig. Provider chain as string array in env. |
| RTR-05 | Quality-aware routing config specifies which tasks tolerate degradation vs queue | Maps to existing PROFILES config. Stage-to-tier mapping documented. |
| RTR-06 | Router never switches providers mid-tool-loop (boundary: between conversations only) | Router wraps createCompletion() -- failover is per-call, not mid-conversation. Stage-runner owns the loop. |
| RTR-07 | Token tracking uses batch commit (flush every 5min, graceful degradation) | In-memory buffer + periodic flush pattern documented. Note: REQUIREMENTS.md says "WAL file + batch commit" but CONTEXT.md D-06 overrides to "SQLite table in harness DB". CONTEXT.md is authoritative. |
| RTR-08 | Every route decision logged with structured observability | Pino already in api package. Harness needs its own pino instance or accepts logger via config. |
| RTR-09 | Fallback policy configurable per-context: 'none', 'quality-aware', 'aggressive' | Three policies defined. Config via ROUTER_FALLBACK_POLICY env var. |
</phase_requirements>

## Standard Stack

### Core (new to harness)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.8.0 | SQLite driver for token_usage table | Already used in api package. Synchronous API, WAL mode. Same driver avoids dual-driver maintenance. |
| drizzle-orm | 0.45.2 | Type-safe ORM for token_usage schema | Already used in api package. Schema-as-code, lightweight. |
| drizzle-kit | 0.31.10 | Migration generation | Schema push for harness DB table creation. Dev dependency only. |
| pino | 9.6.x | Structured logging | Already in api package. Harness needs its own logger instance for router observability. |

### Already Present (no changes)
| Library | Version | Purpose |
|---------|---------|---------|
| @anthropic-ai/sdk | 0.80.0 | Claude API -- exports `RateLimitError` for reactive detection |
| @google/generative-ai | 0.24.1 | Gemini API -- exports `GoogleGenerativeAIFetchError` with `.status` |
| openai | 6.33.0 | OpenAI/local API -- exports `RateLimitError` for reactive detection |
| dotenv | 16.4.x | Env var loading |

### New Dev Dependencies
| Library | Version | Purpose |
|---------|---------|---------|
| drizzle-kit | 0.31.10 | Schema push/migration for token_usage table |

### Installation
```bash
# In packages/harness/
npm install better-sqlite3 drizzle-orm pino
npm install -D drizzle-kit @types/better-sqlite3
```

## Architecture Patterns

### Recommended Project Structure
```
packages/harness/src/
  router/
    index.ts           # ModelRouter class (implements LLMProvider)
    errors.ts          # ProviderDegradedError, AllProvidersDegradedError
    reactive.ts        # Error detection helpers (isRateLimitError, isBillingError)
    predictive.ts      # Burn rate calculator, threshold check
    proactive.ts       # Anthropic Admin API poller
    queue.ts           # In-memory request queue for all-degraded scenario
    config.ts          # RouterConfig type + env var loading
  db/
    client.ts          # Harness SQLite connection (separate from api DB)
    schema.ts          # token_usage table schema
    usage-buffer.ts    # In-memory buffer + periodic flush
  types.ts             # (existing) LLMProvider interface
  registry.ts          # (modified) resolveModel returns router-wrapped provider
  config.ts            # (modified) add router config fields
  index.ts             # (modified) export router types
```

### Pattern 1: Decorator Pattern (Router wraps LLMProvider)
**What:** ModelRouter implements LLMProvider, wrapping another LLMProvider. Callers see the same interface.
**When to use:** Always -- this is the integration pattern (D-01).
**Example:**
```typescript
// Router implements LLMProvider
export class ModelRouter implements LLMProvider {
  readonly name: string
  
  constructor(
    private primaryProvider: LLMProvider,
    private chain: LLMProvider[],
    private config: RouterConfig,
    private logger: Logger,
  ) {
    this.name = `router(${primaryProvider.name})`
  }

  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    // 1. Predictive check: is current provider projected to hit cap?
    const predictiveSwitch = this.checkBurnRate(this.primaryProvider.name)
    const provider = predictiveSwitch ?? this.primaryProvider
    
    try {
      const result = await provider.createCompletion(params)
      // Track usage for burn rate prediction
      this.recordUsage(provider.name, result.usage)
      return result
    } catch (err) {
      // 2. Reactive: catch 429/billing, failover to next in chain
      if (this.isProviderError(err)) {
        return this.failover(params, provider.name, err)
      }
      throw err
    }
  }
}
```

### Pattern 2: Error Detection Across SDKs
**What:** Normalize rate limit / billing errors from three different SDK error hierarchies.
**When to use:** Reactive layer error handling.
**Example:**
```typescript
import { RateLimitError as AnthropicRateLimit } from '@anthropic-ai/sdk'
import { RateLimitError as OpenAIRateLimit } from 'openai'
import { GoogleGenerativeAIFetchError } from '@google/generative-ai'

export function isProviderCapError(err: unknown): boolean {
  // Anthropic: RateLimitError (HTTP 429) or billing error in error body
  if (err instanceof AnthropicRateLimit) return true
  
  // Anthropic billing error: status 400 with error.type === 'billing_error'
  if (err instanceof Error && 'status' in err && 'error' in err) {
    const apiErr = err as any
    if (apiErr.error?.error?.type === 'billing_error') return true
  }
  
  // OpenAI: RateLimitError (HTTP 429)
  if (err instanceof OpenAIRateLimit) return true
  
  // Gemini: GoogleGenerativeAIFetchError with status 429
  if (err instanceof GoogleGenerativeAIFetchError && err.status === 429) return true
  
  return false
}
```

### Pattern 3: In-Memory Usage Buffer with Periodic Flush
**What:** Buffer token usage records in memory, flush to SQLite every 5 minutes.
**When to use:** Token tracking (D-08). Critical path must not block on DB writes.
**Example:**
```typescript
export class UsageBuffer {
  private buffer: UsageRecord[] = []
  private flushInterval: ReturnType<typeof setInterval> | null = null
  
  constructor(private db: BetterSqlite3.Database, private flushMs = 5 * 60 * 1000) {}

  start(): void {
    this.flushInterval = setInterval(() => this.flush(), this.flushMs)
  }

  record(provider: string, usage: { inputTokens: number; outputTokens: number }): void {
    this.buffer.push({
      provider,
      timestamp: Date.now(),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    })
  }

  flush(): void {
    if (this.buffer.length === 0) return
    const records = this.buffer.splice(0)
    try {
      const stmt = this.db.prepare(
        'INSERT INTO token_usage (provider, timestamp, input_tokens, output_tokens) VALUES (?, ?, ?, ?)'
      )
      const insertMany = this.db.transaction((rows: UsageRecord[]) => {
        for (const r of rows) stmt.run(r.provider, r.timestamp, r.inputTokens, r.outputTokens)
      })
      insertMany(records)
    } catch (err) {
      // D-08: Log warning, don't throw -- token tracking is not critical path
      this.logger?.warn({ err, count: records.length }, 'Failed to flush usage buffer')
    }
  }

  shutdown(): void {
    if (this.flushInterval) clearInterval(this.flushInterval)
    this.flush() // Final flush on graceful shutdown
  }
}
```

### Pattern 4: Burn Rate Prediction
**What:** Rolling 1-hour window of token usage extrapolated to daily rate, compared against configurable billing cap.
**When to use:** Predictive layer, pre-request check (D-07).
**Example:**
```typescript
export function shouldSwitchProvider(
  db: BetterSqlite3.Database,
  provider: string,
  billingCapTokens: number,
  thresholdMinutes: number,
): boolean {
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  const row = db.prepare(`
    SELECT SUM(input_tokens + output_tokens) as total_tokens
    FROM token_usage
    WHERE provider = ? AND timestamp > ?
  `).get(provider, oneHourAgo) as { total_tokens: number } | undefined

  if (!row?.total_tokens) return false

  const hourlyRate = row.total_tokens
  const projectedDailyRate = hourlyRate * 24
  const minutesToCap = ((billingCapTokens - row.total_tokens) / hourlyRate) * 60

  return minutesToCap <= thresholdMinutes
}
```

### Anti-Patterns to Avoid
- **Mid-loop failover:** NEVER switch providers during a tool_use conversation. Tool call IDs are provider-specific (Anthropic uses `toolu_*`, Gemini uses synthetic `gemini-*` IDs). Switching mid-conversation corrupts the tool call chain.
- **Synchronous DB writes on hot path:** Token usage recording MUST use the in-memory buffer. A synchronous SQLite write on every `createCompletion()` call adds 1-5ms latency per call.
- **Polling without cooldown:** The Anthropic Admin API supports 1 request/minute sustained. Do NOT poll more frequently than every 60 seconds.
- **Hardcoded billing caps:** Caps vary by plan and change over time. Must be configurable via env vars, not constants.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite connection management | Custom connection pool | better-sqlite3 singleton + WAL mode | Same pattern as api package. Synchronous API avoids callback hell. WAL handles concurrent reads. |
| Schema management | Raw CREATE TABLE statements | Drizzle schema + drizzle-kit push | Type-safe, migratable, consistent with api package |
| Structured logging | Console.log with JSON.stringify | pino | Already in stack, structured JSON, configurable levels |
| Retry with backoff | Custom retry loop | `retry-after` header from 429 response | All three SDKs include retry-after. Parse and respect it instead of fixed delays. |

**Key insight:** The harness currently has zero DB dependencies. Adding better-sqlite3 + drizzle is a significant dependency addition. The DB should be optional -- if `HARNESS_DB_PATH` is not set, the predictive layer is disabled and the router operates in reactive-only mode. This preserves the lightweight standalone use case.

## Common Pitfalls

### Pitfall 1: Anthropic Billing Error vs Rate Limit Error
**What goes wrong:** Treating billing cap errors the same as rate limit errors. They have different HTTP status codes and error shapes.
**Why it happens:** Anthropic returns 429 for rate limits but may return 400 with `error.type === 'billing_error'` for billing cap exceeded. The SDK throws `RateLimitError` for 429 but `BadRequestError` for billing errors.
**How to avoid:** Check BOTH `instanceof RateLimitError` AND `error.error?.error?.type === 'billing_error'` in the reactive layer.
**Warning signs:** Router catches 429 but misses billing cap errors, or vice versa.

### Pitfall 2: Anthropic Admin API Requires Admin Key
**What goes wrong:** Proactive polling fails silently because the regular API key (`ANTHROPIC_API_KEY`) cannot access the Admin API.
**Why it happens:** The usage/cost API requires a separate `sk-ant-admin...` key that only org admins can create. Individual accounts cannot use this API at all.
**How to avoid:** Make proactive polling opt-in via `ANTHROPIC_ADMIN_API_KEY` env var. If not set, skip proactive layer for Anthropic (rely on reactive + predictive only). Log a one-time info message explaining the limitation.
**Warning signs:** 401/403 errors from the Admin API endpoint.

### Pitfall 3: Gemini Error Detection
**What goes wrong:** Rate limit errors from Gemini not detected because `GoogleGenerativeAIFetchError` is not a typed error class like Anthropic/OpenAI.
**Why it happens:** The `@google/generative-ai` SDK does not export a specific `RateLimitError` class. Instead, it throws `GoogleGenerativeAIFetchError` with a `.status` number property and `.statusText` string.
**How to avoid:** Check `err instanceof GoogleGenerativeAIFetchError && err.status === 429`. Also check for status 403 with "RESOURCE_EXHAUSTED" in the error message (Google's quota exceeded pattern).
**Warning signs:** Gemini rate limits not triggering failover.

### Pitfall 4: Provider Singleton Invalidation
**What goes wrong:** The router wraps a provider at init time, but the provider singleton in `registry.ts` is separate. If the registry is reset (tests), the router holds a stale reference.
**Why it happens:** `_providers` Map in registry.ts is module-level state. `resetProviders()` nullifies it but doesn't notify the router.
**How to avoid:** The router should be created via `resolveModel()` which creates a fresh router each time, OR the router caches the provider name (not instance) and resolves lazily.
**Warning signs:** Tests that call `resetProviders()` see stale router behavior.

### Pitfall 5: Request Queue Memory Leak
**What goes wrong:** When all providers are degraded, requests queue in memory (D-05). If the queue grows unbounded, it can OOM the process.
**Why it happens:** Long degradation periods with continuous incoming webhook-triggered pipeline runs.
**How to avoid:** Cap the queue size (e.g., 50 requests). Reject new requests with a clear error when queue is full. The queue timeout should be bounded by the shortest cooldown timer.
**Warning signs:** Node.js heap growing during sustained provider outages.

### Pitfall 6: Retry-After Header Ignored
**What goes wrong:** Fixed cooldown timer (30 min) used instead of respecting the `retry-after` header from the 429 response.
**Why it happens:** The SDK error objects contain the response headers, including `retry-after`, but many implementations ignore them.
**How to avoid:** Parse `retry-after` from the error's response headers. Use `Math.max(retryAfterSeconds, configuredCooldownSeconds)` -- respect the server's instruction but enforce a minimum.
**Warning signs:** Retrying before the rate limit window resets, causing cascading 429s.

## Code Examples

### Error Class Hierarchy (verified from installed SDKs)

```typescript
// Anthropic SDK (v0.80.0) -- node_modules/@anthropic-ai/sdk/src/core/error.ts
// RateLimitError extends APIError<429, Headers>
// APIError has: status, headers, error, requestID
// headers include: retry-after, anthropic-ratelimit-tokens-remaining, etc.

import Anthropic from '@anthropic-ai/sdk'
// Anthropic.RateLimitError -- for 429 responses
// Anthropic.BadRequestError -- for 400 responses (may contain billing_error)

// OpenAI SDK (v6.33.0) -- node_modules/openai/src/core/error.ts
// RateLimitError extends APIError<429, Headers>
// Same pattern as Anthropic (Stainless-generated SDK)
import OpenAI from 'openai'
// OpenAI.RateLimitError -- for 429 responses

// Gemini SDK (v0.24.1) -- node_modules/@google/generative-ai/dist/index.mjs
// GoogleGenerativeAIFetchError extends GoogleGenerativeAIError
// Has: status (number), statusText (string), errorDetails (any[])
import { GoogleGenerativeAIFetchError } from '@google/generative-ai'
// Check: err instanceof GoogleGenerativeAIFetchError && err.status === 429
```

### Anthropic Rate Limit Response Headers
```typescript
// Available on every response, not just 429s
// Source: https://docs.anthropic.com/en/api/rate-limits
interface AnthropicRateLimitHeaders {
  'anthropic-ratelimit-requests-limit': string       // Total allowed requests per period
  'anthropic-ratelimit-requests-remaining': string    // Requests remaining
  'anthropic-ratelimit-requests-reset': string        // RFC 3339 timestamp
  'anthropic-ratelimit-tokens-limit': string          // Total allowed tokens per period
  'anthropic-ratelimit-tokens-remaining': string      // Tokens remaining
  'anthropic-ratelimit-tokens-reset': string          // RFC 3339 timestamp
  'anthropic-ratelimit-input-tokens-limit': string
  'anthropic-ratelimit-input-tokens-remaining': string
  'anthropic-ratelimit-input-tokens-reset': string
  'anthropic-ratelimit-output-tokens-limit': string
  'anthropic-ratelimit-output-tokens-remaining': string
  'anthropic-ratelimit-output-tokens-reset': string
  'retry-after': string                               // Seconds to wait (on 429 only)
}
// These headers are on the RateLimitError's .headers property
```

### Token Usage Table Schema (Drizzle)
```typescript
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const tokenUsage = sqliteTable('token_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),             // 'anthropic' | 'gemini' | 'openai' | 'local'
  timestamp: integer('timestamp').notNull(),         // epoch ms
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costEstimate: real('cost_estimate'),               // USD cents, nullable (for future dashboard)
  stage: text('stage'),                              // which pipeline stage used these tokens
}, (table) => ({
  providerTimestampIdx: index('idx_token_usage_provider_ts').on(table.provider, table.timestamp),
}))
```

### Router Config Extension
```typescript
// Extends existing HarnessConfig
export interface RouterConfig {
  fallbackPolicy: 'none' | 'quality-aware' | 'aggressive'
  providerChain: string[]                    // ['anthropic', 'gemini', 'openai']
  predictiveThresholdMinutes: number         // default 30
  cooldownMinutes: number                    // default 30
  proactivePollingMinutes: number            // default 15
  billingCaps: Record<string, number>        // provider -> daily token cap
  dbPath?: string                            // SQLite path, undefined = no prediction
  anthropicAdminApiKey?: string              // For proactive layer, optional
  maxQueueSize: number                       // default 50
}

// Loaded from env vars:
// ROUTER_FALLBACK_POLICY=quality-aware
// ROUTER_PROVIDER_CHAIN=anthropic,gemini,openai
// ROUTER_PREDICTIVE_THRESHOLD_MINUTES=30
// ROUTER_COOLDOWN_MINUTES=30
// ROUTER_PROACTIVE_POLLING_MINUTES=15
// ROUTER_BILLING_CAP_ANTHROPIC=10000000  (tokens)
// ROUTER_BILLING_CAP_GEMINI=50000000
// HARNESS_DB_PATH=./data/harness.sqlite
// ANTHROPIC_ADMIN_API_KEY=sk-ant-admin-...
// ROUTER_MAX_QUEUE_SIZE=50
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single provider, manual retry | Multi-provider routers (LiteLLM, Portkey, etc.) | 2024-2025 | Standard pattern for production LLM apps |
| Fixed retry delays | Respect `retry-after` header + adaptive backoff | 2024 | SDKs now expose rate limit headers consistently |
| No usage tracking | Anthropic Admin API for org-level usage data | 2025 | Enables proactive cap avoidance |
| Simple round-robin failover | Quality-aware routing (match model tier to task criticality) | 2025 | Not all models are interchangeable -- CEO review needs Opus-tier |

**Note on LiteLLM/Portkey:** These are external routing proxies. We are building an in-process router because: (1) no additional infrastructure, (2) tight integration with the LLMProvider interface, (3) quality-aware routing tied to pipeline stage semantics. The external proxy approach is viable but adds a network hop and deployment dependency.

## Open Questions

1. **Billing cap values per provider**
   - What we know: Anthropic has tiered spending limits based on account tier. Gemini has per-minute token limits. OpenAI has monthly spending caps.
   - What's unclear: The actual numerical caps for Ryan's accounts. These vary by plan and usage history.
   - Recommendation: Make caps configurable via env vars with no default. If no cap is set for a provider, skip predictive checks for that provider (same as D-12 for proactive).

2. **Harness DB path when used inside gstackapp**
   - What we know: api package uses `config.databasePath` (from api's config.ts). Harness needs its own DB or shared access.
   - What's unclear: Should harness write to the same SQLite file as api (adding token_usage table to the main DB), or maintain a separate harness.sqlite?
   - Recommendation: Separate DB file (`HARNESS_DB_PATH` env var, default `./data/harness.sqlite`). This preserves harness's independence as a standalone package. When used inside gstackapp, the api can set `HARNESS_DB_PATH` to point wherever it wants.

3. **Qwen provider identity**
   - What we know: The chain says "qwen" but the OpenAI provider adapter serves both OpenAI and local models (including Qwen via OpenAI-compatible API).
   - What's unclear: Does "qwen" in the chain mean `local` provider (OpenAI-compatible with `LOCAL_API_URL`), or a future Qwen Cloud provider?
   - Recommendation: Map "qwen" to the `local` provider in the chain resolver. If `LOCAL_API_URL` is not configured, skip "qwen" in the chain silently.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1 |
| Config file | packages/harness/vitest.config.ts |
| Quick run command | `cd packages/harness && npx vitest run` |
| Full suite command | `npm test --workspaces` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RTR-01 | Reactive layer catches 429/billing, triggers failover | unit | `cd packages/harness && npx vitest run src/__tests__/router-reactive.test.ts -x` | Wave 0 |
| RTR-02 | Predictive layer tracks burn rate, switches at threshold | unit | `cd packages/harness && npx vitest run src/__tests__/router-predictive.test.ts -x` | Wave 0 |
| RTR-03 | Proactive layer polls usage API, recalibrates | unit | `cd packages/harness && npx vitest run src/__tests__/router-proactive.test.ts -x` | Wave 0 |
| RTR-04 | Provider chain order configurable | unit | `cd packages/harness && npx vitest run src/__tests__/router-config.test.ts -x` | Wave 0 |
| RTR-05 | Quality-aware config per stage | unit | `cd packages/harness && npx vitest run src/__tests__/router-config.test.ts -x` | Wave 0 |
| RTR-06 | Never switches mid-tool-loop | unit | `cd packages/harness && npx vitest run src/__tests__/router-boundary.test.ts -x` | Wave 0 |
| RTR-07 | Token tracking with batch commit | unit | `cd packages/harness && npx vitest run src/__tests__/usage-buffer.test.ts -x` | Wave 0 |
| RTR-08 | Structured observability logging | unit | `cd packages/harness && npx vitest run src/__tests__/router-logging.test.ts -x` | Wave 0 |
| RTR-09 | Fallback policy configurable | unit | `cd packages/harness && npx vitest run src/__tests__/router-config.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/harness && npx vitest run`
- **Per wave merge:** `npm test --workspaces`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/harness/src/__tests__/router-reactive.test.ts` -- mock provider errors, verify failover chain
- [ ] `packages/harness/src/__tests__/router-predictive.test.ts` -- mock usage DB, verify threshold switching
- [ ] `packages/harness/src/__tests__/router-proactive.test.ts` -- mock Admin API responses
- [ ] `packages/harness/src/__tests__/router-config.test.ts` -- env var parsing, policy resolution
- [ ] `packages/harness/src/__tests__/router-boundary.test.ts` -- verify no mid-loop switch
- [ ] `packages/harness/src/__tests__/usage-buffer.test.ts` -- buffer flush timing, graceful degradation
- [ ] `packages/harness/src/__tests__/router-logging.test.ts` -- structured log output verification
- [ ] `packages/harness/src/db/` directory -- new DB infrastructure for harness

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 22.x LTS | -- |
| better-sqlite3 | Token tracking DB | Yes (in api) | 12.8.0 | Reactive-only mode (no prediction) |
| Anthropic Admin API key | Proactive polling | Unknown | -- | Skip proactive layer (predictive + reactive only) |
| Gemini API key | Failover target | Unknown | -- | Skip gemini in chain |
| OpenAI/Local API | Failover target (qwen) | Unknown | -- | Skip qwen in chain |

**Missing dependencies with no fallback:**
- None -- the router degrades gracefully when optional dependencies are missing

**Missing dependencies with fallback:**
- `ANTHROPIC_ADMIN_API_KEY`: If missing, proactive layer disabled for Anthropic (use predictive + reactive)
- `HARNESS_DB_PATH`: If missing, predictive layer disabled entirely (use reactive only)
- `GEMINI_API_KEY` / `LOCAL_API_URL`: If missing, those providers excluded from chain automatically

## Sources

### Primary (HIGH confidence)
- Installed `@anthropic-ai/sdk` v0.80.0 source -- error hierarchy verified at `node_modules/@anthropic-ai/sdk/src/core/error.ts`
- Installed `openai` v6.33.0 source -- RateLimitError verified at `node_modules/openai/src/core/error.ts`
- Installed `@google/generative-ai` v0.24.1 source -- `GoogleGenerativeAIFetchError` with `.status` verified at `node_modules/@google/generative-ai/dist/index.mjs`
- Harness package source code -- `packages/harness/src/` (types.ts, registry.ts, anthropic.ts, gemini.ts, openai.ts, config.ts)
- Stage-runner source -- `packages/api/src/pipeline/stage-runner.ts` (consumer of LLMProvider)
- [Anthropic Usage and Cost API docs](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api) -- Admin API endpoints, auth requirements, polling limits

### Secondary (MEDIUM confidence)
- [Anthropic Rate Limits docs](https://docs.anthropic.com/en/api/rate-limits) -- rate limit headers, retry-after behavior
- npm registry -- verified versions: better-sqlite3@12.8.0, drizzle-orm@0.45.2, drizzle-kit@0.31.10

### Tertiary (LOW confidence)
- Gemini billing/quota error patterns -- based on general Google API patterns (status 429 + 403/RESOURCE_EXHAUSTED). Not verified against Gemini-specific docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use in api package or verified in registry
- Architecture: HIGH -- decorator pattern is textbook, error hierarchies verified from installed source
- Pitfalls: HIGH -- error class hierarchy verified from installed SDK source code, Admin API requirements verified from official docs
- Proactive layer (Anthropic Admin API): MEDIUM -- API docs verified, but requires admin key that may not be available for individual accounts

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable domain, SDK versions locked in package.json)
