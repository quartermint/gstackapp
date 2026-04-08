# Roadmap: gstackapp

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-03-31)
- ✅ **v1.1 @gstackapp/harness** — Phases 7-11 (shipped 2026-04-03)
- 🚧 **v2.0 Command Center** — Phases 12-15 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-03-31</summary>

- [x] Phase 1: Foundation & GitHub Integration (3/3 plans) — completed 2026-03-30
- [x] Phase 2: Pipeline Engine (3/3 plans) — completed 2026-03-30
- [x] Phase 3: Review Output & Signal Quality (2/2 plans) — completed 2026-03-31
- [x] Phase 4: Dashboard & Pipeline Visualization (4/4 plans) — completed 2026-03-31
- [x] Phase 5: Cross-Repo Intelligence (2/2 plans) — completed 2026-03-31
- [x] Phase 6: Onboarding & Quality Trends (3/3 plans) — completed 2026-03-31

See: `.planning/milestones/v1.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.1 @gstackapp/harness (Phases 7-11) — SHIPPED 2026-04-03</summary>

- [x] Phase 7: Seam Cleanup (1/1 plan) — completed 2026-04-03
- [x] Phase 8: Harness Package Extraction (2/2 plans) — completed 2026-04-03
- [x] Phase 9: Model Failover Router (2/2 plans) — completed 2026-04-03
- [x] Phase 10: Tool Adapters & Skills (2/2 plans) — completed 2026-04-03
- [x] Phase 11: State Sync (2/2 plans) — completed 2026-04-03

See: `.planning/milestones/v1.1-ROADMAP.md` for full details.

</details>

### 🚧 v2.0 Command Center (In Progress)

**Milestone Goal:** Transform gstackapp from a PR review platform into a central AI workspace -- see all projects, incubate ideas through rich frontloading, and execute autonomously through GSD with multi-provider routing.

- [ ] **Phase 12: Agent Loop & Session Infrastructure** - Generator-based agent loop with tool execution, context compression, and session persistence
- [x] **Phase 13: Multi-Provider Routing Expansion** - GPT-Codex and Gemma 4 providers, task-aware routing, Mac Mini local model benchmarking (gap closure in progress) (completed 2026-04-08)
- [ ] **Phase 14: Dashboard & Project State** - Cross-project dashboard reading filesystem state, design docs, worklog, infra health, and PR review integration
- [ ] **Phase 15: Ideation Funnel & Autonomous GSD** - Browser-based ideation pipeline, multi-tab sessions, one-click autonomous execution with real-time visualization

## Phase Details

### Phase 12: Agent Loop & Session Infrastructure
**Goal**: Users can have persistent AI conversations with tool execution that stay coherent over long interactions
**Depends on**: Phase 11 (harness provides LLM routing and tool adapters)
**Requirements**: SESS-01, SESS-03, SESS-04
**Success Criteria** (what must be TRUE):
  1. User can start a conversation, send messages, and receive AI responses that use tools (file read, search, code execution) within the browser
  2. User can have a long conversation (50+ turns) without noticeable context degradation -- compression pipeline activates transparently
  3. User can close the browser, reopen it, and resume a previous session with full conversation history intact
  4. User can see tool executions and their results inline in the conversation stream
**Plans:** 3 plans

Plans:
- [ ] 12-01-PLAN.md — Backend foundation: Drizzle schema + custom MCP tools + session CRUD API
- [ ] 12-02-PLAN.md — Agent loop SSE bridge: SDK wrapper + stream bridge + streaming endpoint
- [ ] 12-03-PLAN.md — Frontend session UI: chat panel, tool display, artifact panel, sidebar integration

### Phase 13: Multi-Provider Routing Expansion
**Goal**: Users can route work to the right model based on task characteristics, including local Mac Mini models
**Depends on**: Phase 11 (harness router infrastructure)
**Requirements**: ROUT-01, ROUT-02, ROUT-03, ROUT-04
**Success Criteria** (what must be TRUE):
  1. User can send a task to GPT-Codex (GPT-5.4/5.2) and receive results through the same interface as Claude/Gemini
  2. User can run tasks on Mac Mini local models (Qwen3.5-35B-A3B, Gemma 4 26B-A4B) with empirically discovered capability boundaries
  3. User can see which provider/model was selected for a task and why (task-type routing rationale visible)
  4. Tasks are routed by type (ideation to frontier, scaffolding to local, review to Claude) not just failover order
**Plans:** 5/5 plans complete

Plans:
- [x] 13-01-PLAN.md — Codex provider (API + CLI subprocess) + registry + Gemma 4 model inference
- [x] 13-02-PLAN.md — MLX proxy package for Mac Mini local model serving
- [x] 13-03-PLAN.md — Task classifier + capability matrix + eval suite + router integration
- [x] 13-04-PLAN.md — Gap closure: Wire classifyTask into resolveModel routing path
- [x] 13-05-PLAN.md — Gap closure: Routing attribution UI (RoutingBadge, RoutingRationale, LocalModelStatus)


### Phase 14: Dashboard & Project State
**Goal**: Users can see the state of all their projects, infrastructure, and PR reviews from one screen
**Depends on**: Phase 12 (session UI shell provides the app frame)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, PREV-01
**Success Criteria** (what must be TRUE):
  1. User can view all projects with their GSD phase, git status, and uncommitted file counts on a single dashboard
  2. User can browse design docs from ~/.gstack/projects/ and see worklog carryover items with staleness indicators
  3. User can see Mac Mini service health, Tailscale Funnel endpoints, and deployment status at a glance
  4. User can distinguish active projects from stale ones (no recent activity, drifting uncommitted work)
  5. User can access the existing v1.0 PR review pipeline as a feature within the command center
**Plans:** 1/4 plans executed
**UI hint**: yes

Plans:
- [x] 14-01-PLAN.md — Shared schemas + projects API (filesystem scan, git status, staleness algorithm)
- [ ] 14-02-PLAN.md — Design docs, worklog carryover, and infra status API routes
- [ ] 14-03-PLAN.md — Dashboard frontend: project cards grid, infra panel, carryover, sidebar rewiring
- [ ] 14-04-PLAN.md — Cmd+K command palette + full dashboard visual verification

### Phase 15: Ideation Funnel & Autonomous GSD
**Goal**: Users can go from a raw idea to autonomous execution -- brainstorm in the browser, chain ideation skills, then launch one-click GSD with real-time progress
**Depends on**: Phase 12 (sessions), Phase 13 (routing), Phase 14 (dashboard)
**Requirements**: IDEA-01, IDEA-02, IDEA-03, IDEA-04, AUTO-01, AUTO-02, AUTO-03, AUTO-04, SESS-02
**Success Criteria** (what must be TRUE):
  1. User can launch an office-hours brainstorm from the browser with no repo -- just an idea and a conversation
  2. User can chain ideation skills (office-hours -> CEO review -> eng review -> design consultation) as a connected pipeline, with each stage building on prior output
  3. User can trigger one-click autonomous execution from ideation output and watch real-time visualization of phase progress, agent spawns, and commits
  4. User can respond to decision gates in the UI when autonomous execution needs human input, while discuss phase carries forward ideation context
  5. User can run multiple concurrent sessions as tabs, each scoped to a different project, and scaffold a new repo from ideation output when ready to build
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 12 -> 13 -> 14 -> 15

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & GitHub Integration | v1.0 | 3/3 | Complete | 2026-03-30 |
| 2. Pipeline Engine | v1.0 | 3/3 | Complete | 2026-03-30 |
| 3. Review Output & Signal Quality | v1.0 | 2/2 | Complete | 2026-03-31 |
| 4. Dashboard & Pipeline Visualization | v1.0 | 4/4 | Complete | 2026-03-31 |
| 5. Cross-Repo Intelligence | v1.0 | 2/2 | Complete | 2026-03-31 |
| 6. Onboarding & Quality Trends | v1.0 | 3/3 | Complete | 2026-03-31 |
| 7. Seam Cleanup | v1.1 | 1/1 | Complete | 2026-04-03 |
| 8. Harness Package Extraction | v1.1 | 2/2 | Complete | 2026-04-03 |
| 9. Model Failover Router | v1.1 | 2/2 | Complete | 2026-04-03 |
| 10. Tool Adapters & Skills | v1.1 | 2/2 | Complete | 2026-04-03 |
| 11. State Sync | v1.1 | 2/2 | Complete | 2026-04-03 |
| 12. Agent Loop & Session Infrastructure | v2.0 | 0/3 | Planned | - |
| 13. Multi-Provider Routing Expansion | v2.0 | 5/5 | Complete    | 2026-04-08 |
| 14. Dashboard & Project State | v2.0 | 1/4 | In Progress|  |
| 15. Ideation Funnel & Autonomous GSD | v2.0 | 0/0 | Not started | - |
