# Technology Stack

**Project:** Mission Control v1.2 — Session Orchestrator + Local LLM Gateway
**Researched:** 2026-03-15

## Existing Stack (DO NOT RE-ADD)

Already installed and validated in v1.0/v1.1:

| Technology | Version | Purpose |
|------------|---------|---------|
| Hono | ^4.6.0 | API framework |
| better-sqlite3 | ^11.7.0 | SQLite driver |
| Drizzle ORM | ^0.38.0 | Schema + migrations + queries |
| React 19 | ^19.0.0 | Dashboard UI |
| Vite 6 | ^6.0.0 | Build + dev server |
| TanStack Query | (via hono hc) | Data fetching + cache |
| Tailwind v4 | ^4.0.0 | Styling |
| ai (Vercel AI SDK) | ^6.0.116 | AI model abstraction |
| @ai-sdk/google | ^3.0.43 | Gemini provider for captures |
| @modelcontextprotocol/sdk | ^1.27.1 | MCP server |
| Zod | ^3.24.0 | Schema validation |
| nanoid | ^5.0.0 | ID generation |
| Vitest | ^2.1.0 | Testing |

## New Dependencies

### Core: LM Studio Integration via Vercel AI SDK

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @ai-sdk/openai-compatible | ^2.0.35 | LM Studio provider for Vercel AI SDK | Already using `ai` SDK with `@ai-sdk/google`. This adds OpenAI-compatible provider support for LM Studio without introducing a second AI client library. One `generateText()` call, swap the provider. |

**Confidence:** HIGH — Verified on [ai-sdk.dev/providers/openai-compatible-providers/lmstudio](https://ai-sdk.dev/providers/openai-compatible-providers/lmstudio) and [npmjs.com](https://www.npmjs.com/package/@ai-sdk/openai-compatible)

**Setup:**

```typescript
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://100.x.x.x:1234/v1',  // Mac Mini LM Studio
});

// Use exactly like google() provider
const { text } = await generateText({
  model: lmstudio('qwen3-coder-30b-a3b-instruct'),
  prompt: 'Refactor this function...',
});
```

**Why not `openai` npm package directly:** The project already uses Vercel AI SDK (`ai` package) for all AI operations. Adding `@ai-sdk/openai-compatible` maintains one abstraction layer. Switching models is a provider swap, not a client swap. The `openai` npm package (v6.27.0) would be a parallel, redundant dependency.

**Why not `lmstudio-js` SDK:** LM Studio has its own TypeScript SDK, but it adds LM-Studio-specific APIs we don't need. The OpenAI-compatible endpoint is sufficient and keeps us provider-agnostic — if we ever move to Ollama or another local runtime, only the base URL changes.

### No Other New Dependencies Needed

Everything else is built with existing stack:

| Capability | Existing Tool | How |
|------------|--------------|-----|
| Session state storage | better-sqlite3 + Drizzle | New tables: `sessions`, `session_files`, `usage_tracking` |
| Real-time session updates | SSE via `MCEventBus` | Add event types: `session:started`, `session:updated`, `session:ended`, `session:conflict` |
| Session reporter hooks | Claude Code hooks system | HTTP hook type pointing to MC API endpoint, or command hooks with `curl` |
| Aider session detection | Git log parsing | `git log --author="(aider)"` pattern already used in project scanner |
| Conflict detection | SQLite queries | File overlap queries across active sessions |
| Budget tracking | SQLite + heuristics | Session count * tier cost estimate, no token API needed |
| Convergence detection | Git commit monitoring | Compare HEAD across branches, detect merge readiness |
| MCP session tools | @modelcontextprotocol/sdk | Add tools to existing MCP server |
| API routes | Hono | New route files in existing structure |
| Dashboard components | React + Tailwind v4 | New components in existing layout |
| Schema validation | Zod | New schemas in @mission-control/shared |
| ID generation | nanoid | Session IDs (or use `CLAUDE_SESSION_ID` directly) |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| LM Studio client | @ai-sdk/openai-compatible | openai npm (v6.27.0) | Already using Vercel AI SDK; adding openai package creates parallel abstraction |
| LM Studio client | @ai-sdk/openai-compatible | lmstudio-js SDK | Vendor-specific, adds unnecessary APIs, not provider-agnostic |
| File watching | Polling (30s timer) | chokidar v5 | Requirements explicitly say "no file-system watchers." 30-min discovery poll + session heartbeats sufficient. |
| Session reporter | HTTP hooks + command hooks | WebSocket connection | Claude Code hooks don't support WebSocket. HTTP hooks are the native mechanism. |
| Session state | SQLite tables | Redis / in-memory store | Single user, single server, SQLite is already the data layer. Adding Redis would be over-engineering. |
| Session IDs | CLAUDE_SESSION_ID env var | Generate our own | Claude Code exposes session_id in all hook payloads. Use the authoritative source. |
| Conflict detection | SQL file overlap queries | Git merge conflict simulation | Too heavy. File-path overlap is sufficient for "heads up, two sessions touching same area." |
| Budget tracking | Session count heuristics | Token counting API | Claude doesn't expose per-session token counts. Heuristics (session count x estimated cost per tier) is the only viable approach. |

## Integration Points with Existing Stack

### Claude Code Hooks -> MC API

Claude Code supports two hook types that can report to MC:

1. **HTTP hooks** (preferred): POST directly to MC API endpoint. No shell script needed.
   ```json
   // In ~/.claude/settings.json or project .claude/settings.json
   {
     "hooks": {
       "SessionStart": [{
         "hooks": [{
           "type": "http",
           "url": "http://100.x.x.x:3000/api/sessions/report",
           "headers": {},
           "timeout": 5000
         }]
       }],
       "PostToolUse": [{
         "matcher": "Bash|Write|Edit",
         "hooks": [{
           "type": "http",
           "url": "http://100.x.x.x:3000/api/sessions/activity",
           "timeout": 3000
         }]
       }],
       "Stop": [{
         "hooks": [{
           "type": "http",
           "url": "http://100.x.x.x:3000/api/sessions/end",
           "timeout": 5000
         }]
       }]
     }
   }
   ```

2. **Command hooks** (fallback): Shell script with `curl` to MC API.
   ```bash
   #!/bin/bash
   INPUT=$(cat)
   curl -sf --max-time 3 -X POST \
     -H "Content-Type: application/json" \
     -d "$INPUT" \
     "http://100.x.x.x:3000/api/sessions/report" \
     >/dev/null 2>&1
   exit 0
   ```

**Available data from hooks:**

| Hook Event | Key Data for Sessions |
|------------|----------------------|
| SessionStart | `session_id`, `model`, `cwd` (project path), `source` (startup/resume) |
| PostToolUse | `session_id`, `tool_name`, `tool_input` (file paths, commands), `cwd` |
| Stop | `session_id`, `last_assistant_message` (task summary) |
| SessionEnd | `session_id`, `reason` |

### Aider Session Detection

Aider has no hook system. Detection via git commit attribution:

- Commits by aider have `(aider)` appended to git author/committer name
- `git log --author="(aider)" --since="1 hour ago"` detects recent aider activity
- `.aider.chat.history.md` file existence indicates active/recent aider session
- Poll-based: check during regular project scan cycle

### LM Studio on Mac Mini

- Endpoint: `http://100.x.x.x:1234/v1` (already running on Mac Mini via Tailscale)
- Model: Qwen3-Coder-30B-A3B-Instruct (MoE, 3B active params, 256K context)
- API: OpenAI-compatible (`/v1/chat/completions`, `/v1/models`)
- Features: Streaming, tool calling, structured output, reasoning content
- Auth: Optional bearer token (LM Studio 0.4.0+)
- Health check: `GET /v1/models` returns loaded model list

### Vercel AI SDK Unified Interface

```typescript
// Tier routing becomes trivial with AI SDK abstraction
import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://100.x.x.x:1234/v1',
});

function getModel(tier: 'opus' | 'sonnet' | 'local') {
  switch (tier) {
    case 'opus':    return google('gemini-3-flash-preview');  // Proxy for "expensive tier"
    case 'sonnet':  return google('gemini-3-flash-preview');  // Medium tier
    case 'local':   return lmstudio('qwen3-coder-30b-a3b-instruct');
  }
}
```

Note: The actual Opus/Sonnet routing is for Claude Code sessions (model selection happens in Claude Code, not in MC). MC tracks which tier a session uses, it doesn't make the model selection. The `getModel()` pattern above is for MC's own AI operations (e.g., generating session summaries via local model instead of burning Gemini API credits).

## Installation

```bash
# Single new dependency
pnpm --filter @mission-control/api add @ai-sdk/openai-compatible
```

That's it. One package. Everything else builds on existing infrastructure.

## What NOT to Add

| Temptation | Why Skip It |
|------------|------------|
| `openai` npm package | Redundant — @ai-sdk/openai-compatible wraps the same protocol |
| `chokidar` file watcher | Requirements explicitly exclude file-system watchers |
| `socket.io` / `ws` | SSE is already proven in the stack for real-time |
| Redis / Valkey | Single-user SQLite is sufficient for session state |
| `node-cron` | Already using `setInterval` for scan timers, same pattern works |
| `diff` / `jsdiff` library | Git diff is sufficient for convergence detection |
| PostHog / analytics SDK | MC is the analytics system — it doesn't need external analytics |
| `p-queue` / `bull` | Promise chains and queueMicrotask are already the async pattern |

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — Hook events, input/output schemas, HTTP hook type
- [Vercel AI SDK — LM Studio Provider](https://ai-sdk.dev/providers/openai-compatible-providers/lmstudio) — @ai-sdk/openai-compatible setup
- [@ai-sdk/openai-compatible on npm](https://www.npmjs.com/package/@ai-sdk/openai-compatible) — v2.0.35, published March 2026
- [LM Studio OpenAI Compatibility Docs](https://lmstudio.ai/docs/developer/openai-compat) — Endpoints, auth, features
- [Aider Git Integration](https://aider.chat/docs/git.html) — Commit attribution with "(aider)" marker
- [Aider Options Reference](https://aider.chat/docs/config/options.html) — Analytics, logging, model config
- [Qwen3-Coder-30B on LM Studio](https://lmstudio.ai/models/qwen/qwen3-coder-30b) — Model specs, hardware requirements
- [Claude Code CLAUDE_SESSION_ID](https://github.com/anthropics/claude-code/issues/25642) — Session ID as env var

---
*Researched: 2026-03-15*
