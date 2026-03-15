# Feature Research

**Domain:** Personal Coding Session Orchestrator + Local LLM Gateway
**Researched:** 2026-03-15
**Confidence:** MEDIUM (novel domain -- no direct competitor exists for personal session orchestration; features synthesized from multi-agent tooling, Claude Code hooks API, and LM Studio docs)

## Feature Landscape

### Table Stakes (Users Expect These)

Features that make the session orchestrator feel functional. Missing any of these and it's just a log viewer, not an orchestrator.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Session heartbeat ingestion | Without real-time session tracking, there's nothing to orchestrate. Sessions must report in and MC must store them. | MEDIUM | Claude Code HTTP hooks POST to MC API. Aider needs a wrapper script. Both report: session_id, project, model, cwd, status, files touched. |
| Active sessions dashboard panel | If you can't see what's running, the orchestrator adds zero value. This is the minimum viable "smarter in 3 seconds" for sessions. | MEDIUM | New dashboard section showing live sessions. Tiles per session: project name, model tier badge, elapsed time, last activity. SSE-driven updates. |
| Session lifecycle tracking (start/stop/heartbeat) | Users expect to know when sessions started, what they did, and when they ended -- not just a point-in-time snapshot. | LOW | Three API endpoints: POST /sessions/start, POST /sessions/:id/heartbeat, POST /sessions/:id/stop. SQLite table with status enum. |
| Model tier labels on sessions | If the orchestrator can't tell you which model is handling what, it's not doing its job. Every session must show its tier. | LOW | Derive tier from model string: opus -> Opus, sonnet -> Sonnet, local/* -> Local. Badge color coding on dashboard. |
| Session history with project grouping | Past sessions are as valuable as active ones -- "what happened while I was away" extends to sessions, not just commits. | LOW | GET /sessions with filters by project, status, date range. History view in dashboard with grouping by project. |
| Budget usage summary | The whole point of the tier router is cost awareness. If you can't see budget status at a glance, the routing is invisible. | MEDIUM | Weekly budget display: sessions by tier, estimated cost (Opus ~$6-12/day, Sonnet ~$2-4/day, Local = $0). Reset weekly. Heuristic-based since Claude doesn't expose per-session tokens to hooks. |

### Differentiators (Competitive Advantage)

Features that make MC's session orchestrator genuinely unique. No existing tool combines these in a personal context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| File-level conflict detection across sessions | Know BEFORE you merge that two sessions touched the same files. Prevents the "two agents edited the same function" disaster. | HIGH | Track files_touched per heartbeat. Cross-reference active sessions on same project. Emit SSE alert when overlap detected. Challenge: file-level is tractable, function-level is not worth the complexity. |
| Tier routing recommendations | MC suggests which model to use based on task description and budget state. "You've burned 54% of your weekly Opus budget by Saturday -- consider Sonnet or Local for this refactor." | MEDIUM | Rule-based engine, not AI. Inputs: task complexity keywords, weekly budget burn rate, project complexity. Output: suggested tier with rationale. |
| Convergence detection via git activity | Watch multiple sessions on the same project and flag when their branches/changes are ready to merge -- "Session A and Session B both completed on mission-control, review for merge." | HIGH | Monitor git state per session (branch, commit count, dirty files). Detect when multiple sessions on same project both reach "stopped" status with commits. Surface as a convergence card on dashboard. |
| Session-to-project relationship enrichment | Sessions automatically link to MC projects, enriching the departure board. Project cards show "2 active sessions" badge, and clicking reveals session details. | MEDIUM | Foreign key session.projectSlug -> projects. Departure board cards get session indicator. Hero card shows active session context when expanded. |
| Local model health monitoring | MC already monitors Mac Mini services. Extend to show LM Studio status, loaded model, VRAM usage, inference speed -- critical for knowing if Local tier is actually available. | LOW | Poll LM Studio API GET /api/v0/models and GET /api/v0/system on Mac Mini (:1234). Surface in health panel alongside existing service monitoring. |
| Cross-tool session unification | Claude Code and Aider sessions appear in the same feed with the same schema. No separate dashboards for different tools. | MEDIUM | Unified session schema. Tool-specific adapters (Claude Code HTTP hook, Aider wrapper script) normalize to common format. Dashboard treats all sessions identically. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-spawning sessions from MC | "MC should launch Claude Code on the right project with the right model" | MC is awareness, not action. Auto-spawning terminals is fragile, OS-dependent, and crosses the observe/act boundary that keeps MC simple. | Surface routing recommendations. User opens terminal and starts session themselves. |
| Token-level usage tracking per session | "Show me exactly how many tokens each session consumed" | Claude Code hooks don't expose token counts. Transcript JSONL parsing is fragile and version-dependent. Building a token counter from transcripts would break on every CC update. | Session-count + tier heuristics. "3 Opus sessions today ~ $18-36 estimated." Use ccusage CLI for detailed token analysis when needed. |
| AI-powered task classification for routing | "Use AI to analyze the task description and auto-route to the right model" | Adds latency, cost, and complexity to session start. A rule-based keyword matcher is sufficient for personal use and is instant. | Keyword/pattern matching: "architecture", "design", "complex" -> Opus. "test", "fix", "refactor" -> Sonnet. "scaffold", "boilerplate" -> Local. |
| Real-time file diff tracking | "Show me exactly what each session is changing in real-time" | Requires filesystem watchers, massive data volume, and conflicts with how git tracks changes. Claude Code PostToolUse hooks for Write/Edit would generate enormous traffic. | File-level tracking from heartbeats (list of files touched), not content-level. Git diff at convergence time. |
| Aider auto-configuration | "MC should install Aider and set up Qwen3-Coder for me" | Aider install, Python env management, and model verification are system admin tasks, not orchestration features. Mixing them creates a brittle bootstrap. | Prerequisites documented. MC assumes Aider + Qwen3-Coder are available when Local tier is selected. Health check verifies. |
| Session chat/messaging between agents | "Let sessions communicate with each other through MC" | Massive complexity. Inter-agent communication is an unsolved research problem. MC observes sessions, it doesn't mediate them. | Convergence detection flags when sessions should be manually coordinated. User is the coordinator. |
| Full transcript storage in MC | "Store every Claude Code transcript in MC's database" | Transcripts are 10-100MB JSONL files per session. Storing them in SQLite would bloat the database and duplicate data already stored by Claude Code. | Store session metadata only (id, project, model, files, timestamps). Link to transcript_path for deep inspection when needed. |
| Automatic model switching mid-session | "If budget is running low, switch the session to a cheaper model" | Claude Code sessions can't switch models mid-conversation. Aider can, but forcing a switch would disrupt the user's workflow. | Surface budget warnings as dashboard alerts. User decides when to switch. Next session gets the routing recommendation. |

## Feature Dependencies

```
[Session Heartbeat Ingestion]
    |-- requires --> [Session Lifecycle API]
    |                   |-- requires --> [Sessions Table Schema]
    |
    |-- enables --> [Active Sessions Dashboard]
    |                   |-- requires --> [SSE Session Events]
    |                   |-- enhances --> [Departure Board Project Cards]
    |
    |-- enables --> [File Conflict Detection]
    |                   |-- requires --> [files_touched in heartbeats]
    |                   |-- requires --> [Active Sessions Dashboard]
    |
    |-- enables --> [Convergence Detection]
                        |-- requires --> [Session History]
                        |-- requires --> [Git state per session]

[Budget Tracker]
    |-- requires --> [Session History with model tiers]
    |-- enables --> [Tier Routing Recommendations]
    |                   |-- enhances --> [SessionStart hook banner]

[Local Model Health]
    |-- requires --> [LM Studio API access on Mac Mini :1234]
    |-- enhances --> [Health Panel]
    |-- enhances --> [Tier Routing] (if Local unavailable, don't recommend it)

[Claude Code HTTP Hook] -- enables --> [Session Heartbeat Ingestion]
[Aider Wrapper Script] -- enables --> [Session Heartbeat Ingestion]
```

### Dependency Notes

- **Session Heartbeat Ingestion requires Session Lifecycle API:** Can't ingest data without endpoints to receive it. API schema comes first.
- **File Conflict Detection requires files_touched in heartbeats:** Conflict detection is only possible if sessions report which files they're working on. Claude Code PostToolUse hooks for Write/Edit/Read provide this.
- **Tier Routing requires Budget Tracker:** Can't recommend shifting to Local if you don't know the current burn rate. Budget data drives routing suggestions.
- **Convergence Detection requires Session History + Git state:** Must know when sessions start/stop and what git state they left behind. Both data sources needed.
- **Local Model Health enhances Tier Routing:** If LM Studio is down or no model is loaded, the router shouldn't recommend Local tier. Health check feeds into routing logic.
- **Active Sessions Dashboard enhances Departure Board:** Session counts and status badges on existing project cards create cross-feature value without a separate UI section.

## MVP Definition

### Launch With (v1.2 Core)

The minimum to validate "MC as session orchestrator" -- can you see what's running and what it costs?

- [x] **Sessions table schema** -- id, sessionId (external), projectSlug, tool (claude-code/aider), model, modelTier, status, cwd, startedAt, lastHeartbeatAt, stoppedAt, filesJson, taskDescription, metadata
- [x] **Session lifecycle API** -- POST /sessions/start, POST /sessions/:id/heartbeat (with files_touched), POST /sessions/:id/stop. Stale session reaper (no heartbeat for 10 min -> mark stopped).
- [x] **Claude Code HTTP hook adapter** -- HTTP hook on SessionStart, PostToolUse (Write/Edit), and Stop events. POST to MC API with normalized session data. Must be lightweight (~50ms).
- [x] **Active sessions dashboard panel** -- Live feed of running sessions. Per-session tile: project name, tool icon, model tier badge, elapsed time, last activity timestamp. SSE-driven.
- [x] **Budget usage summary** -- Weekly view: session count by tier, estimated cost range, burn rate indicator. Visible in dashboard header or sidebar.
- [x] **Model tier derivation** -- Parse model string from hooks to determine tier: opus -> Opus ($$$), sonnet -> Sonnet ($$), anything else -> Local ($0).

### Add After Validation (v1.2 Extended)

Features to add once core session tracking is working and proving useful.

- [ ] **File-level conflict detection** -- Cross-reference files_touched across active sessions on the same project. SSE alert when overlap detected. Trigger: first time two sessions both report writing to the same file path.
- [ ] **Tier routing recommendations** -- Banner in Claude Code SessionStart hook: "Budget at 67% for the week. Consider Sonnet for this task." Rule-based engine with weekly reset.
- [ ] **Session-to-project enrichment** -- Departure board cards show "2 active" badge. Hero card shows session context. Requires project slug matching from cwd.
- [ ] **Aider wrapper script** -- Shell wrapper around `aider` that reports start/heartbeat/stop to MC API. Polls Aider process, reports model from config.
- [ ] **Local model health in health panel** -- Poll LM Studio GET /api/v0/models on Mac Mini. Show loaded model, status in existing health panel dropdown.

### Future Consideration (v1.3+)

Features to defer until session orchestration is proven valuable daily.

- [ ] **Convergence detection** -- Monitor git state across sessions, flag merge opportunities. Defer because: requires significant git analysis logic and the user currently coordinates manually.
- [ ] **Session replay/timeline** -- Visual timeline of session activity (like sprint timeline but for individual sessions). Defer because: requires substantial UI work for unclear daily value.
- [ ] **Cross-machine session tracking** -- Track sessions on Mac Mini (SSH-based Aider). Defer because: adds network complexity, Mac Mini sessions are less common.
- [ ] **MCP session tools** -- Expose session data via MCP so Claude Code can query "what other sessions are running on this project?" Defer because: chicken-and-egg -- sessions need to exist first.
- [ ] **Smart routing with learning** -- Track which tier produced better outcomes per task type and adjust recommendations. Defer because: needs months of session data to be meaningful.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Session lifecycle API + schema | HIGH | LOW | P1 |
| Claude Code HTTP hook adapter | HIGH | LOW | P1 |
| Active sessions dashboard panel | HIGH | MEDIUM | P1 |
| Model tier derivation | HIGH | LOW | P1 |
| Budget usage summary | HIGH | MEDIUM | P1 |
| Session-to-project enrichment | MEDIUM | MEDIUM | P2 |
| File-level conflict detection | MEDIUM | HIGH | P2 |
| Tier routing recommendations | MEDIUM | MEDIUM | P2 |
| Aider wrapper script | MEDIUM | LOW | P2 |
| Local model health monitoring | MEDIUM | LOW | P2 |
| Convergence detection | LOW | HIGH | P3 |
| Session replay/timeline | LOW | HIGH | P3 |
| MCP session tools | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch -- validates "MC sees my sessions"
- P2: Should have, adds the "orchestration" in session orchestrator
- P3: Nice to have, future enrichment once sessions are a proven daily habit

## Competitor/Reference Feature Analysis

No direct competitor exists for "personal coding session orchestrator." The closest references are:

| Feature | disler/claude-code-hooks-multi-agent-observability | Clash (git worktree conflict tool) | ccusage (token analysis) | Our Approach |
|---------|---------------------------------------------------|-----------------------------------|--------------------------|--------------|
| Session tracking | Yes -- captures 12 hook events, stores in SQLite, WebSocket broadcast | No -- git-level only | Yes -- parses JSONL transcripts post-hoc | Real-time HTTP hooks to MC API. Unified schema for Claude Code + Aider. |
| Conflict detection | No | Yes -- pre-execution file overlap analysis across worktrees | No | Post-heartbeat cross-reference of files_touched across active sessions. Alert, don't block. |
| Budget/cost tracking | No | No | Yes -- daily/weekly token breakdown from transcripts | Heuristic-based from session count + tier. Not token-exact. Faster, no JSONL parsing. |
| Model routing | No | No | No | Rule-based tier recommendations using budget burn rate + task keywords. |
| Dashboard UI | Yes -- Vue 3 real-time event timeline | No (CLI only) | No (CLI only) | Integrated into existing MC React dashboard. Not a separate tool. |
| Multi-tool support | No (Claude Code only) | No (git-level, tool-agnostic) | No (Claude Code only) | Unified schema for Claude Code + Aider. Aider via wrapper script. |
| Project integration | No (standalone) | No (standalone) | Partial (groups by project dir) | Deep integration with MC project registry, departure board, hero cards. |

**Key insight:** Every existing tool is standalone. MC's advantage is being the hub -- sessions are another data stream alongside captures, commits, health checks, and risks. The value is the unified view, not any single feature.

## Infrastructure Dependencies (Existing MC Systems)

| Existing System | How Sessions Feature Uses It |
|-----------------|------------------------------|
| Event bus (event-bus.ts) | New event types: session:started, session:heartbeat, session:stopped, session:conflict |
| SSE events (events.ts) | Stream session events to dashboard for real-time updates |
| Health monitor (health-monitor.ts) | Extend to poll LM Studio API for local model status |
| Project scanner (project-scanner.ts) | Match session cwd to tracked project slug |
| Drizzle schema (schema.ts) | New sessions table, session_events table |
| Dashboard layout | New "Sessions" section between capture and departure board |
| Hono RPC client | New route group for session endpoints, type chain extension |
| MCP server | Future: expose session_status and session_conflicts tools |

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- HIGH confidence, official docs. 24 hook events, HTTP hook type, full JSON schemas for all events.
- [Claude Code Cost Management](https://code.claude.com/docs/en/costs) -- HIGH confidence, official docs. /cost, /stats, /context commands. No per-session token export via hooks.
- [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) -- MEDIUM confidence, reference implementation. Three-tier architecture for hook event capture.
- [ccusage](https://ccusage.com/) -- MEDIUM confidence, community tool. Post-hoc JSONL analysis for token usage tracking.
- [LM Studio Server Docs](https://lmstudio.ai/docs/developer/core/server) -- HIGH confidence, official docs. OpenAI-compatible API, model management endpoints, JIT loading.
- [Clash - Git Worktree Conflict Detection](https://github.com/clash-sh/clash) -- MEDIUM confidence, reference tool. Pre-execution overlap analysis pattern.
- [Aider OpenAI-Compatible API Docs](https://aider.chat/docs/llms/openai-compat.html) -- HIGH confidence, official docs. OPENAI_API_BASE + OPENAI_API_KEY config for LM Studio integration.
- [Qwen3-Coder-30B on LM Studio](https://lmstudio.ai/models/qwen/qwen3-coder-30b) -- MEDIUM confidence. MoE architecture (30B params, 3.3B active), ~45-100 tok/s on Apple Silicon.
- [AI Coding Agents Orchestration (Mike Mason)](https://mikemason.ca/writing/ai-coding-agents-jan-2026/) -- MEDIUM confidence, industry analysis. Coherence through orchestration, not autonomy.
- [Claude Code HTTP Hooks Announcement](https://algoinsights.medium.com/claude-code-just-got-http-hooks-heres-why-that-changes-everything-6938ffaae1f6) -- MEDIUM confidence. HTTP hooks send POST JSON to URL, receive JSON response.

---
*Feature research for: Session Orchestrator + Local LLM Gateway*
*Researched: 2026-03-15*
