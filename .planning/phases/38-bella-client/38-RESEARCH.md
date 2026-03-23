# Phase 38: Bella Client - Research

**Researched:** 2026-03-23
**Domain:** Chat-first AI interface, multi-user client architecture, RAG-grounded conversation
**Confidence:** HIGH

## Summary

Phase 38 builds the second client on MC's API-first platform -- a chat-first interface for Bella. The Juliet prototype evidence is clear: Bella gravitates to conversational interfaces over dashboards, using chatbots as a "Ryan interpreter" to navigate context and decisions. This phase turns that validated insight into a proper MC client.

The core technical challenge is building a RAG-grounded chat interface that can answer questions about Ryan's project state using MC's existing API endpoints and intelligence infrastructure. The AI SDK (already at v6 in the project) provides `streamText` with tool calling on the backend and `useChat` on the frontend -- the exact primitives needed. LM Studio on the Mac Mini is the LLM backend, consistent with every v2.0 intelligence feature. No new AI dependencies needed; only `@ai-sdk/react` gets added to the web package.

The client architecture recommendation is a new route within the existing web package (not a separate app). Bella's client is a separate page at `/bella` with its own layout, sharing the existing Tailwind design system and API connection. User identity uses Tailscale headers (already available via the network boundary) with a simple config-based user registry. This keeps the codebase unified, avoids deploying a second app, and establishes the multi-user pattern through routing rather than infrastructure duplication.

**Primary recommendation:** Build as a chat-first page in the existing web package using AI SDK `useChat` + `streamText` with MC API tools, served at `/bella`. LM Studio powers the conversation. Tailscale headers identify the user. No new infrastructure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Chat-first interface. Bella talks to MC like she talked to Juliet. The conversational interface IS the product -- not a sidebar to a dashboard.
- **D-02:** "Ryan interpreter" mode -- Bella can ask "what's Ryan working on?", "what did he capture about openefb?", "what's the status of the iOS app?" and get contextual answers from MC's data.
- **D-03:** MC knows it's Bella. Auth via Tailscale device identity or simple config. Bella sees a Bella-appropriate view of Ryan's environment -- not the full departure board.
- **D-04:** Read project status, captures, risks, session activity -- everything MC surfaces to Ryan, contextualized for Bella's perspective.
- **D-05:** Send captures into MC on Ryan's behalf ("Ryan wants to remember X", "add this to the openefb backlog").
- **D-06:** See iMessage conversation extracts that MC already captured (Phase 33 CAP-09) -- "MC already knows what we discussed, here's what it extracted."
- **D-07:** Ask MC questions about Ryan's environment, get answers grounded in actual data (not hallucinated).
- **D-08:** The goal is to teach Bella how to build up the iOS app and desktop tools. The client should expose enough of MC's internals that she can learn the platform.
- **D-09:** Once Bella can build her own lightsaber on MC's foundry, that's the pattern for the next person. "Company as a codebase" validated.
- **D-10:** This is the second client on MC's API-first platform. Dashboard is client #1, CLI is #2, MCP is #3, iOS is #4, Bella Client is #5. Same API, different UX.
- **D-11:** Bella's client establishes the multi-user pattern. If this works, the same approach extends to future team members.

### Claude's Discretion
- Client technology (web app? Slack bot? iOS app? Streamline integration?)
- Chat interface implementation (LLM-powered chat over MC API? or structured command interface?)
- What "Bella-appropriate view" means in practice (simplified dashboard? chat-only? both?)
- Auth mechanism details (Tailscale device fingerprint, simple token, or config-based)
- How to expose MC internals for learning (documentation? guided tutorials? pair programming UX?)

### Deferred Ideas (OUT OF SCOPE)
- Multi-user auth system (beyond Tailscale device identity)
- Bella-specific dashboard views (separate from chat interface)
- Team-wide project visibility controls (who sees what)
- Bella's own capture pipeline (her own iMessage monitoring, her own Capacities equivalent)
</user_constraints>

<phase_requirements>
## Phase Requirements

Note: BELLA-01 through BELLA-11 are referenced in the ROADMAP but not yet formally defined in REQUIREMENTS.md. Requirements below are inferred from CONTEXT.md decisions and ROADMAP success criteria.

| ID | Description | Research Support |
|----|-------------|------------------|
| BELLA-01 | Chat-first interface where Bella can converse with MC about Ryan's projects | AI SDK `useChat` + `streamText` with LM Studio, tool-based RAG architecture |
| BELLA-02 | "Ryan interpreter" mode -- contextual answers from MC data about project status | MC API tools (project lookup, capture search, health checks) invoked by LM Studio |
| BELLA-03 | User identity -- MC knows it's Bella, not Ryan | Tailscale `Tailscale-User-Login` header + config-based user registry |
| BELLA-04 | Read access to project status, captures, risks, sessions | Existing API endpoints consumed as chat tools (no new API routes for data) |
| BELLA-05 | Bella can send captures into MC on Ryan's behalf | `createCapture` tool with `sourceType: "bella"` and `userId: "bella"` |
| BELLA-06 | View iMessage conversation extracts (Phase 33 CAP-09) | List captures filtered by `sourceType: "imessage"`, surface extractions |
| BELLA-07 | Grounded answers -- responses cite actual MC data, not hallucinated | RAG tool-calling pattern: LM Studio calls MC tools, cites results |
| BELLA-08 | Expose MC internals for learning the platform | API explorer panel, documentation links, "how this works" explanations |
| BELLA-09 | Multi-user pattern established for future team members | User registry in config, per-user capture attribution, view filtering |
| BELLA-10 | Bella-appropriate view of Ryan's environment | Simplified layout, chat-focused, context cards instead of full departure board |
| BELLA-11 | Teaching pathway -- Bella can learn to build her own tools | Platform documentation, API reference, guided next steps in chat responses |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ai (Vercel AI SDK) | ^6.0.116 (installed) | `streamText`, `Output.object`, tool definitions | Already in packages/api for narratives, routing, digests. Chat is the same pattern. |
| @ai-sdk/react | ^3.0.137 | `useChat` hook for streaming chat UI | Official React integration for AI SDK. Manages message state, streaming, tool results. |
| @ai-sdk/openai | ^3.0.47 (installed) | LM Studio provider via OpenAI-compatible API | Already used for all v2.0 intelligence features via `createLmStudioProvider` |
| hono | ^4.6.0 (installed) | Chat API endpoint | Same framework as all MC routes |
| zod | ^3.24.0 (installed) | Tool input schemas, response validation | Universal schema library in MC |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-textarea-autosize | ^8.5.9 (installed) | Chat input field | Already used by CaptureField component |
| cmdk | ^1.1.1 (installed) | Command palette integration | If Bella's chat needs slash commands |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Web page in existing app | Separate Streamline integration | Streamline uses Next.js + WebSocket, completely different stack. Would require cross-service chat, added complexity. MC web is the right home. |
| Web page in existing app | Slack bot / Discord bot | Adds external dependency, loses MC's warm design, can't render rich project cards. Wrong medium for "lightsaber." |
| Web page in existing app | Dedicated standalone React app | Duplicates infrastructure, separate deployment. Unnecessary when same Vite bundle can serve both views. |
| LLM-powered chat (streamText) | Structured command interface | Commands are rigid and intimidating. Juliet evidence shows Bella prefers natural language. LLM handles ambiguity. |
| AI SDK useChat | Custom WebSocket chat | AI SDK handles streaming, message state, tool results. Hand-rolling this is weeks of work for worse results. |

**Installation:**
```bash
pnpm --filter @mission-control/web add @ai-sdk/react
```

**No other new dependencies.** Everything else is already installed.

**Version verification:**
- `ai`: ^6.0.116 installed, 6.0.135 latest (minor patch, compatible)
- `@ai-sdk/react`: 3.0.137 latest (new install)
- `@ai-sdk/openai`: ^3.0.47 installed, 3.0.47 latest (current)
- `hono`: ^4.6.0 installed (current)

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
├── routes/
│   └── chat.ts                    # POST /api/chat — streamText endpoint
├── services/
│   └── chat-tools.ts              # MC tool definitions for chat (project lookup, search, capture creation)
├── lib/
│   └── user-identity.ts           # Tailscale header parsing + user registry

packages/web/src/
├── components/
│   └── bella/
│       ├── bella-chat.tsx          # Main chat page component
│       ├── chat-messages.tsx       # Message list with rich rendering
│       ├── chat-input.tsx          # Input field with send button
│       ├── context-card.tsx        # Inline project/capture cards in messages
│       ├── bella-layout.tsx        # Simplified layout for Bella's view
│       └── api-explorer.tsx        # Learning panel showing available MC APIs
├── hooks/
│   └── use-bella-chat.ts          # Thin wrapper around useChat with MC config
├── App.tsx                         # Add route: /bella → BellaChat
```

### Pattern 1: RAG Chat via Tool Calling
**What:** LM Studio answers Bella's questions by calling MC API tools to fetch real data, then synthesizes responses grounded in that data. This is the established AI SDK RAG pattern.
**When to use:** Every chat message that asks about Ryan's environment.
**Example:**
```typescript
// Source: ai-sdk.dev/cookbook/guides/rag-chatbot + existing MC patterns
import { streamText, tool } from "ai";
import { z } from "zod";
import { createLmStudioProvider } from "./lm-studio.js";

const chatTools = {
  getProjectStatus: tool({
    description: "Get current status, health, and recent activity for a project",
    parameters: z.object({
      slug: z.string().describe("Project slug like 'mission-control' or 'openefb'"),
    }),
    execute: async ({ slug }) => {
      // Call existing MC internal functions (not HTTP -- direct DB access)
      const project = getProjectWithScanData(config, slug);
      const findings = getActiveFindings(db).filter(f => f.projectSlug === slug);
      return { project, healthScore: computeHealthScore(findings), findings };
    },
  }),
  searchMC: tool({
    description: "Search across all MC content -- captures, commits, knowledge, solutions",
    parameters: z.object({
      query: z.string().describe("Natural language search query"),
    }),
    execute: async ({ query }) => {
      return hybridSearch(sqlite, db, query, { limit: 10 });
    },
  }),
  createCapture: tool({
    description: "Create a new capture in MC on Ryan's behalf",
    parameters: z.object({
      content: z.string().describe("The capture content"),
      projectSlug: z.string().optional().describe("Optional project to assign to"),
    }),
    execute: async ({ content, projectSlug }) => {
      return createCapture(db, {
        rawContent: content,
        type: "text",
        projectId: projectSlug ?? null,
        userId: "bella",
        sourceType: "bella",
      });
    },
  }),
};

// In the chat route handler:
app.post("/chat", async (c) => {
  const { messages } = await c.req.json();
  const provider = createLmStudioProvider(lmStudioUrl);

  const result = streamText({
    model: provider.chatModel(modelId),
    system: BELLA_SYSTEM_PROMPT,
    messages,
    tools: chatTools,
    maxSteps: 5,  // Allow multi-step tool calling
  });

  return result.toUIMessageStreamResponse();
});
```

### Pattern 2: User Identity via Tailscale Headers
**What:** When MC runs behind Tailscale Serve, requests include identity headers. For direct Tailscale connections, resolve the client IP via `tailscale whois`. A simple config-based user registry maps identities to user profiles.
**When to use:** Every API request, to determine if the client is Ryan or Bella.
**Example:**
```typescript
// User identity middleware
import { Hono } from "hono";

interface MCUser {
  id: string;         // "ryan" | "bella"
  displayName: string;
  role: "owner" | "member";
}

const USER_REGISTRY: Record<string, MCUser> = {
  "ryan@example.com": { id: "ryan", displayName: "Ryan", role: "owner" },
  "bella@example.com": { id: "bella", displayName: "Bella", role: "member" },
};

// Resolve user from Tailscale headers or config fallback
function resolveUser(c: Context): MCUser | null {
  // Tailscale Serve adds these headers
  const login = c.req.header("Tailscale-User-Login");
  if (login && USER_REGISTRY[login]) return USER_REGISTRY[login];

  // Fallback: check X-MC-User header (for dev/testing)
  const mcUser = c.req.header("X-MC-User");
  if (mcUser) return Object.values(USER_REGISTRY).find(u => u.id === mcUser) ?? null;

  // Default to ryan (backward compatible -- single user assumption)
  return USER_REGISTRY["ryan@example.com"] ?? null;
}
```

### Pattern 3: Chat Page as Separate Route in Existing Web App
**What:** Add client-side routing to the existing React app. `/bella` renders the chat interface. The existing dashboard stays at `/`. No React Router needed -- simple hash or path routing with state.
**When to use:** Serving Bella's client from the same deployment.
**Example:**
```typescript
// In App.tsx -- extend the existing view state
type View = "dashboard" | "network" | "graph" | "bella";

// Or use URL path detection for deep-linking:
function getInitialView(): View {
  if (window.location.pathname === "/bella") return "bella";
  return "dashboard";
}
```

### Pattern 4: System Prompt with Persona and Grounding Rules
**What:** The LLM system prompt defines Bella's experience. It instructs the model to always use tools for data, never hallucinate project details, and present information from Bella's perspective (not Ryan's operator view).
**When to use:** Every chat session.
**Example:**
```typescript
const BELLA_SYSTEM_PROMPT = `You are Mission Control, Ryan's personal operating environment.
You are talking to Bella, Ryan's team member.

RULES:
- ALWAYS use tools to look up project status, captures, and activity. Never guess.
- When Bella asks "what's Ryan working on?", use getProjectStatus and getRecentSessions.
- When Bella wants to capture something, use createCapture with userId "bella".
- Present information conversationally, not as raw data dumps.
- If you don't have data to answer, say so honestly.
- When showing project info, focus on what matters to Bella: status, blockers, recent activity.
- You can see iMessage conversation extracts -- reference them naturally.

CONTEXT:
- Ryan works in serial sprints -- one project gets intense focus
- The MC API has: projects, captures, health checks, sessions, search, intelligence
- Bella is learning to build on this platform -- explain how things work when asked
`;
```

### Anti-Patterns to Avoid
- **Building a separate frontend app:** Duplicates deployment, splits the codebase, makes sharing design tokens harder. Use the existing web package.
- **Direct database queries in chat route:** Keep the chat tools calling existing service functions. Don't bypass the established query layer.
- **Unbounded LLM context:** Chat history grows fast. Implement a sliding window or summarization strategy for long conversations.
- **Streaming without fallback:** LM Studio may be unavailable. Chat must gracefully degrade (show "MC is thinking but the AI is offline" and offer to show raw data instead).
- **Hardcoded user list:** Put user registry in mc.config.json, not in code. Config-driven for when the next person joins.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chat message streaming | Custom WebSocket or SSE protocol | AI SDK `useChat` + `streamText` | Handles message accumulation, streaming state, abort, retry. Battle-tested. |
| Tool calling orchestration | Manual prompt engineering with JSON parsing | AI SDK `tool()` + `maxSteps` | Type-safe tool definitions, automatic multi-step execution, result injection. |
| Chat message state | useState for message array with manual updates | `useChat` hook from @ai-sdk/react | Manages optimistic updates, streaming state, error recovery, scroll behavior. |
| LLM provider abstraction | Custom fetch to LM Studio /v1/chat/completions | `createLmStudioProvider` (already exists) | Already handles model selection, timeout, error handling. Proven in narratives/digests. |

**Key insight:** The AI SDK is already the backbone of MC's intelligence features. Chat is just another `streamText` call with tools. The only new dependency is `@ai-sdk/react` for the frontend hook.

## Common Pitfalls

### Pitfall 1: LM Studio Unavailability During Chat
**What goes wrong:** Bella opens chat, LM Studio is loading or unavailable, chat appears broken.
**Why it happens:** LM Studio has three states: unavailable, loading, ready. Chat requires "ready."
**How to avoid:** Check `getLmStudioStatus()` before streaming. If not ready, show a friendly message ("MC's brain is warming up, try again in a moment") and offer a "quick look" mode that shows raw project data without AI synthesis.
**Warning signs:** Chat responds with errors on first message.

### Pitfall 2: Tool Calling Loops
**What goes wrong:** LM Studio calls the same tool repeatedly, or enters an infinite loop of tool calls without generating a response.
**Why it happens:** Smaller models sometimes struggle with knowing when to stop calling tools.
**How to avoid:** Set `maxSteps: 5` (or similar cap) on `streamText`. Include explicit instructions in the system prompt: "After gathering data, synthesize and respond. Do not call the same tool twice with the same parameters."
**Warning signs:** Chat hangs for a long time, or produces tool results but no human-readable response.

### Pitfall 3: Context Window Overflow
**What goes wrong:** Long conversations exhaust LM Studio's context window (~4K-16K tokens depending on model), causing degraded or truncated responses.
**Why it happens:** Chat history grows linearly with each message exchange.
**How to avoid:** Implement a sliding window: keep the system prompt + last N messages. When conversation exceeds threshold, summarize older messages into a context block. The existing `truncateContext` utility from context-adapter.ts can be reused.
**Warning signs:** Responses become incoherent or lose earlier conversation context.

### Pitfall 4: Capture Source Type Schema Extension
**What goes wrong:** Adding `sourceType: "bella"` to captures fails validation because the Zod enum doesn't include it.
**Why it happens:** `captureSourceTypeEnum` is defined as `z.enum(["manual", "capacities", "imessage", "cli"])` in shared schemas.
**How to avoid:** Extend the enum to include `"bella"` (or more generically, `"chat"`). Update both the Zod schema and the Drizzle SQLite column enum. Run migration.
**Warning signs:** Capture creation fails with validation errors.

### Pitfall 5: CORS and Streaming Headers
**What goes wrong:** `useChat` streaming fails in the browser due to CORS or missing streaming headers.
**Why it happens:** The AI SDK's `toUIMessageStreamResponse()` returns specific content-type headers that must pass through CORS middleware.
**How to avoid:** Verify that the existing CORS middleware (`app.use("/api/*", cors())`) allows the streaming content type. The AI SDK uses `text/event-stream` for UI message streams, which should work with Hono's cors() middleware. Test early.
**Warning signs:** Chat connection opens but no messages appear.

### Pitfall 6: Tailscale Headers Not Present in Dev Mode
**What goes wrong:** User identity resolution fails during local development because Tailscale Serve headers aren't injected.
**Why it happens:** Only Tailscale Serve (or Tailscale Funnel) adds identity headers. Direct connections via Tailscale IP don't include them.
**How to avoid:** Implement a fallback: `X-MC-User` header for dev/testing, default to "ryan" when no identity headers present. Make the fallback configurable.
**Warning signs:** Bella always appears as Ryan in dev mode.

## Code Examples

### Chat Route Handler (Hono + AI SDK streamText)
```typescript
// Source: ai-sdk.dev/examples/api-servers/hono + existing MC patterns
import { Hono } from "hono";
import { streamText } from "ai";
import { createLmStudioProvider, getLmStudioStatus } from "../services/lm-studio.js";
import { chatTools } from "../services/chat-tools.js";
import type { DatabaseInstance } from "../db/index.js";

export function createChatRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .post("/chat", async (c) => {
      const { messages } = await c.req.json();

      // Check LM Studio availability
      const status = getLmStudioStatus();
      if (status.health !== "ready") {
        return c.json({
          error: { code: "LLM_UNAVAILABLE", message: "MC intelligence is warming up" }
        }, 503);
      }

      const provider = createLmStudioProvider("http://100.123.8.125:1234");
      const db = getInstance();

      const result = streamText({
        model: provider.chatModel(status.modelId!),
        system: BELLA_SYSTEM_PROMPT,
        messages,
        tools: chatTools(db),
        maxSteps: 5,
      });

      return result.toUIMessageStreamResponse();
    });
}
```

### useChat Frontend Integration
```typescript
// Source: ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
import { useChat } from "@ai-sdk/react";

export function useBellaChat() {
  const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

  return useChat({
    api: `${API_BASE}/api/chat`,
    id: "bella-chat",
    onError: (error) => {
      console.error("Chat error:", error);
    },
  });
}
```

### Tool Definition Pattern (Reusing Existing MC Services)
```typescript
// Source: ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
import { tool } from "ai";
import { z } from "zod";

export function chatTools(dbInstance: DatabaseInstance) {
  const { db, sqlite } = dbInstance;

  return {
    listProjects: tool({
      description: "List all tracked projects with their status and health",
      parameters: z.object({}),
      execute: async () => {
        const projects = listProjects(db, {});
        return projects.map(p => ({
          slug: p.slug, name: p.name, status: p.status,
          lastCommit: p.headCommitDate, host: p.host,
        }));
      },
    }),

    getRecentCaptures: tool({
      description: "Get recent captures, optionally filtered by project or source",
      parameters: z.object({
        projectSlug: z.string().optional(),
        sourceType: z.string().optional(),
        limit: z.number().default(10),
      }),
      execute: async ({ projectSlug, sourceType, limit }) => {
        return listCaptures(db, {
          projectId: projectSlug,
          limit,
        });
      },
    }),

    getImessageExtracts: tool({
      description: "Get extracted insights from Ryan and Bella's iMessage conversations",
      parameters: z.object({ limit: z.number().default(20) }),
      execute: async ({ limit }) => {
        // Filter captures by imessage source type
        return listCaptures(db, { limit }).filter(
          c => c.sourceType === "imessage"
        );
      },
    }),
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom WebSocket chat | AI SDK `streamText` + `useChat` | AI SDK v3+ (2024) | Eliminates custom streaming code; tool calling built in |
| Separate chat backend | Same API server with chat route | Current best practice | One deployment, shared DB access, no inter-service calls |
| Fixed prompt engineering | Tool-calling RAG | AI SDK v4+ (2025) | LLM fetches what it needs instead of receiving everything upfront |
| Session-based auth | Tailscale identity headers | Tailscale Serve | Zero-config identity for intranet apps |

**Deprecated/outdated:**
- Building chat with raw WebSocket connections (AI SDK handles this)
- Embedding all context in system prompt (tool calling is more precise and scalable)
- Separate Next.js or Express server for chat (Hono handles it natively)

## Open Questions

1. **Tailscale Serve configuration**
   - What we know: Tailscale Serve adds identity headers (`Tailscale-User-Login`, `Tailscale-User-Name`, etc.) when proxying traffic
   - What's unclear: Is MC currently served via `tailscale serve` on the Mac Mini, or via direct Tailscale IP? If direct, headers won't be present.
   - Recommendation: Implement dual-mode identity: Tailscale headers when present, config-based `users` array in mc.config.json as fallback. For v1, a simple config entry is sufficient.

2. **LM Studio model for chat vs. intelligence**
   - What we know: Current model is Qwen3-Coder-30B, used for narratives, routing, digests. Context window is model-dependent (8K-16K).
   - What's unclear: Is Qwen3-Coder optimal for conversational chat? It's a code model. Chat may benefit from a general model.
   - Recommendation: Start with whatever model is loaded. The `createLmStudioProvider` abstraction makes it model-agnostic. If chat quality is poor, recommend switching to a conversational model in a follow-up.

3. **Conversation persistence**
   - What we know: Current MC has no conversation/thread storage. `useChat` maintains state in React memory (lost on refresh).
   - What's unclear: Should chat history persist across sessions?
   - Recommendation: Start without persistence (matches Juliet behavior -- ephemeral chat). Add a `chat_messages` table later if Bella finds value in reviewing past conversations. Simpler to add than to remove.

4. **"Teaching to build" UX**
   - What we know: D-08 and D-09 want Bella to learn the platform and eventually build her own tools.
   - What's unclear: What does the "learning" experience look like in practice?
   - Recommendation: Phase 1: Chat can explain how MC works when asked ("how does the capture system work?", "what API endpoints are available?"). Phase 2 (future): Interactive tutorials, API playground. Keep it conversational for now -- Bella learns by asking, MC explains by showing.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| LM Studio | Chat LLM backend | Conditional | Qwen3-Coder-30B | Show "AI offline" message, offer raw data browse mode |
| Tailscale | User identity | Yes | Running on Mac Mini | Config-based user header fallback |
| Node.js | API server | Yes | 20+ | -- |
| pnpm | Package management | Yes | 9+ | -- |

**Missing dependencies with no fallback:**
- None. All critical dependencies are available or have fallbacks.

**Missing dependencies with fallback:**
- LM Studio may be loading/unavailable: fallback to raw data mode (project list, capture list without AI synthesis)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1+ |
| Config file | `packages/api/vitest.config.ts` and `packages/web/vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BELLA-01 | Chat endpoint streams responses via AI SDK | unit | `pnpm --filter @mission-control/api test -- --grep "chat"` | No -- Wave 0 |
| BELLA-02 | Chat tools return project data from MC database | unit | `pnpm --filter @mission-control/api test -- --grep "chat-tools"` | No -- Wave 0 |
| BELLA-03 | User identity resolved from headers/config | unit | `pnpm --filter @mission-control/api test -- --grep "user-identity"` | No -- Wave 0 |
| BELLA-04 | Chat tools can query projects, captures, risks, sessions | unit | `pnpm --filter @mission-control/api test -- --grep "chat-tools"` | No -- Wave 0 |
| BELLA-05 | Capture creation tool sets userId and sourceType correctly | unit | `pnpm --filter @mission-control/api test -- --grep "chat-tools"` | No -- Wave 0 |
| BELLA-06 | iMessage extract tool filters by sourceType=imessage | unit | `pnpm --filter @mission-control/api test -- --grep "chat-tools"` | No -- Wave 0 |
| BELLA-07 | System prompt enforces tool usage for data questions | unit | `pnpm --filter @mission-control/api test -- --grep "chat"` | No -- Wave 0 |
| BELLA-09 | User registry resolves multiple users from config | unit | `pnpm --filter @mission-control/api test -- --grep "user-identity"` | No -- Wave 0 |
| BELLA-10 | Bella layout renders chat-first interface | unit | `pnpm --filter @mission-control/web test -- --grep "bella"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/routes/chat.test.ts` -- covers BELLA-01, BELLA-07
- [ ] `packages/api/src/__tests__/services/chat-tools.test.ts` -- covers BELLA-02, BELLA-04, BELLA-05, BELLA-06
- [ ] `packages/api/src/__tests__/lib/user-identity.test.ts` -- covers BELLA-03, BELLA-09
- [ ] `packages/web/src/__tests__/components/bella-chat.test.tsx` -- covers BELLA-10
- [ ] Schema migration for `sourceType` enum extension (add "bella" or "chat")

## Sources

### Primary (HIGH confidence)
- AI SDK official docs (ai-sdk.dev) -- Hono integration, useChat hook, streamText, tool calling, RAG cookbook
- Existing MC codebase -- packages/api/src/services/lm-studio.ts, narrative-generator.ts, routing-advisor.ts (established AI SDK patterns)
- Existing MC codebase -- packages/api/src/routes/ (23 route files establishing the Hono route pattern)
- Existing MC codebase -- packages/shared/src/schemas/capture.ts (capture schema with sourceType enum)
- Existing MC codebase -- packages/api/src/services/imessage-monitor.ts (iMessage capture pipeline)

### Secondary (MEDIUM confidence)
- Tailscale documentation -- identity headers via Tailscale Serve (tailscale.com/docs/features/tailscale-serve)
- AI SDK GitHub issues -- Hono streaming compatibility confirmed working (github.com/vercel/ai/issues/7045)

### Tertiary (LOW confidence)
- Qwen3-Coder-30B conversational quality for non-code chat -- untested, may need model experimentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- AI SDK already in project, only @ai-sdk/react is new, patterns proven in 6 phases
- Architecture: HIGH -- follows established MC patterns (route + service + shared schema), RAG via tools is documented
- Pitfalls: HIGH -- based on direct codebase analysis (schema constraints, LM Studio states, CORS)
- User identity: MEDIUM -- Tailscale Serve header approach confirmed in docs, but current MC deployment method unclear

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable stack, no fast-moving dependencies)
