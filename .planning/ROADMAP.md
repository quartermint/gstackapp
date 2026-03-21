# Roadmap: Mission Control

## Milestones

- v1.0 MVP (Phases 1-5) - Shipped 2026-03-10
- v1.1 Git Health Intelligence + MCP (Phases 6-10) - Shipped 2026-03-15
- v1.2 Session Orchestrator + Local LLM Gateway (Phases 11-15) - Shipped 2026-03-16
- v1.3 Auto-Discovery + Session Enrichment + CLI (Phases 16-22) - Shipped 2026-03-17
- **v1.4 Cross-Project Intelligence + iOS Companion + Knowledge Unification** (Phases 23-31) - In Progress

## Phases

<details>
<summary>v1.0 MVP (Phases 1-5) - SHIPPED 2026-03-10</summary>
See .planning/milestones/v1.0/
</details>

<details>
<summary>v1.1 Git Health Intelligence + MCP (Phases 6-10) - SHIPPED 2026-03-15</summary>
See .planning/milestones/v1.1/
</details>

<details>
<summary>v1.2 Session Orchestrator + Local LLM Gateway (Phases 11-15) - SHIPPED 2026-03-16</summary>
See .planning/milestones/v1.2/
</details>

<details>
<summary>v1.3 Auto-Discovery + Session Enrichment + CLI (Phases 16-22) - SHIPPED 2026-03-17</summary>
See .planning/milestones/v1.3/
</details>

### v1.4 Cross-Project Intelligence + iOS Companion + Knowledge Unification

**Milestone Goal:** Transform MC from independent project tracking to connected intelligence — understanding project relationships, capturing from any device, and bridging knowledge across machines and Claude Code sessions.

- [ ] **Phase 23: Config Foundation** - Extend config schema and health check types to unlock all downstream pillars
- [ ] **Phase 24: Knowledge Aggregation** - Aggregate CLAUDE.md content across all projects on both machines
- [ ] **Phase 25: Dependency Intelligence** - Detect dependency drift and commit impact across related projects
- [ ] **Phase 26: Convention Enforcement** - Config-driven anti-pattern scanning of CLAUDE.md files
- [ ] **Phase 27: MCP Knowledge Tools + Session Enrichment** - Expose knowledge, conventions, and cross-project search via MCP
- [ ] **Phase 28: Dashboard Highlight Mode** - Surface what changed since last visit
- [ ] **Phase 29: iOS Companion Core** - Share sheet capture and offline queue with foreground sync
- [ ] **Phase 30: iOS Extended** - Widget capture and voice recording with transcription
- [ ] **Phase 31: Relationship Graph** - Interactive D3-force project dependency visualization

## Phase Details

### Phase 23: Config Foundation
**Goal**: All config schema extensions, new health check types, and the idempotency key preparatory change are in place so every downstream phase can build on stable foundations
**Depends on**: Phase 22 (v1.3 complete)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, INTEL-01
**Success Criteria** (what must be TRUE):
  1. User can add `dependsOn: ["project-a", "project-b"]` to any project entry in mc.config.json and MC loads without error
  2. MC rejects circular dependency declarations at config load time with a clear error message naming the cycle
  3. API captures endpoint accepts an `Idempotency-Key` header and silently deduplicates repeated submissions
  4. Health findings table accepts `dependency_impact`, `convention_violation`, and `stale_knowledge` check types without migration errors
**Plans:** 2 plans
Plans:
- [ ] 23-01-PLAN.md -- Config schema dependsOn + cycle detection + health enum extension
- [ ] 23-02-PLAN.md -- Idempotency key support on captures endpoint

### Phase 24: Knowledge Aggregation
**Goal**: MC knows what every project says about itself by aggregating CLAUDE.md content from all local and Mac Mini projects
**Depends on**: Phase 23
**Requirements**: KNOW-01, KNOW-02, KNOW-03, KNOW-11
**Success Criteria** (what must be TRUE):
  1. User can query `/api/knowledge/:slug` and get the parsed CLAUDE.md content for any registered project
  2. CLAUDE.md content is cached by content hash — re-scanning an unchanged file results in zero database writes
  3. Knowledge aggregation runs on a separate hourly timer and never delays the 5-minute project scan cycle
  4. SSH failure for Mac Mini projects degrades gracefully (serves cached content, no errors in dashboard)
  5. Projects with stale CLAUDE.md (>30 days old, >10 commits since update) surface as `stale_knowledge` health findings
**Plans**: TBD

### Phase 25: Dependency Intelligence
**Goal**: MC detects when dependency projects have changes the dependent hasn't consumed, surfacing drift and impact as health findings
**Depends on**: Phase 23 (config schema), Phase 24 (scan cycle hook point)
**Requirements**: INTEL-02, INTEL-03, INTEL-04, INTEL-05, INTEL-06
**Success Criteria** (what must be TRUE):
  1. Project cards display dependency badges showing which projects each depends on
  2. When a dependency project has unpulled commits, a `dependency_impact` health finding appears on the dependent project
  3. Dependency drift findings escalate severity based on age (info at detection, warning after 24h, critical after 7d)
  4. Cross-machine reconciliation continuously detects unpushed commits, diverged copies, and stale services across MacBook and Mac Mini
  5. Commit impact alerts fire on dependent projects when a dependency pushes new commits
**Plans**: TBD

### Phase 26: Convention Enforcement
**Goal**: MC scans CLAUDE.md files for config-driven anti-patterns and surfaces violations as health findings with zero false positives
**Depends on**: Phase 24 (reads CLAUDE.md from knowledge cache)
**Requirements**: KNOW-04, KNOW-05, KNOW-06
**Success Criteria** (what must be TRUE):
  1. User can define anti-pattern rules in mc.config.json with pattern, description, and negative context for suppression
  2. Convention scanner detects anti-patterns in CLAUDE.md files and surfaces them as `convention_violation` health findings
  3. All launch rules (5 or fewer) produce zero false positives when run against every existing project's CLAUDE.md
  4. Per-project convention overrides allow suppressing specific rules where the violation is intentional
**Plans**: TBD

### Phase 27: MCP Knowledge Tools + Session Enrichment
**Goal**: Claude Code sessions can query project knowledge, check conventions, and search across all project documentation via MCP tools
**Depends on**: Phase 24, Phase 25, Phase 26 (all API endpoints must exist)
**Requirements**: KNOW-07, KNOW-08, KNOW-09, KNOW-10
**Success Criteria** (what must be TRUE):
  1. MCP `project_knowledge` tool returns aggregated CLAUDE.md content for a given project
  2. MCP `convention_check` tool returns active conventions and any violations for a project
  3. MCP `cross_project_search` tool searches across all project knowledge and returns matching results
  4. Claude Code session startup banner includes project knowledge summary (related projects, recent decisions, active conventions)
**Plans**: TBD

### Phase 28: Dashboard Highlight Mode
**Goal**: User opens MC each morning and instantly sees which projects changed since their last visit, without scrolling or clicking
**Depends on**: Phase 23 (no specific dependency on knowledge/convention phases)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04
**Success Criteria** (what must be TRUE):
  1. Server stores a last-visit timestamp per client via API endpoint (not localStorage-only)
  2. Projects with activity since last visit float to the top of their group with a visual highlight
  3. Dashboard shows a summary count ("4 projects changed since yesterday") visible without scrolling
  4. Highlight treatment is visually distinct but does not conflict with existing health dots, convergence badges, or discovery popovers
**Plans**: TBD

### Phase 29: iOS Companion Core
**Goal**: User can capture text and links from any iOS app and have them sync to Mission Control automatically when the app is opened
**Depends on**: Phase 23 (idempotency keys on captures endpoint)
**Requirements**: IOS-01, IOS-02, IOS-07, IOS-08, IOS-09, IOS-10, IOS-11, IOS-12, IOS-13
**Success Criteria** (what must be TRUE):
  1. User can share text or links from any iOS app via the share sheet and the capture is queued offline
  2. Share sheet extension operates within 120MB memory ceiling (no networking, no heavy frameworks in extension)
  3. Captures sync automatically when the main app comes to foreground, with retry logic and idempotency
  4. User sees sync status in-app ("3 captures pending sync") with clear indication of offline/online state
  5. User can view project list with health dots, recent captures, and risk summary in native SwiftUI
**Plans**: TBD

### Phase 30: iOS Extended
**Goal**: User can capture thoughts in 3 taps via home screen widget and record voice captures with on-device transcription
**Depends on**: Phase 29 (offline queue and sync infrastructure)
**Requirements**: IOS-03, IOS-04, IOS-05, IOS-06
**Success Criteria** (what must be TRUE):
  1. User can tap the home screen widget, type or dictate, and send a capture in 3 taps
  2. Widget writes to shared offline queue within the 3-second WidgetKit execution budget
  3. User can record a voice capture with no time limit, with visible elapsed timer and waveform; transcription chunked in 60s segments
  4. Voice captures store both the transcription text and the original audio file (.m4a)
**Plans**: TBD

### Phase 31: Relationship Graph
**Goal**: User can visualize the entire project ecosystem as an interactive force-directed graph showing dependency connections
**Depends on**: Phase 25 (dependency data must exist)
**Requirements**: INTEL-07, INTEL-08
**Success Criteria** (what must be TRUE):
  1. User can open an interactive project relationship graph showing all projects and their dependency connections
  2. Graph is force-directed using d3-force with nodes colored by host and health status
  3. Graph is lazy-loaded and code-split — d3-force is not in the main dashboard bundle
**Plans**: TBD

## Progress

**Execution Order:**
Phases 23-31 execute sequentially with noted parallelization opportunities:
- Phase 25 and 26 can run in parallel (both depend on 24, not each other)
- Phase 28 can run in parallel with 25-27 (independent of knowledge/convention chain)
- Phase 29 can start after Phase 23 (independent of server-side intelligence phases)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 23. Config Foundation | v1.4 | 0/2 | Planning | - |
| 24. Knowledge Aggregation | v1.4 | 0/? | Not started | - |
| 25. Dependency Intelligence | v1.4 | 0/? | Not started | - |
| 26. Convention Enforcement | v1.4 | 0/? | Not started | - |
| 27. MCP Knowledge Tools + Session Enrichment | v1.4 | 0/? | Not started | - |
| 28. Dashboard Highlight Mode | v1.4 | 0/? | Not started | - |
| 29. iOS Companion Core | v1.4 | 0/? | Not started | - |
| 30. iOS Extended | v1.4 | 0/? | Not started | - |
| 31. Relationship Graph | v1.4 | 0/? | Not started | - |
