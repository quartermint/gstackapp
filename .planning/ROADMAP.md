# Roadmap: gstackapp

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-03-31)
- ✅ **v1.1 @gstackapp/harness** — Phases 7-11 (shipped 2026-04-03)
- 🚧 **v2.0 Mission Control 4.0 — The Cathedral** — Phases 16-20 (in progress)

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

### 🚧 v2.0 Mission Control 4.0 — The Cathedral (In Progress)

**Milestone Goal:** Transform gstackapp from a cognitive code review platform into a personal product operator with two user modes — Ryan's power dashboard and a simplified operator flow for non-technical users — powered by gbrain knowledge integration and an independent harness execution engine.

- [x] **Phase 16: Prerequisites & Stack Cleanup** - Resolve Phase 15 eng review debt, pass human UAT, update stack docs (gap closure in progress) (completed 2026-04-11)
- [x] **Phase 17: Auth & Harness Independence** - Multi-user auth with session isolation and web-triggered pipeline execution engine (completed 2026-04-11)
- [x] **Phase 18: Operator Mode** - Complete intake-to-handoff flow for non-technical users with decision gates and error handling (completed 2026-04-11)
- [ ] **Phase 19: gbrain Integration** - Knowledge-aware pipelines via MCP tool integration with async prefetch and graceful degradation
- [ ] **Phase 20: Ryan Power Dashboard** - Multi-project overview, pipeline topology, ideation workspace, and cross-repo intelligence

## Phase Details

### Phase 16: Prerequisites & Stack Cleanup
**Goal**: Clear the foundation gate so all v2.0 work builds on a stable, tested, accurately documented codebase
**Depends on**: Phase 15 (ideation pipeline)
**Requirements**: PRE-01, PRE-02, PRE-03
**Success Criteria** (what must be TRUE):
  1. All four Phase 15 eng review items (IDEA-05/06/07/08) are resolved and committed with passing tests
  2. All six human UAT test items in 15-HUMAN-UAT.md pass when exercised manually in the browser
  3. CLAUDE.md, PROJECT.md, and stack documentation accurately reflect the SQLite-to-Neon Postgres migration (no stale SQLite references in active docs)
**Plans:** 4/4 plans complete
Plans:
- [x] 16-01-PLAN.md — Fix autonomous SSE named-event bug, close IDEA-05/06/07/08
- [x] 16-02-PLAN.md — Execute 6 human UAT items in browser, document results
- [x] 16-03-PLAN.md — Update CLAUDE.md and PROJECT.md for Neon Postgres, remove db-init.ts
- [x] 16-04-PLAN.md — Gap closure: exercise 6 UAT items via headless browser (PRE-02)

### Phase 17: Auth & Harness Independence
**Goal**: Any user can authenticate and trigger a pipeline run from the web UI, with isolated sessions routed through the harness execution engine
**Depends on**: Phase 16
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, HRN-01, HRN-02, HRN-03, HRN-04, HRN-05
**Success Criteria** (what must be TRUE):
  1. A user on the Tailscale tailnet can access the dashboard and be recognized as their correct role (operator or admin) without additional login
  2. A user not on the tailnet can receive a magic link email via SendGrid, click it, and land in an authenticated session with the correct role
  3. Each authenticated user has isolated session history and audit trail — one user's activity does not appear in another's view
  4. A POST to /api/operator/request creates a pipeline run, the harness spawns an agent session with provider selection, and stage results stream back to the web UI via SSE in real time
  5. Decision gates pause the pipeline and render approval buttons in the web UI; user response resumes execution
**Plans:** 3/3 plans complete
Plans:
- [x] 17-01-PLAN.md — Dual-path auth: Tailscale auto-detect + magic link + role resolver + DB schema
- [x] 17-02-PLAN.md — Operator intake form, request history, login page, session-scoped API routes
- [x] 17-03-PLAN.md — Claude Code subprocess spawner, file watcher, SSE streaming, decision gates
**UI hint**: yes

### Phase 18: Operator Mode
**Goal**: A non-technical user can go from "I have an idea" to a verified, quality-checked result without opening a terminal or asking Ryan
**Depends on**: Phase 17
**Requirements**: OP-01, OP-02, OP-03, OP-04, OP-05, OP-06, OP-07, OP-08, OP-09, OP-10, OP-11
**Success Criteria** (what must be TRUE):
  1. An operator can fill out the intake form ("What do you need?" + "What does good look like?" + optional deadline), receive up to 5 clarification questions, and approve an execution brief before any work begins
  2. While the pipeline executes, the operator sees a non-technical progress visualization (thinking, planning, building, checking, done) that updates in real time
  3. On completion, the operator sees a plain-language verification report with pass/fail status and a description of what was built
  4. On error conditions (harness timeout, verification failure, ambiguous scope, provider exhaustion), the operator sees an appropriate plain-language message with actionable options (wait, escalate, request changes, retry later)
  5. Every decision, AI output, clarification answer, and verification result is visible in a timestamped audit trail
**Plans:** 4/4 plans complete
Plans:
- [x] 18-01-PLAN.md — State machine, clarification API, brief generation, schema extension + push
- [x] 18-02-PLAN.md — Timeout monitor, verification report reader, error handling infrastructure
- [x] 18-03-PLAN.md — Frontend: ClarificationThread, ExecutionBrief, ProgressBar, ErrorCard, VerificationReport, OperatorHome refactor
- [x] 18-04-PLAN.md — Audit trail tests, integration tests, human verification checkpoint
**UI hint**: yes

### Phase 19: gbrain Integration
**Goal**: Pipelines are knowledge-aware — they leverage 10,609 pages of compiled project/people/decision context to produce grounded, context-loaded outputs
**Depends on**: Phase 17 (harness independence for tool injection), Phase 18 (operator pipeline to integrate with)
**Requirements**: GB-01, GB-02, GB-03, GB-04
**Success Criteria** (what must be TRUE):
  1. The harness can call gbrain MCP tools (gbrain_search, gbrain_entity, gbrain_related) and receive structured results
  2. gbrain queries run as async prefetch at pipeline start, cached per pipeline run in Postgres, without blocking agent execution
  3. For a request naming a known project or person, the clarification stage includes at least one context-loaded question derived from gbrain (verifiable in the audit trail)
  4. If the gbrain MCP server is unavailable, the pipeline runs successfully with a visible "Running without knowledge context" indicator
**Plans**: TBD

### Phase 20: Ryan Power Dashboard
**Goal**: Ryan can manage all quartermint projects from one surface — see status, trigger pipelines, query knowledge, and spot cross-repo patterns without opening a terminal
**Depends on**: Phase 17 (auth for admin role), Phase 18 (operator pipeline infrastructure), Phase 19 (gbrain for knowledge console)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):
  1. Ryan sees a multi-project overview of all quartermint repos with status, last activity, and health scores on the home screen
  2. The pipeline topology view shows 5-stage reviews running across repos with real-time status updates
  3. The ideation workspace visualizes the office-hours to CEO review to eng review to execution flow
  4. The gbrain console allows querying knowledge, viewing entity relationships, and reviewing compiled truth
  5. Cross-repo intelligence surfaces "Seen in your other repos" alerts and pattern detection across the quartermint ecosystem
**Plans**: TBD
**UI hint**: yes

## Progress

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
| 16. Prerequisites & Stack Cleanup | v2.0 | 4/4 | Complete    | 2026-04-11 |
| 17. Auth & Harness Independence | v2.0 | 3/3 | Complete    | 2026-04-11 |
| 18. Operator Mode | v2.0 | 4/4 | Complete    | 2026-04-11 |
| 19. gbrain Integration | v2.0 | 0/? | Not started | - |
| 20. Ryan Power Dashboard | v2.0 | 0/? | Not started | - |
