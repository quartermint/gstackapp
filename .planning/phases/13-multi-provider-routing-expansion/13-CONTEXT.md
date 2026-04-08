# Phase 13: Multi-Provider Routing Expansion - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Route work to the right model based on task characteristics — Claude, GPT-Codex, Gemini, or Mac Mini local models. Add GPT-Codex and Gemma 4 as providers, implement task-aware routing (not just failover), and empirically discover local model boundaries.

</domain>

<decisions>
## Implementation Decisions

### GPT-Codex Integration
- **D-01:** Both API provider AND CLI subprocess — but invisible to user. User talks to "the harness", never thinks about which model they're talking to.
- **D-02:** GPT-5.4/5.2 registered as API provider in harness registry (same interface as Claude/Gemini). Used for conversation/tool-use tasks where GPT excels.
- **D-03:** Codex CLI invoked as subprocess for sandbox-worthy tasks (large refactors, multi-file migrations). Router decides when to use sandbox vs API.
- **D-04:** The user never selects a model. The harness routes based on task characteristics.

### Local Model Serving
- **D-05:** Custom MLX server on Mac Mini — Hono-based HTTP server wrapping MLX inference
- **D-06:** Full control: gstackapp-native features like token tracking, routing metadata, model loading status
- **D-07:** Exposes OpenAI-compatible endpoint over Tailscale for harness consumption
- **D-08:** Serves both Qwen3.5-35B-A3B (existing) and Gemma 4 26B-A4B (to be added)

### Task Classification
- **D-09:** Hybrid approach — skill manifests declare their tier (frontier/local/any), conversation tasks use heuristics
- **D-10:** Heuristics based on: message length, tool count, project complexity, conversation depth, task category
- **D-11:** No LLM classifier — avoids latency. Deterministic + heuristic is fast and predictable.

### Boundary Discovery
- **D-12:** Eval suite — run same prompts through frontier + local models, compare quality
- **D-13:** Build a task-type x model capability matrix from eval results
- **D-14:** Matrix informs routing heuristics — specific task types get routed to models empirically proven capable

### Claude's Discretion
- Exact heuristic weights for task classification
- Eval suite prompt design and quality metrics
- MLX server architecture details (batch inference, KV cache management)
- Gemma 4 model download and configuration

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Harness Infrastructure
- `packages/harness/src/router/model-router.ts` — Existing 3-layer failover router to extend
- `packages/harness/src/router/config.ts` — Router configuration
- `packages/harness/src/registry.ts` — Provider registry (add GPT-Codex + local providers)
- `packages/harness/src/openai.ts` — Existing OpenAI provider (extend for Codex)
- `packages/harness/src/types.ts` — Provider-agnostic types

### Local Model Stack
- `~/CLAUDE.md` — Deprecated models list (avoid Qwen3-8B, Gemini 2.x)
- Mac Mini: MLX 0.29.x installed, Qwen3.5-35B-A3B cached in HuggingFace hub

### External References
- OpenAI Codex CLI reference — for subprocess invocation patterns
- mlx_lm.server docs — for OpenAI-compatible serving baseline

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/harness/src/router/` — Full model router with predictive, proactive, reactive layers
- `packages/harness/src/openai.ts` — OpenAI provider implementation (adapt for Codex)
- `packages/harness/src/router/queue.ts` — Request queue for quality-aware routing
- `packages/harness/src/db/` — Token usage tracking with WAL + batch commit

### Established Patterns
- `inferProviderFromModel()` already routes `gpt-*` to `openai` and `qwen*` to `local`
- `OPUS_CAPABLE_PROVIDERS` and `OPUS_TIER_STAGES` for quality-aware routing
- Two fallback policies: `none` (PR reviews) and `quality-aware` (harness standalone)
- Never switch providers mid-tool-loop (tool call ID formats differ)

### Integration Points
- Add GPT-Codex to `providerChain` in router config
- Add local MLX provider to provider registry
- Extend `inferProviderFromModel()` for Gemma 4 models
- Add task-type classification to `resolveModel()` pipeline

</code_context>

<specifics>
## Specific Ideas

- "I want to not think about what model I am talking to" — the harness IS the interface
- Codex sandbox is valuable for its execution environment, not just the model — use it when the task benefits from isolated sandbox execution
- Mac Mini custom MLX server gives full control for gstackapp-specific features
- Eval suite should produce a living capability matrix that updates as models improve

</specifics>

<deferred>
## Deferred Ideas

- Auto-tuning of routing thresholds based on task outcome feedback — future milestone
- Cost dashboard UI showing spend per provider — future milestone

</deferred>

---

*Phase: 13-multi-provider-routing-expansion*
*Context gathered: 2026-04-08*
