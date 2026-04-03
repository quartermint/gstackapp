# Roadmap: gstackapp

## Milestones

- :white_check_mark: **v1.0 MVP** - Phases 1-6 (shipped 2026-03-31)
- :construction: **v1.1 @gstackapp/harness** - Phases 7-11 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-6) - SHIPPED 2026-03-31</summary>

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & GitHub Integration** - Monorepo scaffold, database schema, GitHub App installation and webhook handling
- [x] **Phase 2: Pipeline Engine** - 5-stage parallel Claude tool_use pipeline with sandboxed file access
- [x] **Phase 3: Review Output & Signal Quality** - PR comment rendering, incremental updates, three-tier noise filtering, feedback mechanism
- [x] **Phase 4: Dashboard & Pipeline Visualization** - Real-time pipeline hero view, PR feed, SSE streaming, DESIGN.md aesthetic
- [x] **Phase 5: Cross-Repo Intelligence** - Embedding query layer, "Seen in your other repos" callouts in comments and dashboard
- [x] **Phase 6: Onboarding & Quality Trends** - Guided setup wizard, per-repo quality trend charts, finding frequency visualization

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
- [x] 01-01-PLAN.md -- Monorepo scaffold, shared Zod schemas, Drizzle database schema
- [x] 01-02-PLAN.md -- GitHub auth factory, webhook handler, event handlers, Hono entry
- [x] 01-03-PLAN.md -- Test infrastructure, webhook/handler/idempotency tests

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
- [x] 02-01-PLAN.md -- Sandbox file tools, clone manager, smart stage filter, infrastructure tests
- [x] 02-02-PLAN.md -- 5 stage prompt files (CEO, Eng, Design, QA, Security) with structured output format
- [x] 02-03-PLAN.md -- Stage runner (Claude tool_use loop), pipeline orchestrator, handler wiring, integration tests

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
- [x] 03-01-PLAN.md -- Schema extension, severity filter, comment renderer, comment manager with per-PR mutex
- [x] 03-02-PLAN.md -- Inline review comments on diff lines, feedback API endpoint, reaction polling

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
- [x] 04-01-PLAN.md -- Backend API routes (pipelines, repos, SSE), event bus, orchestrator emission, AppType export
- [x] 04-02-PLAN.md -- Frontend scaffold (Vite, React, Tailwind theme, Hono RPC client, SSE hooks, app shell)
- [x] 04-03-PLAN.md -- Pipeline hero visualization (topology, stage nodes, connectors, animations)
- [x] 04-04-PLAN.md -- PR feed, PR detail view, finding cards, feedback UI

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
- [x] 05-01-PLAN.md -- Embedding infrastructure (Voyage AI client, sqlite-vec vec0 table, KNN search), orchestrator wiring
- [x] 05-02-PLAN.md -- Cross-repo callouts in PR comments, dashboard CrossRepoInsight component, live bottom strip

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
- [x] 06-01-PLAN.md -- Backend API: quality scoring function, onboarding status endpoint, trend aggregation endpoints
- [x] 06-02-PLAN.md -- Onboarding wizard UI: guided setup flow with auto-advancing polling and real pipeline preview
- [x] 06-03-PLAN.md -- Quality trend charts: Recharts line/area charts with DESIGN.md dark theme and sidebar navigation

</details>

### v1.1 @gstackapp/harness (In Progress)

**Milestone Goal:** Extract provider abstraction into independently published npm package with automatic model failover, portable tool adapters, and cross-device state sync.

- [x] **Phase 7: Seam Cleanup** - Fix Anthropic type leak and MONOREPO_ROOT coupling to prepare for extraction
- [ ] **Phase 8: Harness Package Extraction** - Extract @gstackapp/harness as publishable npm workspace with CLI entry point
- [ ] **Phase 9: Model Failover Router** - 3-layer routing (predictive + proactive + reactive) with configurable fallback policies
- [x] **Phase 10: Tool Adapters & Skills** - Cross-harness tool portability and SkillManifest registry/runner (completed 2026-04-03)
- [ ] **Phase 11: State Sync** - Rsync-over-Tailscale sync for memory and GSD state with lock file conflict guard

## Phase Details

### Phase 7: Seam Cleanup
**Goal**: The existing codebase has clean provider-agnostic interfaces -- no Anthropic SDK types leak past module boundaries, and config loads without monorepo path assumptions
**Depends on**: Phase 6 (v1.0 complete)
**Requirements**: SEAM-01, SEAM-02
**Success Criteria** (what must be TRUE):
  1. tools.ts createSandboxTools() returns a provider-agnostic ToolDefinition[] type that compiles without importing @anthropic-ai/sdk
  2. config.ts resolves environment variables and paths without MONOREPO_ROOT, working correctly both inside the monorepo and as a standalone package
**Plans:** 1 plan

Plans:
- [ ] 07-01-PLAN.md -- Remove Anthropic type leak from tools.ts, replace MONOREPO_ROOT with findProjectRoot() in config.ts

### Phase 8: Harness Package Extraction
**Goal**: The provider abstraction, model profiles, and CLI live in packages/harness/ as an independently publishable npm package that gstackapp imports with zero provider duplication
**Depends on**: Phase 7
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04, PKG-05
**Success Criteria** (what must be TRUE):
  1. packages/harness/ exists as a proper npm workspace with its own package.json, tsconfig, and exports map
  2. LLMProvider interface and all provider implementations (Claude, Gemini, Qwen) live in the harness package, not duplicated in api
  3. `npx @gstackapp/harness --help` works standalone, showing available commands and provider status
  4. gstackapp api package imports from @gstackapp/harness and all existing pipeline tests still pass
  5. `npm pack` in packages/harness/ produces a valid tarball with correct exports and no monorepo-internal dependencies
**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md -- Create harness package scaffold, move provider code + tests + CLI
- [x] 08-02-PLAN.md -- Rewire api imports to @gstackapp/harness, delete old providers, verify full suite

### Phase 9: Model Failover Router
**Goal**: The harness automatically routes LLM requests across providers (Claude -> Gemini -> Qwen) using predictive burn rate analysis, proactive API polling, and reactive error catching -- so billing caps never kill a workflow
**Depends on**: Phase 8
**Requirements**: RTR-01, RTR-02, RTR-03, RTR-04, RTR-05, RTR-06, RTR-07, RTR-08, RTR-09
**Success Criteria** (what must be TRUE):
  1. When Claude returns 429/billing error, the router automatically retries the request on the next provider in the chain without user intervention
  2. Token burn rate tracking predicts cap exhaustion and proactively switches providers 30 minutes before projected cap, with prediction accuracy logged
  3. The router NEVER switches providers mid-tool-loop -- failover only happens between conversations, preserving tool call ID integrity
  4. Fallback policy is configurable per-context: gstackapp PR reviews use 'none' (Claude-only), harness standalone uses 'quality-aware'
  5. Every routing decision is logged with structured observability: provider selected, reason, burn rate, prediction accuracy
**Plans:** 2 plans

Plans:
- [x] 09-01-PLAN.md -- Router infrastructure: error types, config, cross-SDK error detection, DB schema, usage buffer
- [x] 09-02-PLAN.md -- ModelRouter class with 3-layer routing, proactive poller, registry wiring, observability


### Phase 10: Tool Adapters & Skills
**Goal**: Skills are portable across AI harnesses -- a single SkillManifest JSON describes what tools a skill needs, and adapters translate tool names/schemas so the same skill runs on Claude Code, OpenCode, or Codex
**Depends on**: Phase 8
**Requirements**: ADPT-01, ADPT-02, ADPT-03, ADPT-04, ADPT-05
**Success Criteria** (what must be TRUE):
  1. Tool adapter interface normalizes tool names and schemas so the same skill definition works across Claude Code, OpenCode, and Codex harnesses
  2. SkillManifest Zod schema validates .skill.json files with all required fields (id, name, tools, prompt, output schema, minimum model, capabilities)
  3. Skill registry discovers and loads manifests from local directories and remote URLs
  4. Skill runner executes any registered skill on any LLMProvider, using the tool adapter to translate tool calls for the target harness
**Plans:** 2/2 plans complete

Plans:
- [x] 10-01-PLAN.md -- ToolAdapter interface + 3 adapters, SkillManifest schema, SkillRegistry with local + remote loading
- [x] 10-02-PLAN.md -- Skill runner with tool_use loop + adapter translation, barrel exports, CLI run-skill command

### Phase 11: State Sync
**Goal**: Memory markdown files and GSD .planning/ state sync reliably between laptop and Mac Mini over Tailscale, with lock file protection against concurrent writes and explicit exclusion of binary/database files
**Depends on**: Phase 8
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04
**Success Criteria** (what must be TRUE):
  1. Running sync pushes memory markdown files from laptop to Mac Mini (and vice versa) over Tailscale via rsync
  2. GSD .planning/ directories sync between devices, enabling session continuity across machines
  3. A lock file prevents concurrent writes during active sync -- if a sync is in progress, a second sync attempt waits or fails gracefully
  4. SQLite databases and binary files are never included in sync (explicit rsync exclude rules)
**Plans:** 2 plans

Plans:
- [ ] 11-01-PLAN.md -- Rsync transport with Tailscale, lock file mechanism, exclude rules
- [ ] 11-02-PLAN.md -- CLI sync command, bidirectional sync, integration tests

## Progress

**Execution Order:**
- v1.0: 1 -> 2 -> 3 -> 4 -> 5 -> 6 (sequential)
- v1.1: 7 -> 8 -> {9, 10, 11} (9/10/11 parallel after 8 merges)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & GitHub Integration | v1.0 | 3/3 | Complete | 2026-03-30 |
| 2. Pipeline Engine | v1.0 | 3/3 | Complete | 2026-03-30 |
| 3. Review Output & Signal Quality | v1.0 | 2/2 | Complete | 2026-03-31 |
| 4. Dashboard & Pipeline Visualization | v1.0 | 4/4 | Complete | 2026-03-31 |
| 5. Cross-Repo Intelligence | v1.0 | 2/2 | Complete | 2026-03-31 |
| 6. Onboarding & Quality Trends | v1.0 | 3/3 | Complete | 2026-03-31 |
| 7. Seam Cleanup | v1.1 | 0/1 | Not started | - |
| 8. Harness Package Extraction | v1.1 | 0/2 | Not started | - |
| 9. Model Failover Router | v1.1 | 0/2 | Not started | - |
| 10. Tool Adapters & Skills | v1.1 | 2/2 | Complete   | 2026-04-03 |
| 11. State Sync | v1.1 | 0/2 | Not started | - |
