# Phase 13: Multi-Provider Routing Expansion - Research

**Researched:** 2026-04-08
**Domain:** LLM provider integration, task-aware routing, local model serving (MLX)
**Confidence:** HIGH

## Summary

Phase 13 extends the existing 3-layer model router (predictive/proactive/reactive failover) with two new provider types (GPT-Codex via API + CLI subprocess, Mac Mini local models via MLX) and replaces pure failover routing with task-type-aware routing. The existing harness infrastructure is well-structured for extension: `LLMProvider` interface, `OpenAIProvider` class (reusable for both GPT API and local OpenAI-compatible endpoints), `inferProviderFromModel()`, and `PROFILES` model mapping.

The critical technical challenge is the Codex CLI subprocess integration. OpenAI ships `@openai/codex-sdk` (v0.118.0) which wraps the CLI binary and communicates via JSONL over stdin/stdout. This provides sandbox execution capabilities that the API alone cannot. The local model serving story is straightforward: `mlx_lm.server` (0.29.1) already runs on the Mac Mini and exposes OpenAI-compatible `/v1/chat/completions`. Tool calling works for Qwen3.5 out of the box; Gemma 4 tool calling support was merged into mlx_lm on April 4, 2026.

**Primary recommendation:** Add GPT-Codex as a dual-mode provider (API for conversation, SDK subprocess for sandbox tasks), build a custom Hono-based MLX proxy on Mac Mini for gstackapp-native features, implement a `TaskClassifier` that reads skill manifests + applies heuristics to select provider tier before the existing router chain runs.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Both API provider AND CLI subprocess -- but invisible to user. User talks to "the harness", never thinks about which model they're talking to.
- **D-02:** GPT-5.4/5.2 registered as API provider in harness registry (same interface as Claude/Gemini). Used for conversation/tool-use tasks where GPT excels.
- **D-03:** Codex CLI invoked as subprocess for sandbox-worthy tasks (large refactors, multi-file migrations). Router decides when to use sandbox vs API.
- **D-04:** The user never selects a model. The harness routes based on task characteristics.
- **D-05:** Custom MLX server on Mac Mini -- Hono-based HTTP server wrapping MLX inference
- **D-06:** Full control: gstackapp-native features like token tracking, routing metadata, model loading status
- **D-07:** Exposes OpenAI-compatible endpoint over Tailscale for harness consumption
- **D-08:** Serves both Qwen3.5-35B-A3B (existing) and Gemma 4 26B-A4B (to be added)
- **D-09:** Hybrid approach -- skill manifests declare their tier (frontier/local/any), conversation tasks use heuristics
- **D-10:** Heuristics based on: message length, tool count, project complexity, conversation depth, task category
- **D-11:** No LLM classifier -- avoids latency. Deterministic + heuristic is fast and predictable.
- **D-12:** Eval suite -- run same prompts through frontier + local models, compare quality
- **D-13:** Build a task-type x model capability matrix from eval results
- **D-14:** Matrix informs routing heuristics -- specific task types get routed to models empirically proven capable

### Claude's Discretion
- Exact heuristic weights for task classification
- Eval suite prompt design and quality metrics
- MLX server architecture details (batch inference, KV cache management)
- Gemma 4 model download and configuration

### Deferred Ideas (OUT OF SCOPE)
- Auto-tuning of routing thresholds based on task outcome feedback -- future milestone
- Cost dashboard UI showing spend per provider -- future milestone

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ROUT-01 | User can route work to GPT-Codex (GPT-5.4/5.2) as a provider alongside Claude and Gemini | OpenAI SDK v6.33 already installed; `@openai/codex-sdk` v0.118.0 available for subprocess mode; existing `OpenAIProvider` class handles GPT API models directly |
| ROUT-02 | User can run tasks on Mac Mini local models with empirical boundary discovery | mlx_lm 0.29.1 installed on Mac Mini (M4, 24GB); Qwen3.5-35B-A3B cached; eval suite pattern documented |
| ROUT-03 | User can have tasks routed based on task type, not just failover | Task classifier design using skill manifest tiers + heuristics; extends existing `resolveModel()` pipeline |
| ROUT-04 | User can use Gemma 4 26B-A4B MoE as a local model option | MLX Day-0 support via mlx-community weights; tool calling fix merged April 4; ~9.6GB Q4 fits in 24GB Mac Mini |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openai | 6.33.0 | GPT-5.x API client | Already installed in harness. Handles GPT-5.4, GPT-5.2 via chat.completions API. Same client works for local OpenAI-compatible endpoints. [VERIFIED: npm registry, existing package.json] |
| @openai/codex-sdk | 0.118.0 | Codex CLI subprocess wrapper | TypeScript SDK that spawns codex CLI, exchanges JSONL events over stdin/stdout. Provides `thread.run()` (blocking) and `thread.runStreamed()` (async generator). [VERIFIED: npm registry] |
| mlx_lm | 0.29.1 | MLX model serving | Already installed on Mac Mini. Provides `mlx_lm.server` with OpenAI-compatible `/v1/chat/completions`. Tool calling works for Qwen3.5; Gemma 4 parser merged April 4. [VERIFIED: SSH to Mac Mini] |
| hono | ^4.12 | Custom MLX proxy server | Already the project's HTTP framework. Build Mac Mini proxy as a Hono app for consistency + gstackapp-native features (token tracking, model status). [VERIFIED: existing stack] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.24 | Task classification schema validation | Validate skill manifest tier declarations, eval results, capability matrix entries. Already installed. [VERIFIED: existing package.json] |
| pino | ^9.6 | Structured logging for routing decisions | Log task classification results, provider selection rationale. Already installed. [VERIFIED: existing package.json] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Hono MLX proxy | Raw mlx_lm.server directly | mlx_lm.server lacks token tracking, model status endpoints, and gstackapp routing metadata. Custom proxy adds ~200 lines but gives full control per D-05/D-06. |
| @openai/codex-sdk | Raw `child_process.spawn` + JSONL parse | SDK handles binary discovery, environment setup, event typing. Hand-rolling JSONL parsing is error-prone. |
| vllm-mlx | mlx_lm.server | vllm-mlx offers continuous batching and Anthropic API compat, but is a heavier dependency. For single-user, mlx_lm.server behind a Hono proxy is simpler. |

**Installation:**
```bash
# In packages/harness
npm install @openai/codex-sdk

# On Mac Mini (if not already)
pip3 install --upgrade mlx-lm
# Download Gemma 4 MLX weights
python3 -c "from huggingface_hub import snapshot_download; snapshot_download('mlx-community/gemma-4-26b-a4b-it-4bit')"
```

## Architecture Patterns

### Recommended Project Structure
```
packages/harness/src/
├── providers/
│   ├── anthropic.ts       # Existing (move from src/)
│   ├── gemini.ts          # Existing (move from src/)
│   ├── openai.ts          # Existing (move from src/) -- handles GPT API
│   ├── codex.ts           # NEW: Codex CLI subprocess provider
│   └── local.ts           # NEW: Local MLX provider (thin wrapper, same OpenAI compat)
├── router/
│   ├── model-router.ts    # Existing -- extend with task-type awareness
│   ├── task-classifier.ts # NEW: Deterministic task classification
│   ├── capability-matrix.ts # NEW: Model x task-type capability lookup
│   ├── config.ts          # Existing -- add local provider config
│   └── ...existing files
├── registry.ts            # Extend with codex + local providers
├── types.ts               # Extend CompletionParams with taskType field
└── eval/
    ├── runner.ts           # NEW: Eval suite runner
    ├── prompts.ts          # NEW: Eval prompt sets per task type
    └── scorer.ts           # NEW: Quality comparison scoring

packages/mlx-proxy/          # NEW: Mac Mini MLX proxy server
├── src/
│   ├── index.ts            # Hono server entry
│   ├── inference.ts        # mlx_lm.server forwarding + token tracking
│   ├── models.ts           # Model loading/status management
│   └── health.ts           # Health check + GPU memory status
├── package.json
└── tsconfig.json
```

### Pattern 1: Dual-Mode Codex Provider

**What:** A single `CodexProvider` that implements `LLMProvider` for API calls but also exposes a `runSandbox()` method for CLI subprocess execution.

**When to use:** When the task classifier determines a task needs sandbox execution (large refactors, multi-file migrations).

**Example:**
```typescript
// Source: @openai/codex-sdk README + OpenAI Codex CLI docs
import { Codex } from '@openai/codex-sdk'

export class CodexProvider implements LLMProvider {
  readonly name = 'codex'
  private openaiClient: OpenAI  // For API-mode calls
  private codexSdk: Codex       // For sandbox-mode calls

  constructor(apiKey: string) {
    this.openaiClient = new OpenAI({ apiKey })
    this.codexSdk = new Codex({ env: { CODEX_API_KEY: apiKey } })
  }

  // LLMProvider interface -- routes through OpenAI API
  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    // Same as existing OpenAIProvider but targets GPT-5.4/5.2
    const response = await this.openaiClient.chat.completions.create({
      model: params.model,
      messages: [...],
      tools: [...]
    })
    return normalizeResult(response)
  }

  // Sandbox execution -- NOT part of LLMProvider interface
  async runSandbox(task: string, options: SandboxOptions): Promise<SandboxResult> {
    const thread = this.codexSdk.startThread({
      workingDirectory: options.workDir,
      skipGitRepoCheck: true,
    })
    const turn = await thread.run(task, {
      outputSchema: options.outputSchema,
    })
    return {
      response: turn.finalResponse,
      items: turn.items,
      usage: turn.usage,
    }
  }
}
```

### Pattern 2: Task Classifier with Skill Manifest Tiers

**What:** Deterministic classification that reads skill manifests for declared tiers and applies heuristics for conversation tasks.

**When to use:** Before every routing decision, extending the existing `resolveModel()` pipeline.

**Example:**
```typescript
// Task classification tiers
type TaskTier = 'frontier' | 'local' | 'sandbox' | 'any'

interface TaskClassification {
  tier: TaskTier
  reason: string
  confidence: number  // 0-1
  taskType: string    // e.g., 'ideation', 'scaffolding', 'review', 'debugging'
}

// Skill manifests declare their tier
interface SkillManifest {
  id: string
  tier?: TaskTier  // Declared by skill author
  // ... existing fields
}

function classifyTask(params: ClassificationInput): TaskClassification {
  // Layer 1: Skill manifest declares tier
  if (params.skillManifest?.tier) {
    return {
      tier: params.skillManifest.tier,
      reason: `Skill ${params.skillManifest.id} declares tier: ${params.skillManifest.tier}`,
      confidence: 1.0,
      taskType: params.skillManifest.id,
    }
  }

  // Layer 2: Heuristics for conversation tasks
  const score = computeComplexityScore(params)

  if (score.needsSandbox) {
    return { tier: 'sandbox', reason: 'Multi-file edit detected', confidence: 0.8, taskType: 'refactor' }
  }
  if (score.complexity > FRONTIER_THRESHOLD) {
    return { tier: 'frontier', reason: `Complexity ${score.complexity} exceeds threshold`, confidence: 0.7, taskType: score.category }
  }
  return { tier: 'local', reason: `Simple ${score.category} task`, confidence: 0.6, taskType: score.category }
}

function computeComplexityScore(params: ClassificationInput) {
  // D-10: message length, tool count, project complexity, conversation depth, task category
  let complexity = 0
  complexity += Math.min(params.messageLength / 2000, 1.0) * 0.2   // Long messages = more complex
  complexity += Math.min(params.toolCount / 5, 1.0) * 0.3           // More tools = more complex
  complexity += Math.min(params.conversationDepth / 10, 1.0) * 0.2  // Deep conversations = frontier
  complexity += (params.hasCodeReview ? 0.3 : 0)                     // Review = frontier (Claude)
  return { complexity, category: inferCategory(params), needsSandbox: params.isMultiFileEdit }
}
```

### Pattern 3: Custom MLX Proxy on Mac Mini

**What:** A Hono-based HTTP server that proxies to mlx_lm.server and adds gstackapp-native features.

**When to use:** Always, for local model access. Runs on Mac Mini, reachable over Tailscale.

**Example:**
```typescript
// packages/mlx-proxy/src/index.ts
import { Hono } from 'hono'

const app = new Hono()

// OpenAI-compatible chat completions (proxied to mlx_lm.server)
app.post('/v1/chat/completions', async (c) => {
  const body = await c.req.json()
  const startTime = Date.now()

  const response = await fetch(`http://localhost:8080/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const result = await response.json()
  const latencyMs = Date.now() - startTime

  // gstackapp-native: inject routing metadata
  return c.json({
    ...result,
    _gstack: {
      provider: 'local',
      model: body.model,
      latencyMs,
      tokensPerSecond: result.usage
        ? result.usage.completion_tokens / (latencyMs / 1000)
        : null,
    }
  })
})

// gstackapp-native: model status
app.get('/v1/models/status', async (c) => {
  // Report which models are loaded, GPU memory usage, etc.
  return c.json({
    models: [
      { id: 'qwen3.5-35b-a3b', status: 'loaded', memoryMb: 18000 },
      { id: 'gemma-4-26b-a4b', status: 'available', memoryMb: 0 },
    ],
    gpuMemoryTotalMb: 24576,
    gpuMemoryUsedMb: 18000,
  })
})
```

### Pattern 4: Capability Matrix from Eval Results

**What:** A JSON data structure mapping task types to model capability scores, populated by eval runs.

**Example:**
```typescript
// Capability matrix structure
interface CapabilityMatrix {
  version: string
  lastUpdated: string
  entries: CapabilityEntry[]
}

interface CapabilityEntry {
  taskType: string          // e.g., 'code-review', 'ideation', 'scaffolding', 'debugging'
  model: string             // e.g., 'claude-opus-4-6', 'qwen3.5-35b-a3b'
  qualityScore: number      // 0-1, from eval comparison
  latencyMs: number         // Average response time
  costPerMToken: number     // Estimated cost (0 for local)
  recommended: boolean      // Is this model recommended for this task type?
  sampleSize: number        // How many eval runs informed this score
}

// Router consults matrix before chain
function getRecommendedModel(taskType: string, matrix: CapabilityMatrix): string | null {
  const candidates = matrix.entries
    .filter(e => e.taskType === taskType && e.recommended)
    .sort((a, b) => b.qualityScore - a.qualityScore)
  return candidates[0]?.model ?? null
}
```

### Anti-Patterns to Avoid

- **LLM-based task classification (D-11):** Do NOT use an LLM to classify tasks before routing. It adds 1-3 seconds of latency per request. Deterministic heuristics + manifest declarations are fast and predictable.
- **Mid-tool-loop provider switching (RTR-06):** The existing router correctly prevents this. The new task classifier runs BEFORE the tool loop starts, not during it.
- **Loading both models simultaneously on Mac Mini:** With 24GB, Qwen3.5-35B-A3B (~18GB at 4-bit) and Gemma 4 26B-A4B (~9.6GB at 4-bit) cannot run simultaneously. The MLX proxy must manage model loading/unloading.
- **Hardcoding capability scores:** The matrix must come from eval runs, not assumptions. Local model quality varies dramatically by task type.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Codex CLI subprocess management | Raw child_process.spawn + JSONL parsing | `@openai/codex-sdk` | SDK handles binary discovery, env setup, event typing, session persistence. JSONL parsing is error-prone. |
| OpenAI API client | Custom HTTP client for GPT-5.x | `openai` npm package (already installed) | Handles auth, retries, streaming, type safety. GPT-5.x models work with same client. |
| MLX model inference | Direct MLX Python bindings from Node.js | `mlx_lm.server` behind Hono proxy | mlx_lm handles model loading, KV cache, tokenization. Proxy adds gstackapp features. |
| Tool call parsing for local models | Custom JSON extraction from model output | `mlx_lm.server` tool_parser | mlx_lm 0.29.1 has built-in tool parsers for Qwen3 and Gemma 4 (merged April 4). |

**Key insight:** The existing `OpenAIProvider` class already handles OpenAI-compatible endpoints (it accepts a `baseURL` option). For API-mode GPT calls, it works as-is. The local provider is also an `OpenAIProvider` instance pointed at the MLX proxy. The only truly new provider type is the Codex subprocess wrapper.

## Common Pitfalls

### Pitfall 1: Mac Mini Memory Pressure with Dual Models
**What goes wrong:** Loading Qwen3.5-35B-A3B (4-bit, ~18GB) fills most of 24GB. Loading Gemma 4 simultaneously causes swap thrashing and inference collapse.
**Why it happens:** MLX loads model weights into unified memory. No headroom for both large models.
**How to avoid:** Implement model hot-swapping in the MLX proxy. Only one large model loaded at a time. Proxy manages load/unload based on routing decisions. Consider pre-loading whichever model handles the current task type.
**Warning signs:** Inference latency spikes above 5 seconds per token. System memory pressure warnings.

### Pitfall 2: Codex CLI Not Installed on Execution Machine
**What goes wrong:** `@openai/codex-sdk` requires the `codex` CLI binary on PATH. If it's not installed, the SDK throws at runtime.
**Why it happens:** The SDK is a TypeScript wrapper, not the CLI itself. CLI must be installed separately.
**How to avoid:** Add a startup health check that verifies `codex` binary exists. Document install step: `npm install -g @openai/codex`. Fall back to API-only mode if CLI missing.
**Warning signs:** `ENOENT` error when SDK tries to spawn codex process.

### Pitfall 3: Gemma 4 Tool Calling Format Mismatch
**What goes wrong:** Gemma 4 uses `<|tool_call>...<tool_call|>` delimiters with `<|"|>` string escaping, which older mlx_lm versions don't parse.
**Why it happens:** Gemma 4 has a unique tool calling format. The parser was only merged on April 4, 2026.
**How to avoid:** Ensure mlx_lm >= 0.29.1 on Mac Mini (already verified). If tool calls come back empty, check `tokenizer_config.json` for `tool_parser_type: "gemma4"`.
**Warning signs:** `tool_calls` field is empty in responses despite model generating tool call tokens.

### Pitfall 4: Task Classifier Over-Routing to Local Models
**What goes wrong:** Heuristics route complex tasks to local models that can't handle them well, producing low-quality output.
**Why it happens:** Without empirical eval data, thresholds are guesses. Local models are surprisingly good at some tasks and terrible at others.
**How to avoid:** Start conservative -- route to frontier by default, only route to local for task types with eval-proven capability. The capability matrix must have actual data before local routing activates for a task type.
**Warning signs:** User regenerates responses frequently. Quality complaints on routed tasks.

### Pitfall 5: Codex Sandbox Timeout
**What goes wrong:** Codex CLI subprocess runs indefinitely on complex tasks, blocking the harness.
**Why it happens:** Large refactors can take minutes. No default timeout in the SDK.
**How to avoid:** Set explicit timeout on thread.run() calls. Kill subprocess if timeout exceeded. Log incomplete sandbox runs for debugging.
**Warning signs:** Harness appears hung. No SSE events flowing to dashboard.

## Code Examples

### Extending inferProviderFromModel for New Providers

```typescript
// Source: existing model-router.ts, extended
function inferProviderFromModel(model: string): string | undefined {
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gemini-')) return 'gemini'
  if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-')) return 'openai'
  if (model.startsWith('gpt-5') && model.includes('codex')) return 'codex'  // NEW: Codex-specific models
  if (model.startsWith('qwen')) return 'local'
  if (model.startsWith('gemma')) return 'local'  // NEW: Gemma 4
  return undefined
}
```

### Extending PROFILES for Task-Type Routing

```typescript
// Source: existing registry.ts, extended
export const PROFILES: Record<string, Record<string, string>> = {
  quality: {
    default: 'anthropic:claude-opus-4-6',
  },
  balanced: {
    default: 'anthropic:claude-sonnet-4-6',
    ceo: 'anthropic:claude-opus-4-6',
    security: 'anthropic:claude-opus-4-6',
    // NEW: task-type routing
    ideation: 'anthropic:claude-opus-4-6',      // Creative = frontier
    scaffolding: 'local:qwen3.5-35b-a3b',       // Boilerplate = local
    review: 'anthropic:claude-sonnet-4-6',       // Review = Claude
    debugging: 'openai:gpt-5.4',                 // Debugging = GPT reasoning
    refactor: 'codex:gpt-5.3-codex',            // Multi-file = Codex sandbox
  },
  budget: {
    default: 'gemini:gemini-3-flash-preview',
  },
  local: {
    default: 'local:qwen3.5-35b-a3b',
    // Gemma 4 for specific task types once eval proves capability
  },
}
```

### Registering New Providers

```typescript
// Source: existing registry.ts initProviders(), extended
function initProviders(): Map<string, LLMProvider> {
  if (_providers) return _providers
  _providers = new Map()
  const cfg = loadHarnessConfig()

  _providers.set('anthropic', new AnthropicProvider())

  if (cfg.geminiApiKey) {
    _providers.set('gemini', new GeminiProvider(cfg.geminiApiKey))
  }

  if (cfg.openaiApiKey) {
    _providers.set('openai', new OpenAIProvider({ apiKey: cfg.openaiApiKey }))
    // NEW: Codex provider (same API key, dual-mode)
    _providers.set('codex', new CodexProvider(cfg.openaiApiKey))
  }

  if (cfg.localApiUrl) {
    // NEW: Points to MLX proxy on Mac Mini, not raw mlx_lm.server
    _providers.set('local', new OpenAIProvider({
      apiKey: 'not-needed',
      baseURL: cfg.localApiUrl,  // e.g., http://100.123.8.125:8090/v1
    }))
  }

  return _providers
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-provider LLM calls | Multi-provider routing with failover | Phase 11 (existing) | Foundation for this phase |
| mlx_lm.server tool parsing (Gemma 4 broken) | Gemma 4 tool parser merged | April 4, 2026 | Gemma 4 tool_calls now work in mlx_lm |
| Codex as standalone CLI | `@openai/codex-sdk` TypeScript wrapper | 2026 | Programmatic subprocess control via typed JSONL events |
| GPT-4o as frontier | GPT-5.4 as frontier reasoning model | 2026 | Model names: `gpt-5.4`, `gpt-5.2`, `gpt-5.3-codex` |
| `python -m mlx_lm.server` | `mlx_lm server` (new CLI syntax) | mlx_lm 0.29.x | Old command is deprecated but still works |

**Deprecated/outdated:**
- Qwen3-8B: Hard-blocked per CLAUDE.md. Use Qwen3.5-35B-A3B instead.
- Gemini 2.x: Hard-blocked per CLAUDE.md. Use Gemini 3 Flash minimum.
- `python -m mlx_lm.server`: Deprecated syntax. Use `mlx_lm server` or `python -m mlx_lm server`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Qwen3.5-35B-A3B at 4-bit uses ~18GB of unified memory | Pitfalls | If actual usage is lower, dual-model loading might work; if higher, even single-model could be tight |
| A2 | Codex CLI binary available via `npm install -g @openai/codex` | Pitfalls | Installation path may differ; need to verify actual install command |
| A3 | GPT-5.3-Codex is the recommended model for Codex sandbox tasks | Code Examples | Model name may differ; check OpenAI docs at implementation time |
| A4 | `mlx-community/gemma-4-26b-a4b-it-4bit` is the correct HuggingFace model ID for MLX | Stack | Exact model repo name may vary; verify at download time |

## Open Questions

1. **Codex CLI installation on Mac Mini**
   - What we know: The SDK requires the CLI binary. It can be installed globally via npm.
   - What's unclear: Whether Codex CLI needs to run on the Mac Mini (for local sandbox) or only on the main machine where the harness runs.
   - Recommendation: Install on the harness machine only. Sandbox tasks execute where Codex runs, not where models serve.

2. **Model hot-swap latency on Mac Mini**
   - What we know: MLX loads models into unified memory. Loading a 10-18GB model takes time.
   - What's unclear: Exact load time for Qwen3.5-35B-A3B and Gemma 4 on M4 Mac Mini. Could be 5-30 seconds.
   - Recommendation: Benchmark at implementation time. If >10s, keep one model loaded and route most local tasks to it; swap only when task type strongly prefers the other model.

3. **Eval suite scope and prompt set**
   - What we know: We need to compare frontier vs local on the same prompts.
   - What's unclear: How many prompts, what task types, what quality metrics (human eval? automated?).
   - Recommendation: Start with 10-20 prompts across 4-5 task types. Use automated metrics (code correctness for scaffolding, rubric adherence for review). Expand later.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Harness, all providers | Yes | 22+ LTS | -- |
| openai npm | GPT API provider | Yes | 6.33.0 | -- |
| @openai/codex-sdk | Codex subprocess | No (not yet installed) | 0.118.0 available | API-only mode (no sandbox) |
| codex CLI binary | @openai/codex-sdk | Unknown | -- | API-only mode |
| mlx_lm | Mac Mini local serving | Yes (Mac Mini) | 0.29.1 | -- |
| MLX | Mac Mini GPU inference | Yes (Mac Mini) | 0.29.1 | -- |
| Qwen3.5-35B-A3B weights | Local model | Yes (Mac Mini, cached) | mlx-community 4-bit | -- |
| Gemma 4 26B-A4B weights | Local model (ROUT-04) | No (not yet downloaded) | -- | Download required (~9.6GB) |
| Tailscale | Mac Mini network access | Yes | -- | -- |
| OPENAI_API_KEY | GPT + Codex providers | Likely (check .env) | -- | Blocks GPT/Codex features |

**Missing dependencies with no fallback:**
- None blocking -- all missing items have clear install paths

**Missing dependencies with fallback:**
- `@openai/codex-sdk`: Install via npm. Fallback = API-only GPT (no sandbox mode)
- Gemma 4 weights: Download to Mac Mini. Fallback = Qwen3.5-only for local tasks
- codex CLI binary: Install globally. Fallback = API-only GPT (no sandbox mode)

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.1 |
| Config file | packages/harness inherits from root vitest config |
| Quick run command | `cd packages/harness && npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` (root -- all packages) |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROUT-01 | GPT-Codex registered as provider, API calls work | unit | `npx vitest run src/__tests__/codex-provider.test.ts -x` | Wave 0 |
| ROUT-01 | Codex sandbox subprocess invocation | integration | `npx vitest run src/__tests__/codex-sandbox.test.ts -x` | Wave 0 |
| ROUT-02 | Local MLX provider returns completions | unit | `npx vitest run src/__tests__/local-provider.test.ts -x` | Wave 0 |
| ROUT-02 | Eval suite runs and produces capability matrix | integration | `npx vitest run src/__tests__/eval-runner.test.ts -x` | Wave 0 |
| ROUT-03 | Task classifier returns correct tier for skill manifests | unit | `npx vitest run src/__tests__/task-classifier.test.ts -x` | Wave 0 |
| ROUT-03 | Router uses task classification in resolveModel | unit | `npx vitest run src/__tests__/model-router.test.ts -x` | Exists (extend) |
| ROUT-04 | Gemma 4 model registered and routable | unit | `npx vitest run src/__tests__/local-provider.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/harness && npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run` (root)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/harness/src/__tests__/codex-provider.test.ts` -- covers ROUT-01
- [ ] `packages/harness/src/__tests__/codex-sandbox.test.ts` -- covers ROUT-01 subprocess
- [ ] `packages/harness/src/__tests__/local-provider.test.ts` -- covers ROUT-02, ROUT-04
- [ ] `packages/harness/src/__tests__/task-classifier.test.ts` -- covers ROUT-03
- [ ] `packages/harness/src/__tests__/eval-runner.test.ts` -- covers ROUT-02 boundary discovery
- [ ] Extend `packages/harness/src/__tests__/model-router.test.ts` -- task-type-aware routing
- [ ] Extend `packages/harness/src/__tests__/registry.test.ts` -- new provider registration (though this tests skills, not providers)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user, no auth per project constraints |
| V3 Session Management | No | Codex sessions are ephemeral subprocess runs |
| V4 Access Control | Yes | Codex sandbox permissions must be scoped (workspace-write, not danger-full-access) |
| V5 Input Validation | Yes | Validate task classification inputs, MLX proxy request bodies via Zod |
| V6 Cryptography | No | No crypto operations in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Codex sandbox escape | Elevation of Privilege | Use `workspace-write` sandbox mode (not `danger-full-access`). Scope to project working directory. |
| Prompt injection via task content routed to local model | Tampering | Local models are more susceptible to injection. Log all local model inputs/outputs. |
| MLX proxy exposed beyond Tailscale | Information Disclosure | Bind MLX proxy to Tailscale interface only (100.x.x.x). Never bind to 0.0.0.0. |
| API key leakage to subprocess env | Information Disclosure | Codex SDK handles env injection. Don't pass keys in CLI args (visible in process list). |

## Sources

### Primary (HIGH confidence)
- [Existing harness codebase] - model-router.ts, registry.ts, openai.ts, types.ts, config.ts -- read directly [VERIFIED]
- [Mac Mini SSH] - MLX 0.29.1, mlx_lm 0.29.1, Qwen3.5-35B-A3B cached, M4 24GB confirmed [VERIFIED]
- [npm registry] - openai@6.33.0, @openai/codex-sdk@0.118.0 [VERIFIED]
- [OpenAI Codex CLI docs](https://developers.openai.com/codex/cli/reference) - CLI flags, exec mode, JSONL output [CITED]
- [OpenAI Codex non-interactive docs](https://developers.openai.com/codex/noninteractive) - codex exec, --json streaming [CITED]
- [Codex SDK TypeScript README](https://github.com/openai/codex/blob/main/sdk/typescript/README.md) - thread.run(), runStreamed(), event types [CITED]

### Secondary (MEDIUM confidence)
- [OpenAI models docs](https://developers.openai.com/api/docs/models) - GPT-5.4, GPT-5.2, GPT-5.3-Codex model names [CITED]
- [mlx_lm SERVER.md](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/SERVER.md) - OpenAI-compatible endpoint docs [CITED]
- [mlx-lm issue #1096](https://github.com/ml-explore/mlx-lm/issues/1096) - Gemma 4 tool parser fix merged April 4 [CITED]
- [Gemma 4 blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/) - 26B-A4B architecture, Day-0 MLX support [CITED]
- [HuggingFace](https://huggingface.co/unsloth/gemma-4-26b-a4b-it-UD-MLX-4bit) - MLX 4-bit Gemma 4 weights [CITED]

### Tertiary (LOW confidence)
- Gemma 4 memory footprint (~9.6GB at Q4) - from web search, needs verification at download time [ASSUMED: A1]
- Codex CLI install path (`npm install -g @openai/codex`) - from web search [ASSUMED: A2]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all core libraries verified via npm registry and existing codebase
- Architecture: HIGH -- extends well-understood existing patterns with clear integration points
- Pitfalls: MEDIUM -- memory management and model hot-swap timing need empirical validation
- Eval suite design: MEDIUM -- approach is sound but prompt set and metrics are Claude's discretion

**Research date:** 2026-04-08
**Valid until:** 2026-04-22 (14 days -- fast-moving domain with new model releases)
