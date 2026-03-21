# Mission Control

## What This Is

Mission Control is a personal operating environment — an API-first platform with a web dashboard that aggregates project data, captures raw thoughts with AI categorization, and surfaces contextual intelligence across a multi-project development ecosystem. It monitors git health and remote sync status across 35+ projects on MacBook and Mac Mini, surfaces risks proactively, and exposes all data via MCP for Claude Code integration. It runs on a Mac Mini behind Tailscale and serves as the daily home screen: the first thing opened every morning.

The Hono API and SQLite data layer are the core product — a shared infrastructure. The React dashboard, MCP server, and CLI are the first three clients, purpose-built for one person's brain. Future clients (iOS) build on the same API.

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

### Active

## Current Milestone: v1.4 Cross-Project Intelligence + iOS Companion + Knowledge Unification

**Goal:** Transform MC from independent project tracking to connected intelligence — understanding project relationships, capturing from any device, and bridging knowledge across machines and Claude Code sessions.

**Target features:**

**Cross-Project Intelligence:**
- [ ] Dependency chain definitions in mc.config.json (`dependsOn` field)
- [ ] Automated cross-machine reconciliation (continuous unpushed/diverged/stale detection)
- [ ] Cross-project commit impact alerts (dependency drift → health findings)
- [ ] Project relationship graph visualization (D3-force)
- [ ] New health check types: `dependency_impact`, `convention_violation`, `stale_knowledge`

**iOS Companion (sibling repo ~/mission-control-ios):**
- [ ] Share sheet extension for links/text from any app
- [ ] Widget capture in 3 taps (tap, type/dictate, send)
- [ ] Voice capture with transcription (Apple Speech, ≤60s) + audio storage
- [ ] Native SwiftUI dashboard (project list, captures, risk summary)
- [ ] Offline capture queue (Core Data, foreground sync)

**Knowledge Unification:**
- [ ] CLAUDE.md aggregation across all projects on both machines (SSH + content-hash cache)
- [ ] Convention registry with scan-time enforcement (config-driven anti-pattern list)
- [ ] MCP knowledge tools (project_knowledge, convention_check, cross_project_search)
- [ ] Context injection into Claude Code sessions (enriched startup banner + MCP query tools)
- [ ] Stale knowledge alerts (CLAUDE.md freshness vs commit activity)

**Dashboard Enhancement:**
- [ ] "Changes since last visit" highlight mode (float changed rows, activity count)

**Deferred to future milestones:**
- Semantic/vector search via embeddings
- AI-generated narrative summaries for project context restoration
- Smart routing with learning from historical session outcomes
- Session convergence merge preview (git merge-base analysis)
- Automated reconciliation actions (one-click push/pull from dashboard)
- iOS background sync, push notifications
- Runtime convention enforcement (intercepting Claude Code tool calls)

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
- **Capacities migration** — MC is forward-looking. No import of existing Capacities data.
- **Auto-spawning sessions** — MC observes and routes, it doesn't launch terminals or create sessions.
- **Token-level usage tracking** — Claude doesn't expose per-session token counts. Budget tracking uses session count + tier heuristics.
- **Aider auto-configuration** — Aider install and Qwen3-Coder-30B verification are prerequisites, not MC features.
- **Dollar cost estimates** — No real billing data available. Budget uses session count + tier heuristics only.
- **Function-level conflict detection** — File-level is sufficient for v1.2. AST-level analysis adds complexity without proportional value.

## Context

**Current State (v1.4 Phase 26 complete 2026-03-21):**
- ~44,000 lines TypeScript/CSS across 5 packages (api, web, shared, mcp, cli)
- Tech stack: Hono 4.x, better-sqlite3 + Drizzle ORM, React 19 + Vite 6, Tailwind v4, MCP SDK 1.27, Commander.js
- 711+ tests passing (565 API, 84 web, 28 MCP, 34 CLI), TypeScript strict mode
- Config foundation: `dependsOn` dependency declarations with cycle detection, idempotency key dedup on captures, 3 new health check types
- Knowledge aggregation: CLAUDE.md content cached by content-hash from all local + Mac Mini projects, hourly scan timer, stale knowledge detection, REST API
- Dependency intelligence: drift detection with severity escalation (info→warning→critical), dependency badges on project cards, action hints
- Convention enforcement: config-driven anti-pattern scanner with 5 launch rules, negative context suppression, per-project overrides
- Auto-discovery: filesystem walk + SSH + GitHub org scanning with cross-host dedup
- GitHub star intelligence: sync, AI intent categorization, star-to-project linking
- Session enrichment: convergence detection, MCP session tools, session timeline sidebar
- CLI client: mc capture/status/projects/init with offline queue
- Dashboard: "What's New" top strip with discovery/star popovers, convergence badges
- Mac Mini hosted behind Tailscale, API on :3000, LM Studio on :1234
- MCP server with 6 tools (project_health, project_risks, project_detail, sync_status, session_status, session_conflicts)

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

| iOS as sibling repo (not monorepo) | Swift/Xcode tooling expects own project root. CLI is in-repo because it shares TS toolchain. iOS doesn't. | — Pending |
| Native SwiftUI dashboard (not WKWebView) | WKWebView lacks native scroll physics, haptics, gestures. Worth the extra effort. | — Pending |
| Tailscale trust for iOS (no new auth) | Same model as browser. Phone theft → revoke Tailscale device. No PII beyond project names. | — Pending |
| D3-force for relationship graph (charting lib exception) | Force-directed graph cannot be done with CSS/SVG alone. Scoped to d3-force module only (~40KB). | — Pending |
| Scan-time convention enforcement only | Static analysis of CLAUDE.md text during scan. Runtime interception deferred — M+ effort for marginal gain. | — Pending |
| iOS foreground-only sync | Background sync requires background modes entitlement + M effort. Foreground flush is sufficient for v1.4. | — Pending |

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
*Last updated: 2026-03-21 after Phase 26 (Convention Enforcement) complete*
