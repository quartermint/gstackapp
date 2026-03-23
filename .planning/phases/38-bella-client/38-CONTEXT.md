# Phase 38: Bella Client — Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a dedicated MC client for Bella — the second lightsaber. A conversational interface where she can see Ryan's project state, interact with the MC environment, and teach herself to build up her own tools (iOS app, desktop arsenal). The first non-Ryan user of the MC platform, establishing the pattern for "company as a codebase."

**Origin:** In the Juliet prototype (Sue sandbox, ~Jan 2026), Ryan built decision cards + kanban boards + task assignments. Bella gravitated to the chatbot interface instead, using it as a "Ryan interpreter" to understand context and navigate decisions. The planned features weren't the value — the conversational access to Ryan's brain was.

**Quote (Bella, 2026-01-30 Tech Summit follow-up):** *"Certain things that we think might be a great idea don't get used. And then she's like, actually, I use the chatbot feature, the most defined data."*

**Quote (Bella, same session):** *"She honestly uses Juliet the most... because she's the person doing a lot of those administrative or project management tasks."*

This phase takes that validated insight and builds it properly on MC's platform.

</domain>

<decisions>
## Implementation Decisions

### Core Experience
- **D-01:** Chat-first interface. Bella talks to MC like she talked to Juliet. The conversational interface IS the product — not a sidebar to a dashboard.
- **D-02:** "Ryan interpreter" mode — Bella can ask "what's Ryan working on?", "what did he capture about openefb?", "what's the status of the iOS app?" and get contextual answers from MC's data.
- **D-03:** MC knows it's Bella. Auth via Tailscale device identity or simple config. Bella sees a Bella-appropriate view of Ryan's environment — not the full departure board.

### What Bella Can Do
- **D-04:** Read project status, captures, risks, session activity — everything MC surfaces to Ryan, contextualized for Bella's perspective.
- **D-05:** Send captures into MC on Ryan's behalf ("Ryan wants to remember X", "add this to the openefb backlog").
- **D-06:** See iMessage conversation extracts that MC already captured (Phase 33 CAP-09) — "MC already knows what we discussed, here's what it extracted."
- **D-07:** Ask MC questions about Ryan's environment, get answers grounded in actual data (not hallucinated).

### Teaching Bella to Build
- **D-08:** The goal is to teach Bella how to build up the iOS app and desktop tools. The client should expose enough of MC's internals that she can learn the platform.
- **D-09:** Once Bella can build her own lightsaber on MC's foundry, that's the pattern for the next person. "Company as a codebase" validated.

### Platform Pattern
- **D-10:** This is the second client on MC's API-first platform. Dashboard is client #1, CLI is #2, MCP is #3, iOS is #4, Bella Client is #5. Same API, different UX.
- **D-11:** Bella's client establishes the multi-user pattern. If this works, the same approach extends to future team members.

### Claude's Discretion
- Client technology (web app? Slack bot? iOS app? Streamline integration?)
- Chat interface implementation (LLM-powered chat over MC API? or structured command interface?)
- What "Bella-appropriate view" means in practice (simplified dashboard? chat-only? both?)
- Auth mechanism details (Tailscale device fingerprint, simple token, or config-based)
- How to expose MC internals for learning (documentation? guided tutorials? pair programming UX?)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Juliet Prototype Evidence
- `/Users/ryanstern/granobsidian/2026-01-30_Follow-up-Tech-Summit.md` — Lines 23:10:09-23:12:22: Ryan demos Juliet (decision cards, kanban), Bella reveals chatbot is the most-used feature
- `/Users/ryanstern/granobsidian/2026-03-02_QM-space-app-development-and-GitHub-setup-with-Bella.md` — QM Space evolution: "one single chat interface with docs and spreadsheets", "no channels, we just talk here"

### MC Vision
- `.planning/v2.0-VISION.md` — "Company as a codebase" philosophy, lightsaber metaphor
- `.planning/PROJECT.md` — "Bella eventually gets visibility, builds her own lightsaber on the same platform"

### MC API (what Bella's client would consume)
- `packages/api/src/routes/` — All existing API routes (projects, captures, risks, sessions, health-checks, knowledge, search)
- `packages/shared/src/schemas/` — Zod schemas defining API contracts

### Related Projects
- `~/streamline/` — Team workspace (formerly QMSpace). The "no channels, just talk" chat concept lives here. Possible integration point.

### iMessage Integration
- Phase 33 CONTEXT.md — CAP-09 iMessage monitoring captures Ryan ↔ Bella conversations. Bella Client can surface these.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- MC API is fully API-first — any client can consume it via HTTP
- Hono RPC types — type-safe client generation for any TS client
- MCP server — could power a chat interface (MC already exposes tools for project queries)
- Existing Zod schemas in packages/shared — client can validate responses

### Established Patterns
- API-first: dashboard, CLI, MCP, iOS all consume the same API
- SSE for real-time updates — Bella Client can subscribe to project events
- No auth in v1 (Tailscale boundary) — Bella is on Tailscale

### Integration Points
- Same `/api/*` endpoints the dashboard uses
- Potential: Streamline (QMSpace) chat infrastructure as the delivery vehicle
- Potential: MC MCP server tools as the "brain" behind a chat interface
- Phase 33's iMessage captures as a data source Bella can review

</code_context>

<specifics>
## Specific Ideas

### The Juliet Insight
The critical learning from the Juliet prototype: users don't want dashboards with features — they want a conversational interface to someone else's brain. Bella used Juliet not to manage tasks but to understand Ryan's thinking. The chatbot feature beat kanban, decision cards, and task assignments because it was the lowest-friction way to get context.

### "Ryan Interpreter" Pattern
The Bella Client should feel like talking to Ryan's environment. When Bella asks "what's the status of mission-control?", MC answers with the same context Ryan would give — recent commits, active risks, what he captured, what sessions are running. It's not a chatbot; it's a window into Ryan's operational state.

### Teaching to Fish
The goal isn't just to give Bella a client — it's to teach her to build. The iOS app becomes her learning vehicle. Desktop tools become her arsenal. MC's API-first architecture means she can build whatever she needs. Phase 38 is the first lightsaber built by someone other than Ryan.

### The Next Person After Bella
Once this works, the pattern is established: new team member → gets MC access → gets a personalized client → learns the platform → builds their own tools. "You can't assign someone their obsession — provide access, foster curiosity."

</specifics>

<deferred>
## Deferred Ideas

- Multi-user auth system (beyond Tailscale device identity)
- Bella-specific dashboard views (separate from chat interface)
- Team-wide project visibility controls (who sees what)
- Bella's own capture pipeline (her own iMessage monitoring, her own Capacities equivalent)

</deferred>

---

*Phase: 38-bella-client*
*Context gathered: 2026-03-23*
