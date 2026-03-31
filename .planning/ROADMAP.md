# Roadmap: gstackapp

## Overview

gstackapp delivers a cognitive code review platform in six phases following a strict dependency chain: GitHub App integration and database schema first (nothing works without auth and persistence), then the 5-stage pipeline engine (the product IS the pipeline), then PR comment output with signal quality filtering (the primary user-facing surface), then the real-time dashboard with pipeline visualization (the hero UX that makes the review process visible), then cross-repo intelligence (the compounding moat), and finally onboarding and quality trends (polish that requires accumulated data and stable core functionality).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & GitHub Integration** - Monorepo scaffold, database schema, GitHub App installation and webhook handling
- [ ] **Phase 2: Pipeline Engine** - 5-stage parallel Claude tool_use pipeline with sandboxed file access
- [ ] **Phase 3: Review Output & Signal Quality** - PR comment rendering, incremental updates, three-tier noise filtering, feedback mechanism
- [ ] **Phase 4: Dashboard & Pipeline Visualization** - Real-time pipeline hero view, PR feed, SSE streaming, DESIGN.md aesthetic
- [ ] **Phase 5: Cross-Repo Intelligence** - Embedding query layer, "Seen in your other repos" callouts in comments and dashboard
- [ ] **Phase 6: Onboarding & Quality Trends** - Guided setup wizard, per-repo quality trend charts, finding frequency visualization

## Phase Details

### Phase 1: Foundation & GitHub Integration
**Goal**: A working GitHub App that receives PR webhooks, persists installations/repos, and provides authenticated API access -- the bedrock everything else builds on
**Depends on**: Nothing (first phase)
**Requirements**: GHUB-01, GHUB-02, GHUB-03, GHUB-04, GHUB-05
**Success Criteria** (what must be TRUE):
  1. User can install the GitHub App on their account, select repositories, and see them persisted in the database
  2. Opening or force-pushing to a PR on a connected repo triggers a webhook that the app receives and acknowledges within 10 seconds
  3. The app can authenticate as the GitHub App installation and make API calls (create comments, read PRs) using auto-refreshed tokens
  4. Duplicate webhook deliveries (same X-GitHub-Delivery) are silently ignored without errors
  5. The monorepo builds, tests pass, and the dev server starts with `npm run dev`
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold, shared Zod schemas, Drizzle database schema
- [x] 01-02-PLAN.md — GitHub auth factory, webhook handler, event handlers, Hono entry
- [x] 01-03-PLAN.md — Test infrastructure, webhook/handler/idempotency tests

### Phase 2: Pipeline Engine
**Goal**: Every PR webhook triggers a 5-stage cognitive review pipeline that clones the repo, runs all stages in parallel via Claude tool_use with sandboxed file access, and produces structured findings
**Depends on**: Phase 1
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, PIPE-07, PIPE-08, PIPE-09
**Success Criteria** (what must be TRUE):
  1. A PR webhook triggers all 5 stages (CEO, Eng, Design, QA, Security) executing in parallel, completing a typical review in under 5 minutes
  2. Each stage produces a Zod-validated StageResult with a PASS, FLAG, BLOCK, or SKIP verdict and typed findings
  3. The AI can only read files within the cloned repository -- symlink traversal and path escape attempts are blocked
  4. Pipeline status is persisted as RUNNING before stages begin, enabling crash recovery detection
  5. Each stage has its own dedicated prompt file and runs an independent Claude tool_use conversation
**Plans:** 3 plans

Plans:
- [ ] 02-01-PLAN.md — Sandbox file tools, clone manager, smart stage filter, infrastructure tests
- [x] 02-02-PLAN.md — 5 stage prompt files (CEO, Eng, Design, QA, Security) with structured output format
- [ ] 02-03-PLAN.md — Stage runner (Claude tool_use loop), pipeline orchestrator, handler wiring, integration tests

### Phase 3: Review Output & Signal Quality
**Goal**: The pipeline's findings are rendered as a structured, progressively-updated PR comment with noise filtered through three-tier classification and user feedback on individual findings
**Depends on**: Phase 2
**Requirements**: REVW-01, REVW-02, REVW-03, REVW-04, REVW-05, REVW-06, SGNL-01, SGNL-02, SGNL-03
**Success Criteria** (what must be TRUE):
  1. A single PR comment is created (or found and updated) with findings from all 5 stages, updating in-place as each stage completes
  2. Inline review comments appear on specific diff lines via the GitHub Review API
  3. Findings are classified into three tiers (critical / notable / minor) with only high-signal findings prominent in the comment
  4. User can give thumbs up/down feedback on individual findings, and that feedback is stored for future prompt improvement
  5. Concurrent stage completions do not corrupt the PR comment (per-PR mutex prevents races)
**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md — Schema extension, severity filter, comment renderer, comment manager with per-PR mutex
- [x] 03-02-PLAN.md — Inline review comments on diff lines, feedback API endpoint, reaction polling

### Phase 4: Dashboard & Pipeline Visualization
**Goal**: Users see a real-time operations-room dashboard with the pipeline topology as the hero view, a reverse-chronological PR feed, and live stage progress streamed via SSE
**Depends on**: Phase 3
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10
**Success Criteria** (what must be TRUE):
  1. The pipeline visualization occupies 60%+ of viewport height, showing 5 stages as connected flow nodes with spectral identity colors
  2. When a pipeline is running, active stages pulse and completed stages reveal with a dim-to-bright animation -- all streamed in real-time via SSE
  3. A reverse-chronological feed shows all PR reviews across all connected repos, and clicking a PR shows findings grouped by stage
  4. The dashboard loads as the landing page (no auth gate), renders correctly at 1024px+ width, and follows DESIGN.md dark-mode aesthetic
**Plans:** 4 plans

Plans:
- [x] 04-01-PLAN.md — Backend API routes (pipelines, repos, SSE), event bus, orchestrator emission, AppType export
- [x] 04-02-PLAN.md — Frontend scaffold (Vite, React, Tailwind theme, Hono RPC client, SSE hooks, app shell)
- [x] 04-03-PLAN.md — Pipeline hero visualization (topology, stage nodes, connectors, animations)
- [ ] 04-04-PLAN.md — PR feed, PR detail view, finding cards, feedback UI

### Phase 5: Cross-Repo Intelligence
**Goal**: Accumulated finding embeddings power "Seen in your other repos" callouts that surface cross-project patterns in both PR comments and the dashboard
**Depends on**: Phase 4
**Requirements**: XREP-01, XREP-02, XREP-03
**Success Criteria** (what must be TRUE):
  1. All findings are embedded via sqlite-vec on pipeline completion
  2. When a finding matches patterns seen in other repos (above similarity threshold), a "Seen in your other repos" callout appears in the PR comment
  3. Cross-repo insights are visible in the dashboard PR detail view alongside per-stage findings
**Plans:** 2 plans

Plans:
- [x] 05-01-PLAN.md — Embedding infrastructure (Voyage AI client, sqlite-vec vec0 table, KNN search), orchestrator wiring
- [ ] 05-02-PLAN.md — Cross-repo callouts in PR comments, dashboard CrossRepoInsight component, live bottom strip

### Phase 6: Onboarding & Quality Trends
**Goal**: First-time users get a guided setup wizard that walks them from GitHub App installation to their first real review, and returning users see quality trend charts that show how their repos are improving over time
**Depends on**: Phase 5
**Requirements**: ONBD-01, ONBD-02, ONBD-03, TRND-01, TRND-02, TRND-03
**Success Criteria** (what must be TRUE):
  1. When no repos are connected, the app surfaces an onboarding wizard that walks through: install GitHub App, select repos, trigger first review
  2. The first review experience shows the pipeline running in real-time with actual PR data (not dummy data)
  3. Per-repo quality scores and per-stage pass/flag/block rates are visualized as trend charts on the dashboard
  4. Finding frequency trends are visible, showing how review patterns change over time
**Plans:** 3 plans
**UI hint**: yes

Plans:
- [x] 06-01-PLAN.md — Backend API: quality scoring function, onboarding status endpoint, trend aggregation endpoints
- [ ] 06-02-PLAN.md — Onboarding wizard UI: guided setup flow with auto-advancing polling and real pipeline preview
- [ ] 06-03-PLAN.md — Quality trend charts: Recharts line/area charts with DESIGN.md dark theme and sidebar navigation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & GitHub Integration | 3/3 | Complete | 2026-03-30 |
| 2. Pipeline Engine | 0/3 | Planned | - |
| 3. Review Output & Signal Quality | 1/2 | In Progress | - |
| 4. Dashboard & Pipeline Visualization | 1/4 | In Progress | - |
| 5. Cross-Repo Intelligence | 1/2 | In Progress | - |
| 6. Onboarding & Quality Trends | 1/3 | In Progress | - |
