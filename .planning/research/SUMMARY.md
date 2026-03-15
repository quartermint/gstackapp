# Research Summary: Mission Control v1.2 Session Orchestrator + Local LLM Gateway

**Domain:** Personal coding session orchestration, model tier routing, local LLM integration
**Researched:** 2026-03-15
**Overall confidence:** HIGH

## Executive Summary

Mission Control v1.2 evolves MC from a passive project dashboard into an active coding session orchestrator. The core capability is session awareness -- knowing which Claude Code and Aider sessions are active, what files they're touching, which model tier they're using, and whether parallel sessions are creating conflicts. The secondary capability is local LLM integration via LM Studio on the Mac Mini, enabling MC to route some of its own AI operations through a local Qwen3-Coder-30B model instead of burning Gemini API credits.

The stack addition is minimal: one new npm package (`@ai-sdk/openai-compatible` v2.0.35) for LM Studio integration via the already-installed Vercel AI SDK. Everything else -- session state storage, real-time updates, API routes, conflict detection, budget tracking -- builds on the existing Hono + SQLite + SSE + React architecture with zero new infrastructure.

The primary integration mechanism is Claude Code's hook system, which supports HTTP hooks (POST directly to MC API) and command hooks (shell scripts). Hooks fire on SessionStart, PostToolUse, Stop, and SessionEnd events, providing session_id, model, cwd, tool_input (file paths), and last_assistant_message. Aider lacks hooks but marks its commits with `(aider)` in the git author name, enabling passive detection via the existing project scan cycle.

The biggest technical risks are: hook scripts that block Claude Code (must be fire-and-forget), heartbeat flood from overly broad PostToolUse matchers, ghost sessions when Stop hooks don't fire (need a session reaper), and misleading budget heuristics (Claude doesn't expose per-session token counts, so budget tracking must use session counts with tier-based estimates, clearly labeled as estimates).

## Key Findings

**Stack:** One new dependency (`@ai-sdk/openai-compatible ^2.0.35`) for LM Studio. Everything else uses existing infrastructure.

**Architecture:** Push-based ingestion (hooks POST to MC API) is new for MC, but the downstream flow (SQLite -> event bus -> SSE -> dashboard) is identical to existing patterns. Session orchestration adds ~3 new services, ~3 new route files, ~2 new DB tables, and ~5 new SSE event types.

**Critical pitfall:** Hook scripts must be fire-and-forget. A blocking hook degrades the entire Claude Code experience. Background curl, short timeouts, always exit 0.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Data Foundation** - Schema, migration, Zod schemas, config extension
   - Addresses: Session storage, budget tracking tables, model tier definitions
   - Avoids: Migration risks by being purely additive (new tables only)

2. **Session Ingestion** - API endpoints, session service, event bus extension, hook scripts
   - Addresses: Core session lifecycle (start/heartbeat/stop), cwd-to-project resolution
   - Avoids: Heartbeat flood pitfall by narrowing PostToolUse matcher to Write/Edit only
   - Avoids: Ghost sessions by building session reaper from day one

3. **LM Gateway + Budget** - LM Studio health probe, budget service, model endpoints
   - Addresses: Local model availability, tier cost tracking, weekly rollup
   - Avoids: Cold start pitfall by implementing three-state health (unavailable/loading/ready)

4. **Intelligence Layer** - Conflict detection, convergence detection, session abandonment
   - Addresses: Cross-session file overlap detection, merge readiness signals
   - Avoids: Path normalization pitfall by resolving all paths to absolute

5. **Dashboard** - Session feed, budget widget, conflict alerts, LM status
   - Addresses: Visual session awareness, budget at a glance
   - Avoids: SSE flood by emitting only state changes, not heartbeats

**Phase ordering rationale:**
- Schema first because every service depends on it
- Ingestion second because intelligence and dashboard need session data flowing
- LM gateway and budget are independent of each other but both need schema
- Intelligence requires ingested data to detect patterns across sessions
- Dashboard last because it needs all backend pieces in place to render

**Research flags for phases:**
- Phase 2 (Ingestion): Needs careful hook configuration testing -- HTTP hooks vs command hooks, coexistence with 6+ existing hooks
- Phase 3 (LM Gateway): Needs verification that LM Studio on Mac Mini is actually running and model is loaded. Consider a prerequisite check.
- Phase 4 (Intelligence): Convergence detection is the highest-complexity feature. May need to defer if Phase 2-3 scope is already large.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | One new package, well-documented, verified on official docs and npm |
| Features | HIGH | Table stakes and differentiators well-defined, anti-features clear |
| Architecture | HIGH | Extends existing patterns, no new infrastructure, push-based ingestion is well-understood |
| Pitfalls | HIGH | Critical pitfalls verified through Claude Code docs and community issues |
| Claude Code hooks | HIGH | Official docs verified, input/output schemas documented, HTTP hooks confirmed |
| Aider integration | MEDIUM | Git attribution-based detection is straightforward but wrapper script UX is uncertain |
| LM Studio integration | HIGH | OpenAI-compatible API well-documented, Vercel AI SDK integration verified |
| Budget tracking accuracy | LOW | Heuristic-based, no token API available, must be clearly labeled as estimates |

## Gaps to Address

- **Aider session detection reliability**: Passive git-polling catches completed work but misses active sessions. The wrapper script approach adds friction. Need to decide: is passive detection (git commits only) sufficient, or is the wrapper worth the UX cost?
- **Budget heuristic calibration**: What's a reasonable per-session cost estimate per tier? Need real-world data from Claude billing to calibrate. Start with session counts, add dollar estimates later once calibrated.
- **Convergence detection scope**: How sophisticated should branch analysis be? Simple "both sessions committed on same project" may be sufficient for v1.2. Full branch divergence analysis is v1.3+ territory.
- **HTTP hooks vs command hooks**: HTTP hooks are cleaner but need verification that they work with the existing hook array structure in settings.json. Command hooks are proven (6 existing hooks) but add shell script maintenance.
- **SubagentStart/SubagentStop hooks**: These exist but it's unclear whether subagent hooks should create separate session records or be folded into the parent session. Needs design decision during planning.

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Vercel AI SDK LM Studio Provider](https://ai-sdk.dev/providers/openai-compatible-providers/lmstudio)
- [@ai-sdk/openai-compatible npm](https://www.npmjs.com/package/@ai-sdk/openai-compatible)
- [LM Studio OpenAI Compatibility](https://lmstudio.ai/docs/developer/openai-compat)
- [Aider Git Integration](https://aider.chat/docs/git.html)
- [Aider Options Reference](https://aider.chat/docs/config/options.html)
- [Qwen3-Coder-30B on LM Studio](https://lmstudio.ai/models/qwen/qwen3-coder-30b)
- [Claude Code CLAUDE_SESSION_ID](https://github.com/anthropics/claude-code/issues/25642)
- [Claude Code Concurrent Sessions](https://github.com/anthropics/claude-code/issues/27311)
- [Claude Code Git Attribution](https://github.com/anthropics/claude-code/issues/5458)

---
*Researched: 2026-03-15*
