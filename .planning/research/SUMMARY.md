# Project Research Summary

**Project:** Mission Control - Personal Operating Environment
**Domain:** API-first personal dashboard + universal capture system (single-user, self-hosted)
**Researched:** 2026-03-09
**Confidence:** HIGH

## Executive Summary

Mission Control is a self-hosted personal operating environment built on the Mac Mini, designed to give a serial-sprint developer instant awareness across 12+ projects and a zero-friction capture pipeline for ideas, links, and voice notes. The expert consensus is clear: this is a single-user API-first system where the API server is the product and everything else (web dashboard, iOS app, CLI, MCP server) is a client. The stack is a monolithic Node.js process running Hono + SQLite (via better-sqlite3 and Drizzle ORM), served behind Tailscale with no public internet exposure. This is the "one-person stack" pattern -- maximally simple infrastructure for a single user on hardware they own.

The recommended approach is to ship a thin, usable slice in weeks 1-2 (dashboard reading from existing portfolio-dashboard MCP data + basic capture) and iterate toward the full vision. The core innovation is not the dashboard itself but the capture-to-project pipeline: raw input goes in, AI categorizes it to a project, and it appears woven into the project card on the dashboard. This eliminates the "separate inbox that becomes a graveyard" pattern that killed every previous system. The architecture enforces "persist first, enrich later" -- raw captures are saved to SQLite immediately, AI processing happens asynchronously, and failures in the AI layer never lose data.

The primary risks are all behavioral, not technical. The top three threats to this project are: (1) the capture graveyard -- captures accumulate but are never processed, turning the system into a guilt machine; (2) the perfectionism trap -- treating "last environment" as permission to over-engineer, resulting in months of infrastructure work before daily use; and (3) the museum dashboard -- building a beautiful display of static state that becomes stale after two weeks. All three are mitigated by the same principle: ship value fast, surface change (not state), and design for passive consumption with permissive input.

## Key Findings

### Recommended Stack

The stack is a TypeScript monorepo (pnpm + Turborepo) with Hono as the API framework, SQLite as the database, and React + Vite for the web dashboard. Every technology choice was made for simplicity and self-hosted single-user operation. No database servers, no external services for core functionality, no SSR framework overhead.

**Core technologies:**
- **Hono 4.12+**: HTTP API framework -- ultrafast, 14KB, built-in RPC client for type-safe dashboard data fetching, native SSE streaming support, runs on Node.js via @hono/node-server
- **SQLite + better-sqlite3 + Drizzle ORM**: Single-file database with synchronous API, type-safe ORM, FTS5 for full-text search, sqlite-vec for semantic/vector search -- the entire data layer in one file
- **React 19 + Vite 6 + TanStack Router/Query**: SPA dashboard with type-safe routing, SWR caching, optimistic updates. No SSR needed for a private dashboard behind Tailscale
- **Tailwind CSS v4 + Motion (Framer Motion)**: Styling and animation for the "Arc browser energy" visual identity
- **SSE (Server-Sent Events)**: Real-time dashboard updates -- simpler than WebSockets, auto-reconnects, sufficient for one-way server-to-client push
- **MCP SDK**: Expose MC tools to Claude Code and consume portfolio-dashboard/mac-mini-bridge data
- **Swift 6 / SwiftUI**: iOS companion app with SwiftData for offline queue, WidgetKit for quick capture, AVFoundation for voice recording

**Critical version note:** Node.js (not Bun) for production -- better-sqlite3 and sqlite-vec have proven Node.js compatibility while Bun's native SQLite driver has had Drizzle compatibility issues.

### Expected Features

**Must have (table stakes -- P1):**
- Single-page dashboard with departure board layout (project rows grouped by Active/Idle/Stale)
- Quick capture from dashboard (text field + Cmd+K)
- Command palette / keyboard shortcuts
- Full-text search across captures and projects
- Project status visibility (git status, last activity, dirty files)
- CLI capture tool (`mc capture "thought"`)
- Basic AI categorization of captures to projects
- Mac Mini health pulse indicator
- Offline capture resilience (local queue + sync)
- API server with core CRUD endpoints

**Should have (differentiators -- P2):**
- AI auto-categorization with confidence scoring and easy correction
- Captures woven into project cards (not a separate inbox)
- Sprint heatmap (GitHub-style contribution grid per project)
- "Previously on..." context restoration narratives
- Stale project nudges with uncommitted work detection
- MCP server for Claude Code integration
- SSE real-time updates
- AI triage for aging captures

**Defer (v2+):**
- iOS companion app (full effort: widget, share sheet, voice, offline sync)
- Voice capture with audio storage and Whisper transcription
- iOS share sheet extension
- Plugin architecture formalization

### Architecture Approach

The architecture follows a strict "API is the product" principle: one Node.js process on the Mac Mini runs the Hono API server, serves the static React SPA, processes AI enrichments via an in-process queue, and communicates with all clients through REST + SSE. No microservices, no separate processes (except the MCP stdio server required by the protocol). Security is network-level: Tailscale membership equals authorization, with an optional API key for belt-and-suspenders.

**Major components:**
1. **Hono API Server** -- all business logic, data access, capture processing, AI orchestration (Mac Mini)
2. **SQLite Database** -- captures, project state, metadata, FTS5 index, vector embeddings (single file, WAL mode)
3. **Web Dashboard (React SPA)** -- departure board layout, quick capture, command palette, SSE subscription (static files served by API)
4. **AI Processing Pipeline** -- Claude API for categorization, Ollama/nomic-embed-text for local embeddings, Whisper for transcription (in-process async queue)
5. **MCP Layer** -- consumes portfolio-dashboard and mac-mini-bridge; exposes MC tools/resources to Claude Code
6. **CLI Client** -- `mc capture` command, local offline queue, pnpm-linked from monorepo
7. **iOS Companion** -- SwiftUI capture app with SwiftData offline queue, widget, share sheet (future phase)

**Key patterns:** Persist first / enrich later. Client-generated IDs for offline dedup. SSE for real-time / REST for everything else. Single SQLite database with multiple access patterns (tables, FTS5, sqlite-vec).

### Critical Pitfalls

1. **The Graveyard Inbox** -- Captures accumulate, nothing comes out. Prevent by: weaving captures into project cards (no separate inbox), AI auto-triage with expiry for stale items, designing for "90% of captures are throwaway" reality. This is the #1 killer based on user's history of 10+ abandoned systems.

2. **The "Last Environment" Perfectionism Trap** -- Every decision carries existential weight, leading to months of infrastructure before any daily value. Prevent by: shipping a usable dashboard in weeks 1-2, setting a hard 4-week daily-driver deadline, deferring plugin architecture entirely.

3. **Dashboard Becomes a Museum** -- Static state display nobody revisits after week 2. Prevent by: leading with "what changed since last visit" (delta, not state), captures woven into project cards creating freshness, AI-generated "Previously on..." narratives.

4. **AI Categorization Erodes Trust** -- 20-30% error rate makes users route around the AI layer. Prevent by: confidence thresholds (auto-assign high confidence, suggest low confidence), single-tap correction, tracking accuracy and feeding corrections back, accepting "uncategorized" as valid.

5. **Offline Sync Engineering Black Hole** -- "Just queue and replay" becomes weeks of distributed systems work. Prevent by: append-only captures, fire-and-forget upload, no bidirectional sync in v1, no conflict resolution needed when captures are immutable.

## Implications for Roadmap

Based on combined research, the project decomposes into 7 phases ordered by dependency chain and value delivery. The critical constraint: the system must be in daily use by week 4 to avoid the perfectionism trap.

### Phase 1: Foundation -- API Server + Data Layer + Minimal Dashboard

**Rationale:** Everything depends on the API server and SQLite schema. The dashboard must show something useful immediately -- even if it is just project data from the existing portfolio-dashboard MCP server or seeded data. This establishes the "open it every morning" habit.
**Delivers:** Working Hono API server, SQLite schema (captures, projects, metadata), Drizzle ORM setup, static React SPA served from the API, departure board layout rendering project data.
**Addresses:** Dashboard overview, project status visibility, fast page load, responsive layout, data persistence.
**Avoids:** Perfectionism trap (ships value in sprint 1), museum dashboard (connects to real project data from day one).
**Stack:** Hono, better-sqlite3, Drizzle, React 19, Vite 6, TanStack Router/Query, Tailwind v4.

### Phase 2: Capture Pipeline -- Text Capture + AI Categorization

**Rationale:** Capture is the core value proposition. The dashboard becomes a daily driver when you can dump thoughts into it and see them appear on the right project card. AI categorization is included here (not deferred) because captures without categorization are just a graveyard inbox -- the exact anti-pattern this project exists to solve.
**Delivers:** POST /api/captures endpoint, dashboard quick-capture field, Cmd+K command palette, AI categorization with confidence scoring, captures displayed on project cards.
**Addresses:** Quick capture, command palette, basic AI categorization, captures woven into project cards.
**Avoids:** Graveyard inbox (AI categorization from day one), AI trust erosion (confidence thresholds + easy correction).
**Stack:** Claude API for categorization, Zod for validation, Zustand for UI state.

### Phase 3: Search + Enrichment -- FTS5, Embeddings, Triage

**Rationale:** With captures flowing in, they need to be findable and maintainable. Full-text search makes the system retrievable. Vector embeddings enable semantic search. AI triage prevents capture accumulation by surfacing stale items.
**Delivers:** FTS5 full-text search, sqlite-vec vector search, hybrid search (RRF), search UI in command palette, AI triage for aging captures, stale project nudges.
**Addresses:** Full-text search, AI triage, stale project nudges.
**Avoids:** Graveyard inbox (auto-triage), museum dashboard (stale nudges add freshness).
**Stack:** SQLite FTS5, sqlite-vec, Ollama/nomic-embed-text (local embeddings), OpenAI text-embedding-3-small (fallback).

### Phase 4: Real-Time + Dashboard Polish

**Rationale:** SSE makes the dashboard feel alive -- captures appear as they are created, AI enrichments update in real time, health indicators pulse. This is also where the visual identity ("Arc browser energy") gets applied. The sprint heatmap and "Previously on..." recaps add depth.
**Delivers:** SSE event stream, live dashboard updates, sprint heatmap, "Previously on..." context restoration, Mac Mini health pulse, polished visual design with Motion animations.
**Addresses:** SSE real-time updates, sprint heatmap, "Previously on..." recaps, Mac Mini health pulse.
**Avoids:** Museum dashboard (live updates + change deltas), information density overload (progressive disclosure).
**Stack:** SSE (native EventSource), Motion (Framer Motion), Hono streaming helper.

### Phase 5: MCP Integration -- Consume + Expose

**Rationale:** MCP consumption replaces the existing portfolio-dashboard data seeding with live git data from all projects. MCP exposure lets Claude Code sessions read/write captures, making MC infrastructure for AI-assisted development. Both require a stable API, which is why this comes after the API is proven through daily dashboard use.
**Delivers:** MCP client consuming portfolio-dashboard and mac-mini-bridge servers, MCP server exposing create_capture, search_captures, get_project_status tools, live git data on dashboard.
**Addresses:** MCP server for Claude Code, project data aggregation, API-first architecture.
**Avoids:** MCP maintenance burden (thin wrapper over API, not critical path).
**Stack:** @modelcontextprotocol/sdk, stdio + Streamable HTTP transports.

### Phase 6: CLI Client

**Rationale:** Simple client that provides high developer value during Claude Code sessions. Just POSTs to /api/captures. Includes local offline queue (JSON files in ~/.mc/queue/) for when the Mac Mini is unreachable.
**Delivers:** `mc capture "thought"` command, pipe support (`echo "idea" | mc capture`), offline queue with background sync, global install via pnpm link.
**Addresses:** CLI capture, offline capture resilience.
**Avoids:** Over-engineering (simple script, not a framework).
**Stack:** Node.js bin script, local file queue.

### Phase 7: iOS Companion

**Rationale:** Most complex client, deferred until the capture pipeline is proven through daily web/CLI use. Includes widget (3-tap capture), share sheet extension, voice recording, offline queue with sync. This is a full iOS development effort.
**Delivers:** iOS capture app, home screen widget, share sheet extension, voice capture with on-device transcription, SwiftData offline queue, background sync.
**Addresses:** Mobile capture, voice capture, share sheet, offline resilience.
**Avoids:** Offline sync black hole (append-only, fire-and-forget), share sheet memory crashes (metadata only), super-app premature abstraction (focused capture client), voice capture friction (on-device transcription, audio as source of truth).
**Stack:** Swift 6, SwiftUI, SwiftData, WidgetKit, AVFoundation, Apple Speech framework.

### Phase Ordering Rationale

- **Phases 1-2 must ship within 4 weeks.** This is the hard deadline for daily-driver status. If the dashboard + capture loop is not in daily use by week 4, the project is at risk of the perfectionism trap.
- **Phase 2 includes AI categorization** (not deferred to a later phase) because captures without categorization are the graveyard inbox pattern. The AI layer is what makes captures useful on day one.
- **Phases 3-5 can partially overlap.** Search, SSE, and MCP are independent of each other but all require the stable API from phases 1-2.
- **Phase 6 (CLI) is deliberately late** despite being simple, because the capture API contract must be stable. A CLI built on a changing API requires constant updates.
- **Phase 7 (iOS) is last** because it is the highest-effort, highest-risk phase (offline sync, native development, app review) and the daily habit should be established through web + CLI first.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Capture + AI):** AI prompt engineering for categorization accuracy across 12+ project domains. Needs experimentation to find the right confidence thresholds and context window composition.
- **Phase 3 (Search + Embeddings):** sqlite-vec is relatively new (v0.1+). Hybrid search with RRF is documented but not widely battle-tested. Validate the FTS5 + sqlite-vec combination with realistic data volumes.
- **Phase 5 (MCP):** MCP spec has evolved multiple times. Verify current SDK version compatibility with Claude Code's expected transport. Check if portfolio-dashboard MCP server needs updates.
- **Phase 7 (iOS):** Offline sync patterns, share extension memory constraints, WidgetKit data sharing via App Groups. Well-documented individually but the combination is project-specific.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Hono + SQLite + React SPA is extremely well-documented. Standard monorepo setup.
- **Phase 4 (SSE + Polish):** SSE is browser-native, Hono has a built-in helper, TanStack Query handles cache invalidation. Straightforward.
- **Phase 6 (CLI):** A Node.js script that POSTs JSON. No research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against npm registry and official docs. Versions confirmed current as of 2026-03-09. Hono + SQLite + React is a well-proven combination. |
| Features | HIGH | Thorough competitor analysis (Notion, Linear, Raycast, Drafts, Obsidian, Capacities). Feature priorities validated against user's 10+ system abandonment history. Clear MVP definition. |
| Architecture | HIGH | API-first monolith on SQLite is the established "one-person stack" pattern. Data flows are clean and well-documented. Build order follows clear dependency chain. |
| Pitfalls | HIGH | Pattern validated across 10+ sources including user's own history. The graveyard inbox and perfectionism trap are the two most likely failure modes, and both have concrete mitigations. |

**Overall confidence:** HIGH

### Gaps to Address

- **sqlite-vec production readiness:** v0.1+ is early. Validate that it loads cleanly as a Node.js native extension alongside better-sqlite3 in the target environment (Mac Mini, Apple Silicon). If it fails, fall back to FTS5-only search for v1 and add vector search later.
- **AI categorization accuracy baseline:** No way to predict accuracy without testing against real project descriptions and captures. Plan for a calibration sprint in Phase 2 where prompt engineering and confidence thresholds are tuned.
- **Embedding cost/quality tradeoff:** Local embeddings (Ollama/nomic-embed-text) vs. OpenAI API. Actual quality difference for this use case is unknown. Test both with real captures during Phase 3 and pick one.
- **Portfolio-dashboard MCP server state:** The existing MCP server may need updates to align with the current MCP SDK version. Verify compatibility early in Phase 5 or replace with direct git repo scanning.
- **Tailscale daemon reliability on Mac Mini:** The "sleep death" issue and auto-update disruptions need operational validation. Set up monitoring early in Phase 1 deployment.
- **Drizzle + FTS5 integration:** Drizzle doesn't have native FTS5 virtual table support. Raw SQL needed for FTS5 table creation and queries. Verify this works cleanly with the Drizzle migration system.

## Sources

### Primary (HIGH confidence)
- [Hono Official Docs](https://hono.dev/) -- Framework, RPC, SSE, Node.js adapter
- [Drizzle ORM SQLite](https://orm.drizzle.team/docs/get-started-sqlite) -- ORM setup, migrations
- [SQLite FTS5](https://sqlite.org/fts5.html) -- Full-text search
- [React 19](https://react.dev/blog/2024/12/05/react-19) -- React 19 features, compiler
- [TanStack Router](https://tanstack.com/router/latest) -- Type-safe routing
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) -- CSS-first config, Vite plugin
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- Official SDK
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) -- Protocol spec

### Secondary (MEDIUM confidence)
- [sqlite-vec Hybrid Search](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) -- FTS5 + sqlite-vec combination pattern
- [Abandoned Dashboard Syndrome](https://impactful.engineering/blog/the-abandoned-dashboard-syndrome/) -- Dashboard stale-adoption pattern
- [PKM Paradox](https://medium.com/@helloantonova/the-pkm-paradox-why-most-knowledge-management-tools-fail-to-meet-our-needs-d5042f08f99e) -- Knowledge management failure patterns
- [Offline-First Architecture 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) -- Sync patterns
- [SSE vs WebSockets](https://www.freecodecamp.org/news/server-sent-events-vs-websockets/) -- Protocol comparison
- [AI Misclassification Trust](https://dl.acm.org/doi/10.1145/3715275.3732187) -- Trust erosion from AI errors

### Tertiary (LOW confidence)
- [iOS Extension Memory Limits](https://blog.kulman.sk/dealing-with-memory-limits-in-app-extensions/) -- 120MB limit documentation (older post, verify against current iOS)

## Research File Inventory

| File | Purpose |
|------|---------|
| `.planning/research/SUMMARY.md` | This file -- executive summary with roadmap implications |
| `.planning/research/STACK.md` | Technology recommendations with versions, rationale, alternatives |
| `.planning/research/FEATURES.md` | Feature landscape: table stakes, differentiators, anti-features, dependencies, MVP |
| `.planning/research/ARCHITECTURE.md` | System structure, data flows, patterns, anti-patterns, build order |
| `.planning/research/PITFALLS.md` | Domain pitfalls: graveyard inbox, perfectionism trap, dashboard museum, AI trust, offline sync |

---
*Research completed: 2026-03-09*
*Ready for roadmap: yes*
