# Phase 17: Auth & Harness Independence - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Any user can authenticate and trigger a pipeline run from the web UI, with isolated sessions routed through the harness execution engine. This phase covers auth (Tailscale auto-detect + magic link), session isolation, the operator intake form, and the harness executing as a Claude Code subprocess triggered from the web.

</domain>

<decisions>
## Implementation Decisions

### Auth UX Flow
- **D-01:** Tailscale auto-detect on first visit. If request comes from Tailscale IP, auto-identify user and land on dashboard with zero friction (no login page). If not on tailnet, show a clean login page with email input for magic link.
- **D-02:** Magic link sessions persist via httpOnly secure cookie for 7 days. External users re-authenticate weekly. Tailscale users never see a login page.
- **D-03:** Roles mapped via hardcoded allowlist in config/env. `ADMIN_EMAILS=ryan@quartermint.com`, `OPERATOR_EMAILS=ryn@...,bella@...,andrew@...`. New users added by editing config.

### Session Isolation
- **D-04:** Operators see only their own request history, audit trail, and pipeline runs. Admin (Ryan) sees everything across all users. No shared view between operators.

### Pipeline Trigger UX
- **D-05:** Structured intake form matching OP-01 requirements: "What do you need?" (textarea) + "What does good look like?" (textarea) + optional deadline (text input). Clean fields, submit button.
- **D-06:** Operator home IS the intake form. Operators land on the form as their primary view. Request history appears below the form. Minimal navigation — the form is their whole world.

### Harness Web Execution
- **D-07:** Spawn Claude Code as a subprocess for each pipeline run. Shell out to `claude` CLI. Gets the full agent loop (tool_use, reasoning, multi-turn) for free without reimplementing it.
- **D-08:** File-based handoff for results. Claude Code writes results to a temp directory (`/tmp/pipeline-{id}/`). No stdout parsing needed.
- **D-09:** Hybrid polling: server polls the output directory for progress updates on an interval, but Claude Code signals completion via a local HTTP callback (webhook to localhost). Guarantees final result is immediate while progress updates flow on poll cycle.

### Claude's Discretion
- Poll interval for progress updates — Claude decides appropriate frequency
- Claude Code CLI flags and configuration for subprocess spawning
- Temp directory structure and file naming conventions
- Local webhook endpoint path and payload format

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth Design
- `~/.gstack/projects/quartermint-gstackapp/ryanstern-main-design-20260411-100303.md` — Approved v2.0 design doc with auth decisions (Tailscale ACL + magic link)
- `.planning/REQUIREMENTS.md` §Auth & Multi-User — AUTH-01 through AUTH-04
- `.planning/REQUIREMENTS.md` §Harness Independence — HRN-01 through HRN-05

### Existing Harness
- `packages/harness/src/` — Provider registry, model router, skill system, sync
- `packages/api/src/agent/` — Existing agent loop, stream-bridge, tools, system prompt
- `packages/api/src/routes/sessions.ts` — Existing session route patterns
- `packages/api/src/routes/sse.ts` — SSE streaming pattern

### SendGrid
- SendGrid already configured for OIP (magic link email provider)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/api/src/agent/stream-bridge.ts` — Stream bridging pattern (stdout → events)
- `packages/api/src/agent/loop.ts` — Agent execution loop
- `packages/api/src/routes/sse.ts` — SSE streaming endpoint
- `packages/web/src/components/session/` — Session UI components (MessageBubble, MessageList, InputArea, SessionView)
- `packages/web/src/components/decision/` — DecisionGateCard, DecisionQueue
- `packages/api/src/events/` — Event bus for SSE broadcasting

### Established Patterns
- Hono route handlers with Zod validation
- React SPA with TanStack Query for server state
- SSE via Hono `streamSSE` + browser EventSource
- Drizzle ORM with Neon Postgres

### Integration Points
- New auth middleware wraps all existing routes
- Intake form POST → new `/api/operator/request` route
- Claude Code subprocess spawned from Hono route handler
- File watcher + completion webhook → SSE events → React UI

</code_context>

<specifics>
## Specific Ideas

- The operator experience should feel like texting a capable assistant, not using enterprise software
- "Ask Ryan" is the universal escalation path — appears on error states and decision gates
- Zero navigation for operators — form + history is the entire interface

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-auth-harness-independence*
*Context gathered: 2026-04-11*
