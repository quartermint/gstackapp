# Roadmap: Mission Control

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-03-10)
- ✅ **v1.1 Git Health Intelligence + MCP** — Phases 6-10 (shipped 2026-03-15)
- ✅ **v1.2 Session Orchestrator + Local LLM Gateway** — Phases 11-15 (shipped 2026-03-16)
- 🚧 **v1.3 Auto-Discovery + Session Enrichment + CLI** — Phases 16-22 (in progress)

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

<details>
<summary>✅ v1.2 Session Orchestrator + Local LLM Gateway (Phases 11-15) — SHIPPED 2026-03-16</summary>

**Milestone Goal:** Evolve MC from passive project dashboard to active coding session orchestrator — tracking all Claude Code and Aider sessions, detecting file conflicts across parallel sessions, routing tasks to the right model tier, and monitoring Claude usage budget. LM Studio on Mac Mini provides local model availability awareness.

- [x] **Phase 11: Data Foundation** - Session/budget schema, Drizzle migration, Zod types, model tier config, infra scripts update (completed 2026-03-16)
- [x] **Phase 12: Session Ingestion** - Session lifecycle API, hook scripts, project resolution, session reaper, Aider passive detection (completed 2026-03-16)
- [x] **Phase 13: LM Gateway + Budget** - LM Studio health probe, budget service, model/budget API endpoints, tier routing recommendations (completed 2026-03-16)
- [x] **Phase 14: Intelligence Layer** - File-level conflict detection across active sessions, SSE conflict alerts, session-project relationships (completed 2026-03-16)
- [x] **Phase 15: Dashboard** - Active sessions panel, budget widget, conflict alert cards, session badges on project cards, SSE-driven updates (completed 2026-03-16)

Full details: [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)

</details>

### 🚧 v1.3 Auto-Discovery + Session Enrichment + CLI (In Progress)

**Milestone Goal:** Expand MC's awareness beyond manually configured projects, deepen session intelligence built in v1.2, and ship the first non-browser API client. Discovery engine surfaces unknown repos across MacBook, Mac Mini, and GitHub orgs. Star intelligence adds curated intent to GitHub stars. Session enrichment detects convergence opportunities. CLI enables capture and status from terminal without leaving a coding session.

- [x] **Phase 16: Data Foundation** - Discovery + star schemas, Drizzle migrations, Zod types, config extension for discovery paths and GitHub orgs (completed 2026-03-16)
- [x] **Phase 17: Auto-Discovery Engine (Local)** - Depth-1 filesystem walk, track/dismiss actions, discovery routes, SSE events, own scan timer (completed 2026-03-16)
- [x] **Phase 18: Auto-Discovery Engine (SSH + GitHub Orgs)** - Mac Mini repo discovery via SSH, GitHub org listing, cross-host dedup (completed 2026-03-16)
- [x] **Phase 19: GitHub Star Intelligence** - Star sync via gh API, AI intent categorization, hourly timer, user override, star-to-project linking (completed 2026-03-16)
- [x] **Phase 20: Session Enrichment** - MCP session tools, convergence detector with overlap + temporal proximity, convergence badge (gap closure in progress) (completed 2026-03-16)
- [ ] **Phase 21: Dashboard (Discoveries + Stars + Session Timeline)** - Discovery cards, star browser, session timeline visualization
- [ ] **Phase 22: CLI Client** - packages/cli with capture, status, projects, offline queue, piped input, init

## Phase Details

### Phase 16: Data Foundation
**Goal**: All new data entities have schema, migrations, and shared types ready for services to build on
**Depends on**: Phase 15 (v1.2 complete)
**Requirements**: DISC-02, STAR-02
**Success Criteria** (what must be TRUE):
  1. `discoveries` table exists in SQLite with columns for path, host, status (found/tracked/dismissed), remote URL, and unique constraint on (path, host)
  2. `stars` table exists in SQLite with columns for github_id (unique), full_name, description, language, topics, intent category, ai_confidence, and starred_at
  3. Drizzle migrations run cleanly against existing production database without data loss
  4. Zod schemas in `@mission-control/shared` validate discovery and star entities end-to-end (API request/response shapes)
  5. `mc.config.json` schema extended with discovery root paths and GitHub org names, validated by Zod
**Plans:** 1/1 plans complete
Plans:
- [ ] 16-01-PLAN.md — Drizzle schema + migration, Zod schemas + types, config extension

### Phase 17: Auto-Discovery Engine (Local)
**Goal**: MC automatically finds git repos on the MacBook that are not yet tracked, and users can promote or permanently dismiss them
**Depends on**: Phase 16
**Requirements**: DISC-01, DISC-03, DISC-04, DISC-09, DISC-10
**Success Criteria** (what must be TRUE):
  1. Running a discovery scan surfaces git repos in configured root directories (depth-1 children only) that are not already in mc.config.json
  2. User can promote a discovered repo to a tracked project via API, which atomically writes to mc.config.json and the projects table, and the repo appears on the departure board
  3. User can dismiss a discovered repo permanently via API, and it never re-surfaces in subsequent scans
  4. Discovery scan runs on its own independent timer (not inside the 5-minute project scan cycle) and does not block or delay project health checks
  5. SSE events (`discovery:found`, `discovery:promoted`) fire in real time when discoveries are made or promoted
**Plans**: 3 plans
Plans:
- [ ] 17-01-PLAN.md — Discovery scanner service + database queries + event-bus types
- [ ] 17-02-PLAN.md — Discovery API routes + app.ts registration
- [ ] 17-03-PLAN.md — Server timer integration + tests

### Phase 18: Auto-Discovery Engine (SSH + GitHub Orgs)
**Goal**: Discovery extends beyond the MacBook to surface repos on Mac Mini and in GitHub organizations, with cross-host deduplication
**Depends on**: Phase 17
**Requirements**: DISC-05, DISC-06, DISC-07
**Success Criteria** (what must be TRUE):
  1. Discovery engine scans Mac Mini repos via SSH with a 3-second connect timeout and 10-second command timeout, and SSH failure is non-fatal (dashboard shows "last scanned X ago" instead of erroring)
  2. Discovery engine lists repos from configured GitHub orgs (quartermint, vanboompow) and surfaces repos not cloned locally
  3. Cross-host dedup matches discoveries by normalized remote URL so the same repo discovered on MacBook, Mac Mini, and GitHub appears as one entry (not three)
**Plans**: 2 plans
Plans:
- [ ] 18-01-PLAN.md — SSH + GitHub org source scanning + cross-host dedup via normalizeRemoteUrl
- [ ] 18-02-PLAN.md — Tests for SSH scanning, GitHub org scanning, and cross-host dedup

### Phase 19: GitHub Star Intelligence
**Goal**: GitHub stars are synced, categorized by intent, and linked to local projects -- turning a flat list into curated intelligence
**Depends on**: Phase 16
**Requirements**: STAR-01, STAR-03, STAR-04, STAR-05, STAR-07
**Success Criteria** (what must be TRUE):
  1. Star service fetches all starred repos via `gh api --paginate` with `starred_at` timestamps and persists them immediately (persist-first, enrich-later)
  2. AI categorization classifies each star as reference/tool/try/inspiration using Gemini structured output, with graceful fallback when Gemini is unavailable
  3. Star sync runs on an hourly timer, decoupled from project scan, with rate limit guard that checks remaining budget before syncing
  4. User can manually override the AI-assigned intent category for any star via API
  5. Stars that match a tracked project's remote URL are automatically linked, showing the connection between "starred on GitHub" and "cloned locally"
**Plans**: 3 plans
Plans:
- [ ] 19-01-PLAN.md — Star sync service + DB queries + tests (Wave 1)
- [ ] 19-02-PLAN.md — AI intent categorizer + tests (Wave 1)
- [ ] 19-03-PLAN.md — Star routes + timer integration + star-to-project linking + tests (Wave 2)

### Phase 20: Session Enrichment
**Goal**: Claude Code sessions gain self-awareness through MCP tools, and MC detects when parallel sessions are ready to converge
**Depends on**: Phase 15 (v1.2 session infrastructure)
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05
**Success Criteria** (what must be TRUE):
  1. MCP tool `session_status` returns active sessions with project, start time, file count, and agent type -- optionally filtered by project slug
  2. MCP tool `session_conflicts` returns active file-level conflicts across sessions with file paths and session identifiers
  3. Convergence detector identifies when two sessions on the same project both have commits AND share overlapping files within a 30-minute temporal window
  4. Convergence surfaces as a passive badge on project cards in the dashboard (not an alert card in the risk feed) -- informational, never alarming
  5. False positives are controlled: convergence requires file overlap AND temporal proximity AND at least one committed session (same project alone is not sufficient)
**Plans**: 4 plans (3 complete + 1 gap closure)
Plans:
- [x] 20-01-PLAN.md — TDD convergence algorithm
- [x] 20-02-PLAN.md — MCP session tools + API
- [x] 20-03-PLAN.md — Post-scan integration + badge component
- [ ] 20-04-PLAN.md — Gap closure: wire convergence data through App -> DepartureBoard -> ProjectGroup -> ProjectRow

### Phase 21: Dashboard (Discoveries + Stars + Session Timeline)
**Goal**: All v1.3 backend data is visible and actionable in the dashboard -- discoveries to curate, stars to browse, sessions to visualize
**Depends on**: Phase 17, Phase 19, Phase 20
**Requirements**: DISC-08, STAR-06, SESS-06
**Success Criteria** (what must be TRUE):
  1. Dashboard discoveries section shows cards for each discovered repo with repo name, remote URL, last commit age, and track/dismiss action buttons -- updated in real time via SSE
  2. Dashboard star browser shows stars grouped by intent category (reference/tool/try/inspiration) with language badges, searchable/filterable
  3. Session timeline visualization shows sessions as horizontal bars arranged by time-of-day with project rows, providing a visual history of "what happened today"
**Plans:** 1/2 plans executed
Plans:
- [ ] 21-01-PLAN.md — Data hooks, SSE wiring, What's New strip with discovery/star popovers
- [ ] 21-02-PLAN.md — Session timeline sidebar with project rows and time-of-day bars

### Phase 22: CLI Client
**Goal**: Users can capture thoughts and query project status from the terminal without leaving their coding session, with offline resilience
**Depends on**: Phase 16 (shared types only -- no frontend dependency)
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07, CLI-08, CLI-09
**Success Criteria** (what must be TRUE):
  1. `mc capture "thought"` sends a capture to the MC API and confirms success, with auto-detected project from current working directory
  2. `echo "idea" | mc capture` reads from stdin, and `mc capture -p <slug>` allows explicit project assignment that skips AI categorization
  3. `mc status` displays project summary (active/idle/stale counts, health overview) and `mc projects` lists tracked projects with status and last commit age
  4. When the MC API is unreachable, captures are persisted to `~/.mc/queue.jsonl` with clear user feedback ("Queued locally"), and the queue auto-flushes on next successful API call
  5. `mc init` configures the API URL with smart detection of the Mac Mini Tailscale IP, and the CLI ships as a `packages/cli` package following the MCP tsup bundle pattern
**Plans**: TBD

## Progress

**Execution Order:** Phases 16-22 in sequence, with Phase 22 (CLI) parallelizable with Phase 21 (Dashboard) since it has zero frontend dependencies.

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-5 | v1.0 | 15/15 | Complete | 2026-03-10 |
| 6-10 | v1.1 | 12/12 | Complete | 2026-03-15 |
| 11-15 | v1.2 | 12/12 | Complete | 2026-03-16 |
| 16. Data Foundation | 1/1 | Complete    | 2026-03-16 | - |
| 17. Discovery (Local) | 3/3 | Complete    | 2026-03-16 | - |
| 18. Discovery (SSH + GitHub) | 2/2 | Complete    | 2026-03-16 | - |
| 19. Star Intelligence | 3/3 | Complete    | 2026-03-16 | - |
| 20. Session Enrichment | 4/4 | Complete    | 2026-03-16 | - |
| 21. Dashboard | 1/2 | In Progress|  | - |
| 22. CLI Client | v1.3 | 0/TBD | Not started | - |
