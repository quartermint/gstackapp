# Milestones

## v1.3 Auto-Discovery + Session Enrichment + CLI (Shipped: 2026-03-17)

**Phases completed:** 7 phases, 19 plans, 0 tasks

**Key accomplishments:**
- (none recorded)

---

## v1.2 Session Orchestrator + Local LLM Gateway (Shipped: 2026-03-16)

**Phases completed:** 5 phases, 12 plans | **Timeline:** 1 day | **LOC:** ~7,000 new TypeScript (+32K total)

**Delivered:** Session orchestration layer transforming MC from passive project dashboard to active coding session awareness platform — tracking Claude Code and Aider sessions, detecting file-level conflicts in real-time, monitoring LM Studio health, providing budget burn rate awareness, and surfacing everything through SSE-driven dashboard components.

**Key accomplishments:**
- Session lifecycle tracking via Claude Code HTTP hooks (SessionStart, PostToolUse Write/Edit, Stop) with CWD-based project resolution, 10s heartbeat debounce with file buffering, and 15-minute stale session reaping
- LM Studio health gateway with three-state probe (unavailable/loading/ready) for Qwen3-Coder-30B, weekly budget tracking by model tier (opus/sonnet/local), keyword-based tier routing suggestions
- File-level conflict detection across parallel sessions on same project, persisted as health findings in risk feed, with SSE real-time alerts and auto-resolution on session end
- Aider passive detection via git commit author attribution during project scan cycle — zero UX friction
- Dashboard session awareness: header sessions indicator with dropdown panel, budget widget with sage/gold/rust burn rate colors, conflict alert cards with "sessions" badge, session count badges on project cards — all SSE-driven without polling
- Infrastructure scripts for Mac Mini deployment following /opt/services/ conventions

**Tech debt:** 4 items (Nyquist sign-off pending on all 5 phases, SESS-04 git remote fallback deferred, LM Studio model ID partial matching, 4 human verification items pending)
**Tests:** 462 passing (374 API + 68 web + 20 MCP) across 45+ test files
**Requirements:** 28/28 satisfied, 0 gaps

---

## v1.1 Git Health Intelligence + MCP (Shipped: 2026-03-15)

**Phases completed:** 5 phases, 12 plans | **Timeline:** 1 day | **LOC:** 25,426 TypeScript/CSS (+13,305 from v1.0)

**Delivered:** Git health intelligence engine with 7 remote-aware checks, multi-host copy divergence detection, risk-based dashboard feed, sprint timeline visualization, and MCP server replacing portfolio-dashboard — surfacing sync health across 35+ projects on MacBook and Mac Mini.

**Key accomplishments:**
- Git health engine with 7 check types (unpushed, no remote, broken tracking, remote gone, unpulled, dirty age, diverged copies) running as post-scan phase with correct `detectedAt` preservation
- Multi-host copy discovery auto-matching repos across MacBook + Mac Mini by normalized remote URL, with ancestry-based divergence detection and stale SSH graceful degradation
- Dashboard risk feed with compact single-line severity cards, warm palette (deep rust/gold/sage), copy-to-clipboard git commands, and non-dismissable cards that resolve automatically
- Sprint timeline replacing heatmap — horizontal swimlane bars (8px thin), top 10 by activity, focused project highlighting, 12-week window with 3-day gap segmentation
- Health dots (green/amber/red with split-dot for diverged copies) on project cards with expandable inline findings panel
- `@mission-control/mcp` package with 4 tools (project_health, project_risks, project_detail, sync_status) and session startup hook surfacing critical risks

**Tech debt:** 0 items (3 bugs found and fixed during milestone audit)
**Tests:** 356 passing (268 API + 68 web + 20 MCP) across 38 test files

---

## v1.0 Mission Control MVP (Shipped: 2026-03-10)

**Phases completed:** 5 phases, 15 plans | **Timeline:** 37 days | **LOC:** 12,121 TypeScript/CSS

**Delivered:** API-first personal operating environment with real-time dashboard, AI-powered capture pipeline, natural language search, and ambient system health monitoring — running on Mac Mini behind Tailscale.

**Key accomplishments:**
- Hono API server with SQLite + FTS5 full-text search, project scanner aggregating git data from local repos
- Departure board dashboard with warm Arc-browser visual identity, hero card, responsive layout, dark mode
- Zero-friction capture pipeline with AI categorization (Gemini), link metadata extraction, stale triage
- Command palette (Cmd+K) with capture, navigation, and AI-powered natural language search modes
- Sprint heatmap (GitHub-style contribution grid), "Previously on..." breadcrumbs, stale project nudges
- SSE real-time updates, Mac Mini health pulse with service monitoring, typed Hono RPC client

**Tech debt:** 0 items (5 items identified in audit, all closed in quick task before archival)

---

