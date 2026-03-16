# Roadmap: Mission Control

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-03-10)
- ✅ **v1.1 Git Health Intelligence + MCP** — Phases 6-10 (shipped 2026-03-15)
- 🚧 **v1.2 Session Orchestrator + Local LLM Gateway** — Phases 11-15 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-03-09
- [x] Phase 2: Dashboard Core (2/2 plans) — completed 2026-03-09
- [x] Phase 3: Capture Pipeline (4/4 plans) — completed 2026-03-09
- [x] Phase 4: Search & Intelligence (3/3 plans) — completed 2026-03-10
- [x] Phase 5: Dashboard Enrichments & Real-Time (3/3 plans) — completed 2026-03-10

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Git Health Intelligence + MCP (Phases 6-10) — SHIPPED 2026-03-15</summary>

- [x] Phase 6: Data Foundation (2/2 plans) — completed 2026-03-14
- [x] Phase 7: Git Health Engine (3/3 plans) — completed 2026-03-14
- [x] Phase 8: Health API & Events (2/2 plans) — completed 2026-03-15
- [x] Phase 9: Dashboard Intelligence (3/3 plans) — completed 2026-03-15
- [x] Phase 10: MCP Server & Deprecation (2/2 plans) — completed 2026-03-15

Full details: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

### 🚧 v1.2 Session Orchestrator + Local LLM Gateway (In Progress)

**Milestone Goal:** Evolve MC from passive project dashboard to active coding session orchestrator — tracking all Claude Code and Aider sessions, detecting file conflicts across parallel sessions, routing tasks to the right model tier, and monitoring Claude usage budget. LM Studio on Mac Mini provides local model availability awareness.

- [x] **Phase 11: Data Foundation** - Session/budget schema, Drizzle migration, Zod types, model tier config, infra scripts update (completed 2026-03-16)
- [x] **Phase 12: Session Ingestion** - Session lifecycle API, hook scripts, project resolution, session reaper, Aider passive detection (completed 2026-03-16)
- [x] **Phase 13: LM Gateway + Budget** - LM Studio health probe, budget service, model/budget API endpoints, tier routing recommendations (completed 2026-03-16)
- [x] **Phase 14: Intelligence Layer** - File-level conflict detection across active sessions, SSE conflict alerts, session-project relationships (completed 2026-03-16)
- [ ] **Phase 15: Dashboard** - Active sessions panel, budget widget, conflict alert cards, session badges on project cards, SSE-driven updates

## Phase Details

### Phase 11: Data Foundation
**Goal**: The persistence layer, type system, and infrastructure are ready so session data, budget tracking, and model status can be stored and queried
**Depends on**: Phase 10 (v1.1 complete)
**Requirements**: SESS-02, BUDG-01, INFR-01
**Success Criteria** (what must be TRUE):
  1. A `sessions` table exists with columns for session_id, project_id, tool (claude/aider), model, status (active/completed/abandoned), files_touched, timestamps — and a `budget_entries` table tracks per-session tier and estimated cost, both accessible via Drizzle schema
  2. Zod schemas in `@mission-control/shared` define session lifecycle types (CreateSession, Heartbeat, SessionResponse) and model tier enum (opus/sonnet/local) with validation, importable by API and web packages
  3. The model tier derivation function correctly maps model strings ("claude-opus-4-20250514", "claude-sonnet-4-20250514", "qwen3-coder-30b") to tier labels (opus/sonnet/local)
  4. MC infra/ scripts use svc conventions and /opt/services/ paths, and existing configs without new sections still load (backward compatible)
**Plans**: 3 plans

Plans:
- [ ] 11-01-PLAN.md — Session type contracts, DB schema, migration, config extension, model tier derivation, event bus types
- [x] 11-02-PLAN.md — Session query module and comprehensive tests for all Phase 11 deliverables (completed 2026-03-16)
- [ ] 11-03-PLAN.md — Infrastructure scripts (launchd plist + install script for Mac Mini)

### Phase 12: Session Ingestion
**Goal**: Claude Code sessions report their lifecycle to MC and session data flows into the database with correct project association, while stale sessions are automatically reaped
**Depends on**: Phase 11
**Requirements**: SESS-01, SESS-03, SESS-04, SESS-05, SESS-06, API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. A Claude Code session start hook POSTs to `POST /api/sessions` and the session appears in the database as "active" with correct project association (resolved via cwd prefix matching against tracked projects, with git remote URL fallback)
  2. PostToolUse hooks for Write/Edit operations POST to `POST /api/sessions/:id/heartbeat` updating files_touched and last_activity, and the hook script completes in under 100ms (backgrounded curl, always exits 0)
  3. Stop hooks POST to `POST /api/sessions/:id/stop` marking the session as "completed", and `GET /api/sessions` returns sessions filterable by status, project, and tool
  4. Sessions with no heartbeat for 15+ minutes are automatically marked "abandoned" by a reaper running on a timer
  5. Aider sessions are detected passively during the project scan cycle via git commit author containing "(aider)" and appear as completed sessions with tool=aider
**Plans**: 3 plans

Plans:
- [ ] 12-01-PLAN.md — Session service (project resolution, debounce, reaper) + hook routes + app wiring
- [ ] 12-02-PLAN.md — Aider passive detection in scan cycle + comprehensive tests for all endpoints and services
- [ ] 12-03-PLAN.md — Claude Code HTTP hook configuration in settings.json

### Phase 13: LM Gateway + Budget
**Goal**: MC knows whether the local LM Studio model is available and tracks session costs by model tier, providing budget awareness and routing suggestions
**Depends on**: Phase 11
**Requirements**: GATE-01, GATE-02, GATE-03, BUDG-02, BUDG-03, BUDG-04, API-05, API-06
**Success Criteria** (what must be TRUE):
  1. MC polls LM Studio at `http://100.x.x.x:1234/v1/models` on a timer, and `GET /api/models` returns three-state health (unavailable/loading/ready) for the Qwen3-Coder-30B model, with LM Studio status visible in the existing health panel
  2. `GET /api/budget` returns a weekly summary showing session count by tier (opus/sonnet/local) with estimated cost range, clearly labeled as "estimated"
  3. Tier routing recommendations appear when budget burn rate exceeds a configurable threshold — suggesting local model for eligible tasks when Claude budget is running hot (rule-based, never auto-restricts)
  4. Budget estimates are informational only — they never block, restrict, or gate any session activity
**Plans**: 2 plans

Plans:
- [ ] 13-01-PLAN.md — Shared schemas, config extension, LM Studio probe service, budget service with tier routing
- [ ] 13-02-PLAN.md — Model/budget API routes, app wiring, LM Studio timer, hook response enrichment, comprehensive tests

### Phase 14: Intelligence Layer
**Goal**: MC detects when parallel sessions are touching the same files and alerts the user in real-time, preventing merge conflicts before they happen
**Depends on**: Phase 12
**Requirements**: INTL-01, INTL-02, INTL-03
**Success Criteria** (what must be TRUE):
  1. When two active sessions on the same project report writing to the same file path (via heartbeat data), MC detects the overlap within one heartbeat cycle
  2. An SSE `session:conflict` event is emitted immediately when a file-level conflict is detected, containing both session IDs and the conflicting file paths
  3. Sessions on the same project are grouped as related — querying sessions for a project returns all active and recent sessions with their relationship (e.g., "2 active sessions on mission-control")
**Plans**: 2 plans

Plans:
- [ ] 14-01-PLAN.md — Conflict detector service, schema extensions, heartbeat/stop/reaper integration, SSE fix, relationship metadata, tests
- [ ] 14-02-PLAN.md — Client-side SSE conflict handler, risk card session badge, App.tsx wiring

### Phase 15: Dashboard
**Goal**: The dashboard surfaces live session awareness, budget status, and conflict alerts — making parallel coding sessions visible at a glance
**Depends on**: Phase 13, Phase 14
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):
  1. An active sessions panel shows a live feed of all active sessions — each displaying project name, tool icon (Claude/Aider), model tier badge, and elapsed time since start
  2. A budget widget shows weekly tier usage (session counts per tier) with a burn rate indicator that changes color as usage increases
  3. When a file conflict is detected, a conflict alert card appears in the dashboard with the affected project, session details, and conflicting file paths — without requiring a page refresh
  4. Departure board project cards show session count badges ("2 active") when sessions are running against that project
  5. Session lifecycle events (started, stopped, conflict detected) drive SSE-powered live updates — no polling, no page refresh needed

**Plans**: TBD

## Progress

**Execution Order:** Phases 11 through 15, strictly sequential (Phase 13 can begin after Phase 11, parallel to Phase 12).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-03-09 |
| 2. Dashboard Core | v1.0 | 2/2 | Complete | 2026-03-09 |
| 3. Capture Pipeline | v1.0 | 4/4 | Complete | 2026-03-09 |
| 4. Search & Intelligence | v1.0 | 3/3 | Complete | 2026-03-10 |
| 5. Dashboard Enrichments & Real-Time | v1.0 | 3/3 | Complete | 2026-03-10 |
| 6. Data Foundation | v1.1 | 2/2 | Complete | 2026-03-14 |
| 7. Git Health Engine | v1.1 | 3/3 | Complete | 2026-03-14 |
| 8. Health API & Events | v1.1 | 2/2 | Complete | 2026-03-15 |
| 9. Dashboard Intelligence | v1.1 | 3/3 | Complete | 2026-03-15 |
| 10. MCP Server & Deprecation | v1.1 | 2/2 | Complete | 2026-03-15 |
| 11. Data Foundation | v1.2 | 3/3 | Complete | 2026-03-16 |
| 12. Session Ingestion | v1.2 | 3/3 | Complete | 2026-03-16 |
| 13. LM Gateway + Budget | v1.2 | 2/2 | Complete | 2026-03-16 |
| 14. Intelligence Layer | 2/2 | Complete   | 2026-03-16 | - |
| 15. Dashboard | v1.2 | 0/? | Not started | - |
