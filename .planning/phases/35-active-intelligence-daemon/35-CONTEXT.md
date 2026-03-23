# Phase 35: Active Intelligence Daemon - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Activate LM Studio from passive health probe to active intelligence engine. Generate "Previously on..." narratives, daily digests, smart session routing, and respond to tool calls — all via constrained JSON schema generation inspired by Apple Foundation Models' @Generable pattern.

</domain>

<decisions>
## Implementation Decisions

### LM Studio Activation
- **D-01:** Extend lm-studio.ts from health probe to inference client. Use OpenAI-compatible API (chat completions, embeddings).
- **D-02:** Abstract over specific model — today Qwen3-Coder-30B, tomorrow dedicated models per task. Daemon manages model lifecycle.
- **D-03:** All local LLM outputs use JSON schema constrained generation. No free-form parsing. Like Foundation Models' @Generable but via JSON schema constraints in the API call.

### "Previously on..." Narratives
- **D-04:** Each project card shows AI-generated context restoration narrative. Summarizes recent commits + captures + session outcomes.
- **D-05:** Narratives cached with 1h TTL. Generated async, never blocks API responses.

### Daily Digest
- **D-06:** Generated at 6am (configurable). Covers overnight commits, captures, findings, session outcomes.
- **D-07:** Cached with 12h TTL. Dashboard pulls from cache on load.

### Smart Routing
- **D-08:** Track session tier (opus/sonnet/local) vs outcome (commits, duration, files changed). Suggest optimal routing at session start.
- **D-09:** Routing suggestions are informational, never restrict. Existing budget-service.ts pattern.

### Adaptive Context
- **D-10:** Adaptive context injection based on model size. Small models get compact summaries, large models get full context. Stolen from project-nomad's RAG_CONTEXT_LIMITS.

### Intelligence Cache
- **D-11:** `intelligence_cache` table with TTL. Like qmd's `llm_cache` — prevent redundant inference.
- **D-12:** Cache keys: project_slug + generation_type + content_hash of inputs. Invalidate when inputs change.

### Claude's Discretion
- Tool calling interface design (which tools, what schema)
- Model warm/cool lifecycle management
- Narrative prompt engineering
- Digest format and content prioritization
- Scheduling implementation (cron-style vs interval-based)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision
- `.planning/v2.0-VISION.md` — DAEMON-01 through DAEMON-08 requirements

### LM Studio
- `packages/api/src/services/lm-studio.ts` — Current health probe (to be extended)
- `packages/api/src/routes/models.ts` — Model status endpoint

### Session Infrastructure
- `packages/api/src/services/budget-service.ts` — Session tier tracking (extend for outcome tracking)
- `packages/api/src/routes/sessions.ts` — Session lifecycle hooks

### Dashboard
- `packages/web/src/components/hero/hero-card.tsx` — Where "Previously on..." narrative displays
- `packages/web/src/components/departure-board/previously-on.tsx` — Existing "Previously on" commit breadcrumbs (to be enhanced)

### Inspiration
- Apple Foundation Models — constrained generation via @Generable, tool calling, context window management
- project-nomad — adaptive RAG context limits based on model size

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lm-studio.ts` — probeLmStudio(), startLmStudioProbe() patterns
- `budget-service.ts` — session tier tracking, weekly aggregation
- `previously-on.tsx` — existing commit breadcrumb display (enhance with AI narrative)
- `hero-card.tsx` — project detail display (add narrative section)

### Established Patterns
- Background polling with caching (LM Studio probe pattern)
- SSE for real-time updates
- fetchCounter pattern for dashboard data refresh
- `queueMicrotask` for async work (extend to scheduled intelligence)

### Integration Points
- New `intelligence_cache` table
- Extend `/api/models` to include active inference capabilities
- Extend session hook responses with routing suggestions
- New `/api/intelligence/:slug/narrative` endpoint (or similar)
- Scheduled timer registration alongside existing scan cycle and knowledge aggregation timers

</code_context>

<specifics>
## Specific Ideas

- LM Studio exposes `/v1/chat/completions` with `response_format: { type: "json_schema", json_schema: {...} }` for constrained output. Use this for all intelligence generation.
- The "Previously on..." narrative should read like a TV recap: "Last time on openefb: you shipped the MapLibre overlay (3 commits), captured 2 ideas about chart zoom, and left a dirty working tree with flight plan rendering changes."
- Daily digest should prioritize by actionability: stale captures first, then dependency drift, then activity summary.

</specifics>

<deferred>
## Deferred Ideas

- Multi-model orchestration (different models for different tasks) — start with one model
- Local LLM fine-tuning for MC-specific tasks — future optimization
- Intelligence API exposed via MCP (let Claude Code query the daemon)

</deferred>

---

*Phase: 35-active-intelligence-daemon*
*Context gathered: 2026-03-22*
