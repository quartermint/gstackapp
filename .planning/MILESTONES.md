# Milestones

## v2.0 Intelligence Engine (Shipped: 2026-03-23)

**Phases completed:** 7 phases, 25 plans, 53 tasks

**Key accomplishments:**

- sqlite-vec vector infrastructure with hybrid BM25+vector search via Reciprocal Rank Fusion, content-addressable embedding storage, and CLAUDE.md unified search indexing
- RRF fusion algorithm with k=60 weighted scoring and LM Studio query expansion replacing Gemini, producing typed lex/vec variants for hybrid search pipeline
- Cross-encoder reranking with position-aware blending, context annotations, and knowledge content in unified search pipeline
- Few-shot AI categorizer with user-correctable examples, 5-type multi-pass extraction with deterministic grounding, LM Studio fallback, and correction-rate calibration
- ExtractionBadges component with 4-color type badges, GroundedText inline highlighter with exact/fuzzy tier styling, prompt-validator startup service
- Capacities ZIP import with content-hash dedup and tweet URL resolution via Crawl4AI with OG scraper fallback
- Passive iMessage chat.db polling with Apple timestamp conversion, attributedBody extraction, and config-driven enable/disable toggle
- Solutions + solution_references tables with CRUD API, Zod validation, compound score calculation, and 22 passing tests
- Session significance heuristic with 5-gate filter, DB-backed signal builder, content/title formatters, and LM Studio metadata enrichment with graceful degradation
- End-to-end solution extraction wired into session hooks, FTS5 search indexing on acceptance, knowledge digest learnings, and MCP cross-project search with solutions
- Compound score widget with reuse rate sparkline and solution candidate review cards with accept/edit/dismiss actions, SSE-reactive
- Intelligence cache with TTL expiration, generation lock, and model-tier-aware adaptive context budgets for all downstream LLM generators
- TV-recap style narrative generator via LM Studio with Zod-constrained output, cache-first API serving, and hero card integration showing AI "Previously on..." panel
- Routing advisor with historical tier-vs-outcome analysis, rule-based fallback, and daily digest generator with 6am cron schedule via node-cron
- Tool calling via z.discriminatedUnion with 4 MC tools, daemon orchestrator tying together narrative/digest/cache lifecycle, and daily digest dashboard panel with priority-ordered sections
- Extended capture API with optional deviceClassification payload; high-confidence (>0.8) device hints skip server-side AI categorization while low-confidence/missing hints fall through to existing enrichment
- CaptureClassifierProtocol with NoOp fallback, @Generable classification struct (iOS 26+), DeviceContext helper, QueuedCapture + API model extensions, and full test mocks
- On-device capture classification with Foundation Models constrained decoding, pre-sync enrichment pipeline, and context window management with summarization fallback
- Insights table with content-hash dedup, CRUD queries, and 3 API endpoints for proactive intelligence dismiss/snooze lifecycle
- 4 rule-based pattern detectors (stale captures, activity gaps, session patterns, cross-project term overlap) wired into daemon on 30min schedule with content-hash dedup
- Evolved What's New strip into intelligence strip with morning digest view, insight badges, and optimistic dismiss/snooze via useInsights hook
- InsightCard with type-colored accents, metadata pills, dismiss/snooze actions, expandable badges, and stale capture triage bridge to TriageView
- Config-driven user registry with Tailscale identity resolution and 'bella' capture source type for multi-user attribution
- AI SDK streamText endpoint with 7 MC data tools, system prompt enforcing grounded responses, zodSchema for v6 compatibility

---

## v1.4 Cross-Project Intelligence + iOS Companion + Knowledge Unification (Shipped: 2026-03-23)

**Phases completed:** 9 phases, 19 plans, 37 tasks

**Key accomplishments:**

- dependsOn dependency declarations with DFS cycle detection on both config schemas, plus 3 new health check types for cross-project intelligence
- Server-side Idempotency-Key header support on POST /api/captures with Drizzle schema, migration, and TDD tests
- project_knowledge table, query module, shared Zod schemas, and GET /api/knowledge endpoints with linear-decay staleness scoring
- Knowledge aggregator service scanning CLAUDE.md from local/SSH projects with SHA-256 content-hash caching, stale detection, and independent hourly timer
- Pure function dependency drift detection with severity escalation (info->warning->critical), integrated into post-scan health phase as Stage 3.5, with dependsOn in API response and action hints for risk cards
- DependencyBadges component with neutral pill badges on project cards, collapsing to "+N more" after 3 dependencies
- Config-driven convention scanner with 5 launch rules detecting anti-patterns in CLAUDE.md files across 33 projects
- 3 MCP tools (project_knowledge, convention_check, cross_project_search) wrapping Phase 24-26 data via knowledge search API endpoint with case-insensitive LIKE and snippet extraction
- Knowledge digest API endpoint with SessionStart hook enriching Claude Code banner with related projects, convention violations, and stale knowledge flags
- Server-side visit tracking with timestamp rotation via Drizzle ON CONFLICT DO UPDATE for multi-client change detection
- Frontend highlight mode with indigo accent borders on changed projects, changed-first sorting, click-to-clear, and "N changed" badge in WhatsNewStrip
- XcodeGen project with SwiftData offline queue, protocol-based API client matching MC Zod schemas, and shared App Group infrastructure
- Share extension with text/URL extraction and project picker, plus SyncEngine with idempotent retry logic and offline-first capture flow
- Native SwiftUI dashboard with Active/Idle/Stale project grouping, health dots, capture counts, pull-to-refresh, offline indicators, and NWPathMonitor-based Tailscale connectivity detection
- Foreground sync via scenePhase, LocationService for city metadata, IOS-13 enrichment fix preserving user projectId, and captureCount in projects API
- WidgetKit capture widget with AppIntent button launching QuickCaptureView for 3-tap capture flow (tap widget, type/dictate, send)
- Voice recording with AVAudioRecorder metering, live waveform visualization, and SFSpeechRecognizer transcription with 55-second chunking for unlimited-duration capture
- Pure buildGraphData and getHighlightChain functions with BFS bidirectional traversal, dangling-ref filtering, and cycle safety -- 16 tests
- Interactive force-directed dependency graph with d3-force, lazy-loaded via React.lazy into a separate 21KB chunk with hover tooltips, click-to-highlight chains, drag pinning, and zoom/pan

---

## v1.3 Auto-Discovery + Session Enrichment + CLI (Shipped: 2026-03-17)

**Phases completed:** 7 phases, 19 plans | **Timeline:** 2 days | **Execution time:** 115min

**Delivered:** Auto-discovery engine (local + SSH + GitHub orgs), GitHub star intelligence with AI categorization, session enrichment with convergence detection, discoveries/stars/session-timeline dashboard components, and a standalone CLI client with offline queue.

**Key accomplishments:**

- Auto-discovery engine scanning local filesystem, SSH hosts, and GitHub orgs with cross-host dedup via normalized remote URLs
- GitHub star intelligence with sync, AI categorization (intent: reference/tool/try/inspiration), and star-to-project linking via copies table
- Session enrichment with pairwise convergence detection across parallel sessions, persisted as health findings
- Dashboard: WhatsNewStrip for discoveries/stars, session timeline sidebar with hour-axis swimlane bars, star intent cycling badges
- CLI client (`mc`) with capture, status, projects commands, offline queue with automatic drain, and project auto-detection from CWD

**Tests:** 610 passing (472 API + 76 web + 28 MCP + 34 CLI) across 64 test files
**Requirements:** 32/32 satisfied, 0 gaps

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
