# Phase 9: Model Failover Router - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

3-layer routing system (predictive + proactive + reactive) that automatically fails over between providers when billing caps hit. Lives in the harness package extracted in Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Router Architecture
- **D-01:** Router wraps `LLMProvider` — callers still call `provider.createCompletion()`, but the router intercepts and handles failover transparently. The router itself implements `LLMProvider` (decorator pattern)
- **D-02:** Three layers execute in order: predictive (pre-request check) → the request itself → reactive (catch 429/billing errors). Proactive runs on a background interval independently
- **D-03:** Provider chain order is configurable, default: `claude → gemini → qwen`. Chain is an ordered array in config

### Reactive Layer (RTR-01)
- **D-04:** On 429 or billing error from any provider, mark that provider as "degraded" with a cooldown timer (default 30 minutes), retry the same request on the next provider in the chain
- **D-05:** If all providers in the chain are degraded, queue the request (in-memory, not persisted) and retry when the first provider's cooldown expires. For `fallback: 'none'` policy, throw immediately instead of queuing

### Predictive Layer (RTR-02)
- **D-06:** Token burn rate tracking uses a dedicated SQLite table (`token_usage`) in the harness DB — not a separate WAL file. Columns: provider, timestamp, input_tokens, output_tokens, cost_estimate
- **D-07:** Burn rate calculation: rolling window (last 1 hour) of token usage, extrapolate to daily rate, compare against known billing cap. If projected to hit cap within 30 minutes, proactively switch
- **D-08:** Batch commit strategy: buffer usage records in memory, flush to SQLite every 5 minutes or on graceful shutdown. If the DB write fails, log warning and continue — token tracking is observability, not critical path
- **D-09:** The 30-minute threshold is configurable via `ROUTER_PREDICTIVE_THRESHOLD_MINUTES` env var

### Proactive Layer (RTR-03)
- **D-10:** Poll provider usage APIs every 15 minutes (configurable). Currently only Anthropic has a usage API — Gemini and OpenAI don't expose real-time billing data
- **D-11:** Proactive polling validates the predictive layer's burn rate estimate. If the API reports higher usage than predicted, recalibrate the burn rate model
- **D-12:** If no usage API is available for a provider, skip proactive checks for that provider — rely on reactive layer only

### Failover Boundaries (RTR-06)
- **D-13:** Router NEVER switches providers mid-tool-loop. Failover only happens between `createCompletion()` calls. If a provider fails mid-conversation (multi-turn tool_use), the entire conversation fails and must be retried from scratch on the next provider
- **D-14:** The stage-runner already handles retries at the conversation level — the router just needs to throw a `ProviderDegradedError` that the stage-runner catches

### Fallback Policies (RTR-09)
- **D-15:** Three policies: `'none'` (single provider, throw on failure), `'quality-aware'` (prefer higher-quality providers, degrade gracefully), `'aggressive'` (use whatever's available)
- **D-16:** gstackapp PR reviews use `'none'` by default (Claude-only quality guarantee). Harness standalone uses `'quality-aware'` by default. Both configurable via env var `ROUTER_FALLBACK_POLICY`
- **D-17:** Quality-aware routing: CEO and Security stages prefer Opus-tier models and queue rather than degrade. Eng/Design/QA stages accept Sonnet-tier alternatives. This maps to the existing `PROFILES` config

### Observability (RTR-08)
- **D-18:** Every routing decision logged via pino (already in the stack) with structured fields: `{ event: 'route_decision', provider, reason, burnRate, predictionAccuracy, fallbackPolicy, queueDepth }`
- **D-19:** Prediction accuracy tracked: when a provider actually hits a cap, compare against predicted time. Log the delta for model improvement

### Claude's Discretion
- Internal class structure (single `Router` class vs separate layer classes) — Claude picks based on complexity
- SQLite table schema details for `token_usage` — Claude designs based on query patterns
- Background polling implementation (setInterval vs setTimeout chain) — Claude picks

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Harness Package (from Phase 8)
- `packages/harness/src/providers/types.ts` — LLMProvider interface the router wraps
- `packages/harness/src/providers/index.ts` — Provider registry, profiles, resolveModel
- `packages/harness/src/providers/anthropic.ts` — Anthropic adapter (reactive error handling target)

### Existing Patterns
- `packages/api/src/pipeline/stage-runner.ts` — Consumer of LLMProvider, handles multi-turn tool_use loops
- `packages/api/src/pipeline/orchestrator.ts` — Calls resolveModel(), needs to use router instead

### Requirements
- `.planning/REQUIREMENTS.md` §Model Router — RTR-01 through RTR-09

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LLMProvider` interface is the integration point — router implements this same interface
- `resolveModel()` already handles profile-based model selection — router extends this with failover logic
- pino logger likely already configured in the api package

### Established Patterns
- Provider singleton pattern in `providers/index.ts` — router could follow same lazy-init pattern
- Zod schema validation for config — router config should follow same pattern

### Integration Points
- `resolveModel()` in providers/index.ts is the primary callsite — needs to return router-wrapped provider instead of raw provider
- `stage-runner.ts` catches errors from `createCompletion()` — needs to understand `ProviderDegradedError` for retry-on-different-provider logic
- SQLite database setup in api — harness needs its own DB or shared access for token_usage table

</code_context>

<specifics>
## Specific Ideas

- The router should be opt-in: if `ROUTER_FALLBACK_POLICY=none` and only one provider is configured, the router is effectively a passthrough with zero overhead
- Token tracking doubles as a cost dashboard data source — design the schema with future visualization in mind

</specifics>

<deferred>
## Deferred Ideas

- Cost dashboard UI showing burn rates and provider usage — future phase
- Auto-tuning of the 30-minute predictive threshold based on historical accuracy — v2
- Provider health score (latency, error rate) for smarter routing beyond just billing caps — v2

</deferred>

---

*Phase: 09-model-failover-router*
*Context gathered: 2026-04-03*
