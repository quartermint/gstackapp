# Mission Control

## What This Is

Mission Control is a personal intelligence daemon — an API-first platform that aggregates project data, captures raw thoughts with AI categorization, performs semantic search with local embeddings, compounds knowledge from development sessions, and proactively surfaces insights. It monitors git health and remote sync across 35+ projects on MacBook and Mac Mini, classifies captures on-device via Apple Foundation Models, and exposes everything via MCP for Claude Code integration. It runs on a Mac Mini behind Tailscale and serves as the daily home screen: the first thing opened every morning.

The Hono API and SQLite data layer are the core product — a shared infrastructure. The React dashboard, MCP server, CLI, iOS companion, and Bella's chat client are five clients built on the same API. The platform supports multiple users via config-driven identity resolution.

## Core Value

**Every time you open Mission Control, you're smarter than you were 3 seconds ago.** Instant value — you see what changed, what you captured, what you forgot, and what finished while you were away. No warm-up, no navigation, no obligation.

## Requirements

### Validated

- ✓ Hono API server with SQLite + Drizzle ORM + FTS5 search on Mac Mini behind Tailscale — v1.0
- ✓ Departure board dashboard with project rows grouped by Active/Idle/Stale — v1.0
- ✓ Hero card with last 3-5 commits, GSD state, and "last context" narrative — v1.0
- ✓ Arc browser visual identity: warm, opinionated, distinctive — v1.0
- ✓ Zero-friction capture field with AI categorization (Gemini) and confidence scores — v1.0
- ✓ Captures woven into project cards, not a separate inbox — v1.0
- ✓ AI triage for stale captures (act/archive/dismiss) — v1.0
- ✓ Command palette (Cmd+K) with capture, navigation, and search modes — v1.0
- ✓ Keyboard shortcuts for power actions — v1.0
- ✓ Full-text + AI-powered natural language search across captures, projects, commits — v1.0
- ✓ Sprint heatmap with GitHub-style contribution grid — v1.0
- ✓ "Previously on..." expandable commit breadcrumbs — v1.0
- ✓ Stale project nudges (2+ weeks idle with dirty files) — v1.0
- ✓ Mac Mini health pulse with service monitoring — v1.0
- ✓ SSE real-time updates without page refresh — v1.0
- ✓ Responsive mobile layout — v1.0
- ✓ API-first with no server-rendered shortcuts — v1.0
- ✓ Typed Hono RPC client for all frontend-to-API communication — v1.0
- ✓ Git health engine with 7 remote-aware checks and risk scoring per project — v1.1
- ✓ Multi-host copy discovery with auto-matching by remote URL and divergence detection — v1.1
- ✓ Dashboard risk feed with severity-grouped non-dismissable cards — v1.1
- ✓ Sprint timeline replacing heatmap with horizontal swimlane bars — v1.1
- ✓ Health dots (green/amber/red/split) on project cards with expandable findings — v1.1
- ✓ MCP server with 4 tools (project_health, project_risks, project_detail, sync_status) — v1.1
- ✓ Session startup hook surfacing critical risks in Claude Code banner — v1.1
- ✓ Portfolio-dashboard deprecated and replaced by MC MCP — v1.1
- ✓ Claude Code session lifecycle tracking via HTTP hooks with project resolution — v1.2
- ✓ Session reaper (15-minute stale detection) and Aider passive detection via git log — v1.2
- ✓ LM Studio three-state health probe (Qwen3-Coder-30B) with budget tracking by model tier — v1.2
- ✓ File-level conflict detection across parallel sessions with real-time SSE alerts — v1.2
- ✓ Dashboard session awareness: sessions panel, budget widget, conflict cards, session badges — v1.2
- ✓ Tier routing recommendations (keyword-based, rule-only, never auto-restricts) — v1.2
- ✓ Infrastructure deployment scripts for Mac Mini (/opt/services/ conventions) — v1.2
- ✓ Auto-discovery engine with depth-1 filesystem walk, SSH Mac Mini scanning, GitHub org listing — v1.3
- ✓ Cross-host dedup matching discoveries by normalized remote URL — v1.3
- ✓ Discovery track/dismiss actions with atomic mc.config.json writes — v1.3
- ✓ GitHub star sync with AI intent categorization (reference/tool/try/inspiration) via Gemini — v1.3
- ✓ Star-to-project linking via remote URL matching — v1.3
- ✓ "What's New" top strip with discovery/star badges and popovers — v1.3
- ✓ Star browser with intent grouping, search, and filter in popover — v1.3
- ✓ Session convergence detection (file overlap + temporal proximity + commits) — v1.3
- ✓ Convergence badge on project cards (passive, not alerts) — v1.3
- ✓ MCP session_status and session_conflicts tools — v1.3
- ✓ Session timeline sidebar with horizontal bars by time-of-day — v1.3
- ✓ CLI client: mc capture, mc status, mc projects, mc init — v1.3
- ✓ CLI offline queue with auto-flush — v1.3
- ✓ CLI piped input and explicit project assignment — v1.3
- ✓ Cross-project dependency declarations with cycle detection and drift alerts — v1.4
- ✓ iOS companion: share sheet, widget capture, voice recording, native SwiftUI dashboard — v1.4
- ✓ Knowledge aggregation: CLAUDE.md from all projects, convention enforcement, MCP knowledge tools — v1.4
- ✓ Changes-since-last-visit highlight mode — v1.4
- ✓ Force-directed project relationship graph (d3-force, lazy-loaded) — v1.4
- ✓ Hybrid search: sqlite-vec vectors + BM25 + RRF fusion + cross-encoder reranking — v2.0
- ✓ Capture intelligence: few-shot AI with corrections, multi-pass extraction + grounding — v2.0
- ✓ Ambient capture: Capacities import, iMessage monitoring, tweet content fetch — v2.0
- ✓ Knowledge compounding: solutions registry from Claude Code sessions, compound score — v2.0
- ✓ Active intelligence daemon: narratives, digests, routing, tool calling via local LLM — v2.0
- ✓ iOS edge intelligence: Apple Foundation Models on-device classification — v2.0
- ✓ Proactive insights: morning digest, stale capture triage, activity/cross-project patterns — v2.0
- ✓ Bella client: chat-first "Ryan interpreter" with 7 MC data tools + API explorer — v2.0

### Active

(No active milestone — v2.0 shipped, next milestone TBD via `/gsd:new-milestone`)

**Candidates for next milestone:**
- Runtime convention enforcement (intercepting Claude Code tool calls)
- Automated reconciliation actions (one-click push/pull from dashboard)
- iOS background sync, push notifications
- Session convergence merge preview (git merge-base analysis)
- Voice capture upgrade to SpeechAnalyzer (iOS 26)
- Screenshot OCR capture via Vision framework

### Out of Scope

- **Communications / messaging** — QMspace handles comms. MC gets a lightweight chat plugin eventually.
- **Email triage** — msgvault handles email. Future plugin territory, not core MC.
- **Full task management / Kanban** — MC is awareness + capture, not project management. Every previous task system became a graveyard.
- **Operations / command execution** — Foundation supports it but MC is awareness + capture, not action.
- **Multi-user auth** — Single user for now. Trust-based access via Tailscale boundary.
- **Rich text editor / documents** — MC captures, it doesn't write. Link out to proper editors.
- **Notification push alerts** — Notification fatigue kills adoption. Dashboard is pull-based by design.
- **Principal's Ear integration** — PE has its own commercial trajectory. Shared capture DNA, not code.
- **Auto-fix actions from dashboard** — MC surfaces problems, you fix them in terminal. Awareness not action.
- **Auto-promote without confirmation** — Always human-in-the-loop. MC surfaces, you decide.
- **iOS screenshot capture with OCR** — Capture intent detection and OCR deferred. Share sheet and voice capture are in v1.4 scope.
- **Auto-spawning sessions** — MC observes and routes, it doesn't launch terminals or create sessions.
- **Token-level usage tracking** — Claude doesn't expose per-session token counts. Budget tracking uses session count + tier heuristics.
- **Aider auto-configuration** — Aider install and Qwen3-Coder-30B verification are prerequisites, not MC features.
- **Dollar cost estimates** — No real billing data available. Budget uses session count + tier heuristics only.
- **Function-level conflict detection** — File-level is sufficient for v1.2. AST-level analysis adds complexity without proportional value.

## Context

**Current State (v2.0 shipped 2026-03-23):**
- ~70,000 lines TypeScript/CSS across 5 packages (api, web, shared, mcp, cli) + iOS companion (sibling repo)
- Tech stack: Hono 4.x, better-sqlite3 + Drizzle ORM + sqlite-vec, React 19 + Vite 6, Tailwind v4, AI SDK, MCP SDK 1.27, Commander.js
- 1,115 tests passing (929 API, 113 web, 39 MCP, 34 CLI), TypeScript strict mode
- Hybrid search: sqlite-vec vectors + BM25 FTS5 + RRF fusion + LM Studio query expansion + cross-encoder reranking
- Capture intelligence: few-shot AI categorization with user corrections, 5-type multi-pass extraction with grounding, Capacities import, iMessage monitoring
- Knowledge compounding: solutions registry auto-populated from session hooks, compound score dashboard, cross-project search via MCP
- Intelligence daemon: "Previously on..." narratives, daily digest (6am cron), routing advisor, tool calling via LM Studio
- iOS edge: Apple Foundation Models on-device classification, offline capture enrichment, high-confidence skip (>0.8)
- Proactive insights: 4 pattern detectors (stale captures, activity gaps, session patterns, cross-project overlap), intelligence strip with morning digest
- Bella client: chat-first interface with 7 MC data tools, API explorer, multi-user identity resolution via Tailscale
- Mac Mini hosted behind Tailscale, API on :3000, LM Studio on :1234
- MCP server with 9 tools (project_health, project_risks, project_detail, sync_status, session_status, session_conflicts, project_knowledge, convention_check, cross_project_search)

**Origin:** Emerged from a brainstorming session while building a portfolio-dashboard MCP server. The dashboard concept expanded into a full personal operating environment when the user declared: "I want to build my last new environment."

**Design philosophy:** "Last environment" — every previous project environment was built from scratch and eventually abandoned. MC evolves through plugin architecture rather than being replaced. The foundation is permanent.

**Existing ecosystem:**
- `portfolio-dashboard/` — Deprecated, replaced by `@mission-control/mcp` in v1.1.
- `qmspace/` — Separate comms platform. Stays independent, gets a lightweight chat plugin eventually.
- Mac Mini hosts: Go services (msgvault, pixvault, vaulttrain-stern), Docker (Crawl4AI), training jobs.
- `principals-ear/` — Separate product. Shares capture DNA, not code.

**User patterns that inform design:**
- Works in serial sprints — intense focus on one project for days/weeks, then moves on
- Morning pattern: "what finished while I was sleeping?" → risk feed answers this
- Tools adopted for entry point friction, not features
- Every previous task/capture system abandoned (friction, graveyard, wrong flow, over-structured)
- MC is browser homepage — first thing seen every day

## Constraints

- **Hosting:** Mac Mini via Tailscale. Private, always-on, close to data sources.
- **Tech stack:** Hono + better-sqlite3 + Drizzle (API), React + Vite + Tailwind v4 (web), Zod schemas (shared)
- **Single user v1:** No auth, no multi-tenant. API design does not preclude multi-user future.
- **Offline capture:** iOS and CLI capture paths must work when Mac Mini is unreachable (local queue + sync).
- **MCP dual role:** MC consumes MCP servers AND exposes its own MCP server.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| API-first architecture | The API is the playground. Dashboard, iOS, CLI are all consumers. | ✓ Good — 8 API route groups consumed by dashboard, clean separation |
| Clean slate on existing code | Previous code (ZeroClaw AI gateway) served different vision. | ✓ Good — fresh start enabled right architecture from day one |
| Captures woven into project cards | Prevents "separate inbox becomes graveyard" pattern. | ✓ Good — captures live where they belong, loose thoughts section catches orphans |
| AI categorization of raw captures | Zero cognitive overhead at capture time. | ✓ Good — Gemini structured output with confidence scores, graceful fallback when unavailable |
| Persist first, enrich later | Captures hit SQLite immediately, AI categorizes async. | ✓ Good — fire-and-forget via queueMicrotask, zero capture latency |
| SQLite + FTS5 for search | Single file, zero ops, BM25 ranking built in. | ✓ Good — unified search_index across captures, projects, commits |
| SSE for real-time (not WebSockets) | Simpler, one-directional, sufficient for dashboard updates. | ✓ Good — EventSource with exponential backoff reconnection |
| Tailwind v4 CSS-native theming | @theme tokens + @custom-variant dark, no JS config file. | ✓ Good — cleaner than v3, warm/terracotta palette distinctive |
| Hono RPC client (hc) | Type-safe API calls from React, same types end-to-end. | ✓ Good — required route chaining in app.ts for type preservation |
| No auth in v1 | Single user, trust-based. Tailscale network boundary is access control. | ✓ Good — zero auth complexity, revisit when Bella needs access |
| Arc browser design energy | Opinionated, distinctive, breaks conventions. | ✓ Good — warm terracotta palette, not another sterile dev dashboard |
| Health checks as pure functions | Testable without DB or SSH, side effects separated. | ✓ Good — 54 unit tests, all edge cases covered |
| Post-scan health phase (not inline) | Copy reconciliation needs data from both hosts. | ✓ Good — 4-stage pipeline runs after all repos scanned |
| Text ISO timestamps for health tables | Better for age calculations and API display. | ✓ Good — `detectedAt` preservation verified by regression test |
| MCP server as API client (not DB client) | Enforces API-first. Every MCP capability also available to dashboard. | ✓ Good — thin HTTP wrapper, 721KB standalone bundle |
| Custom SVG/CSS for timeline (no charting lib) | One simple bar chart doesn't justify 50-230KB library. | ✓ Good — consistent with heatmap approach, Tailwind-compatible |
| Warm palette for severity (not standard red/amber/green) | Matches Arc design energy. Deep rust / warm gold / sage green. | ✓ Good — distinctive, not bolted-on monitoring chrome |
| HTTP hooks (not shell scripts) for session reporting | Claude Code HTTP hooks POST directly to API — no shell intermediary. | ✓ Good — simpler, more reliable, native JSON payload |
| Hook-specific endpoints (/hook/start, /hook/heartbeat, /hook/stop) | Separates Claude Code native format from clean REST API contract. | ✓ Good — translation layer keeps API clean |
| Budget as session count + burn rate (no dollar estimates) | No real billing data available for calibration. | ✓ Good — informational only, never restricts |
| Conflict detection via health findings table | Reuses entire risk feed infrastructure (queries, API, rendering). | ✓ Good — zero new tables, auto-resolve via existing patterns |
| Aider passive detection via git log | Zero UX friction — no wrapper script needed. | ✓ Good — commit author attribution during scan cycle |
| fetchCounter pattern (not TanStack Query) | Codebase already uses useState + useEffect + counter pattern consistently. | ✓ Good — consistency over library churn |
| Separate discoveries table (not projects) | Prevents speculative repos from polluting departure board and health checks. | ✓ Good — clean separation, promote copies to projects table |
| Dedup at insert time (not post-scan) | Simpler than post-scan dedup, prevents duplicates from ever entering DB. | ✓ Good — normalizeRemoteUrl check before every upsert |
| Hybrid strip + sidebar dashboard layout | Persistent top strip for ambient awareness, sidebar for session timeline. Existing layout untouched. | ✓ Good — zero scroll cost, passive notice of discoveries/stars |
| Stars stay in popover (no dedicated page) | Stars are a signal, not a product. Keeps MC focused. | ✓ Good — search/filter within popover, no page bloat |
| CLI uses plain fetch (not Hono RPC) | Avoids bundling API package as runtime dependency. | ✓ Good — 137KB standalone binary, no API code in bundle |
| Commander.js (only new npm dependency) | De facto CLI standard, 500M+ weekly downloads, ESM-native. | ✓ Good — minimal, proven, zero setup overhead |

| iOS as sibling repo (not monorepo) | Swift/Xcode tooling expects own project root. CLI is in-repo because it shares TS toolchain. iOS doesn't. | ✓ Good — clean separation, XcodeGen project works well |
| Native SwiftUI dashboard (not WKWebView) | WKWebView lacks native scroll physics, haptics, gestures. Worth the extra effort. | ✓ Good — native feel, proper offline handling |
| Tailscale trust for iOS (no new auth) | Same model as browser. Phone theft → revoke Tailscale device. No PII beyond project names. | ✓ Good — extended to Bella via user registry |
| D3-force for relationship graph (charting lib exception) | Force-directed graph cannot be done with CSS/SVG alone. Scoped to d3-force module only (~40KB). | ✓ Good — 21KB lazy-loaded chunk, BFS highlight chains |
| Scan-time convention enforcement only | Static analysis of CLAUDE.md text during scan. Runtime interception deferred — M+ effort for marginal gain. | ✓ Good — 5 rules, zero false positives |
| iOS foreground-only sync | Background sync requires background modes entitlement + M effort. Foreground flush is sufficient for v1.4. | ✓ Good — sufficient for capture workflow |
| sqlite-vec for local embeddings (not cloud API) | Zero external dependency, content-addressable dedup, same DB file. | ✓ Good — 768-dim nomic-embed-text-v1.5 via LM Studio |
| RRF fusion over learned weights | No training data, RRF is parameter-free. k=60 per original paper, BM25 weight 2x vector. | ✓ Good — robust without tuning |
| LM Studio for all local AI (not Gemini) | Privacy, no API costs, works offline. Qwen3.5-35B-A3B for generation, nomic-embed for vectors. | ✓ Good — narratives, extraction, query expansion all local |
| Few-shot examples in DB (not config) | API-driven evolution from user corrections. Correction-as-training pattern. | ✓ Good — self-improving categorization |
| Solutions auto-extracted from session hooks | Session stop hook evaluates significance, extracts metadata via LM Studio. | ✓ Good — zero manual effort, compound score tracks reuse |
| AI SDK for Bella chat (not raw LM Studio) | streamText + tool calling abstraction, zodSchema for type safety. | ✓ Good — 7 tools, grounded responses |
| Multi-user via config registry (not auth) | Config-driven user list with Tailscale IP resolution. No passwords. | ✓ Good — Bella as first second user |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-23 after v2.0 Intelligence Engine milestone*
