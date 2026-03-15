# Mission Control

## What This Is

Mission Control is a personal operating environment — an API-first platform with a web dashboard that aggregates project data, captures raw thoughts with AI categorization, and surfaces contextual intelligence across a multi-project development ecosystem. It monitors git health and remote sync status across 35+ projects on MacBook and Mac Mini, surfaces risks proactively, and exposes all data via MCP for Claude Code integration. It runs on a Mac Mini behind Tailscale and serves as the daily home screen: the first thing opened every morning.

The Hono API and SQLite data layer are the core product — a shared infrastructure. The React dashboard and MCP server are the first two clients, purpose-built for one person's brain. Future clients (iOS, CLI) build on the same API.

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

### Active

**CLI Client:**
- [ ] `mc capture "thought"` from terminal without leaving session
- [ ] Piped input support: `echo "idea" | mc capture`
- [ ] CLI query for project status and recent captures

**MCP Expansion:**
- [ ] MCP capture tools: create_capture, list_captures, search
- [ ] Claude Code sessions push captures and pull project context via MCP

**iOS Companion:**
- [ ] Widget capture in 3 taps (tap, type/dictate, send)
- [ ] Share sheet extension for links/text from any app
- [ ] Voice capture with transcription AND audio storage
- [ ] Read-only dashboard view for phone
- [ ] Offline capture queueing with sync
- [ ] Super-app shell for future module loading

**Advanced Intelligence:**
- [ ] Semantic/vector search via embeddings (conceptual similarity beyond keywords)
- [ ] AI-generated narrative summaries for project context restoration

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
- **Git fetch on scan** — Write operation, adds network load. Not needed for common-case detection.

## Context

**Current State (v1.1 shipped 2026-03-15):**
- 25,426 lines TypeScript/CSS across 4 packages (api, web, shared, mcp)
- Tech stack: Hono 4.x, better-sqlite3 + Drizzle ORM, React 19 + Vite 6 + TanStack, Tailwind v4, MCP SDK 1.27
- 356 tests passing (268 API, 68 web, 20 MCP), TypeScript strict mode, zero tech debt
- Production build: 158 modules, 329KB JS + 721KB MCP bundle
- Mac Mini hosted behind Tailscale, API on :3000
- MCP server registered with Claude Code (stdio transport)

**Origin:** Emerged from a brainstorming session while building a portfolio-dashboard MCP server. The dashboard concept expanded into a full personal operating environment when the user declared: "I want to build my last new environment."

**Design philosophy:** "Last environment" — every previous project environment was built from scratch and eventually abandoned. MC evolves through plugin architecture rather than being replaced. The foundation is permanent.

**Existing ecosystem:**
- `portfolio-dashboard/` — Deprecated, replaced by `@mission-control/mcp` in v1.1.
- `qmspace/` — Separate comms platform. Stays independent, gets a lightweight chat plugin eventually.
- Mac Mini hosts: Go services (msgvault, pixvault, rss_rawdata), Docker (Crawl4AI), training jobs.
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

---
*Last updated: 2026-03-15 after v1.1 milestone*
