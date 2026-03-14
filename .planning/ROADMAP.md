# Roadmap: Mission Control

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-03-10)
- 🚧 **v1.1 Git Health Intelligence + MCP** — Phases 6-10 (in progress)

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

### v1.1 Git Health Intelligence + MCP

**Milestone Goal:** Surface remote sync health, multi-host copy divergence, and risk-based intelligence across the dashboard — plus expose Mission Control as an MCP server replacing portfolio-dashboard.

- [ ] **Phase 6: Data Foundation** - Health and copy tables, upsert semantics, shared schemas
- [ ] **Phase 7: Git Health Engine** - 7 health checks, scanner extension, multi-host copy discovery and divergence
- [ ] **Phase 8: Health API & Events** - API endpoints exposing health data, SSE events, scan-cycle tracking
- [ ] **Phase 9: Dashboard Intelligence** - Risk feed, sprint timeline, health dots on project cards
- [ ] **Phase 10: MCP Server & Portfolio-Dashboard Deprecation** - MCP package with 4 tools, config migration, archive

## Phase Details

### Phase 6: Data Foundation
**Goal**: Health findings and multi-host copy data can be persisted and queried with correct upsert semantics
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: HLTH-09, HLTH-10, COPY-02
**Success Criteria** (what must be TRUE):
  1. Health findings persist across scan cycles with `detectedAt` timestamps preserved on upsert (not reset)
  2. GitHub-only projects (no local clone) are represented as "unmonitored" with null health score in the data layer
  3. Config file supports explicit multi-host project entries alongside existing single-host format without breaking current projects
  4. Shared Zod schemas validate health finding, copy, and risk-level types end-to-end (API responses match DB queries)
**Plans**: 2 plans

Plans:
- [ ] 06-01-PLAN.md — Shared Zod schemas, Drizzle tables, migration, config extension
- [ ] 06-02-PLAN.md — TDD query functions (health upsert, copies, config tests)

### Phase 7: Git Health Engine
**Goal**: The scanner produces accurate health findings for every project across both hosts, with correct severity scoring and multi-host divergence detection
**Depends on**: Phase 6
**Requirements**: HLTH-01, HLTH-02, HLTH-03, HLTH-04, HLTH-05, HLTH-06, HLTH-07, HLTH-08, COPY-01, COPY-03, COPY-04
**Success Criteria** (what must be TRUE):
  1. Running a scan produces health findings for each local project: unpushed commits, missing remotes, broken tracking, deleted remote branches, unpulled commits, and dirty working tree age — each with correct severity level
  2. Public repos escalate unpushed severity by one tier (e.g., 1-5 unpushed on a public repo = critical instead of warning)
  3. Every scanned project has a computed health score (0-100) and risk level (healthy/warning/critical) derived from its worst active finding
  4. Projects cloned on both MacBook and Mac Mini are auto-discovered by matching normalized remote URLs, and diverged copies (different HEAD, no ancestry) are flagged
  5. Per-copy freshness is tracked, and stale SSH data (Mac Mini unreachable) degrades findings gracefully instead of producing false alerts
**Plans**: 3 plans

Plans:
- [ ] 07-01-PLAN.md — TDD pure health check functions, URL normalization, health score computation
- [ ] 07-02-PLAN.md — Scanner extension: health data collection, SSH batch, multi-copy normalization, copy upsert
- [ ] 07-03-PLAN.md — Post-scan orchestration: finding persistence, copy divergence detection, event emission

### Phase 8: Health API & Events
**Goal**: All health, risk, copy, and timeline data is available through typed API endpoints with real-time SSE updates
**Depends on**: Phase 7
**Requirements**: RISK-04, RISK-05
**Success Criteria** (what must be TRUE):
  1. API endpoints return health check listings, risk summaries filtered by severity, copy status, and sprint timeline data — all consumable by both dashboard and MCP
  2. SSE events fire when health state changes after a scan cycle, enabling real-time UI updates without polling
  3. Findings detected in the current scan cycle are distinguishable as "new" in API responses (enabling RISK-05 badge display)
  4. Active risk count is available as a single API value for browser title integration (enabling RISK-04)
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

### Phase 9: Dashboard Intelligence
**Goal**: Opening Mission Control immediately shows what is at risk, what you have been working on, and which projects need attention — without clicking anything
**Depends on**: Phase 8
**Requirements**: RISK-01, RISK-02, RISK-03, TMLN-01, TMLN-02, TMLN-03, HDOT-01, HDOT-02, HDOT-03
**Success Criteria** (what must be TRUE):
  1. A risk feed above the departure board shows severity-grouped cards (critical first) with project name, problem description, duration, and action hint — cards disappear only when the underlying issue resolves
  2. A horizontal swimlane timeline replaces the heatmap, showing project activity bars with commit density over 12 weeks, with the currently-focused project highlighted
  3. Hovering a timeline bar shows commit count and date range; clicking navigates to the project on the departure board
  4. Each project card shows a green/amber/red health dot reflecting its worst active finding, with multi-copy divergence shown as a split dot
  5. Clicking a health dot expands an inline findings panel (same expandable pattern as "Previously On")
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD
- [ ] 09-03: TBD

### Phase 10: MCP Server & Portfolio-Dashboard Deprecation
**Goal**: Claude Code sessions have full access to Mission Control project health and status via MCP tools, and portfolio-dashboard is retired
**Depends on**: Phase 9 (validated data pipeline)
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, MIGR-01, MIGR-02, MIGR-03
**Success Criteria** (what must be TRUE):
  1. A standalone `@mission-control/mcp` package runs via stdio transport and connects to Claude Code without errors
  2. Four MCP tools (`project_health`, `project_risks`, `project_detail`, `sync_status`) return accurate data by calling MC API endpoints (not direct DB access)
  3. Starting a Claude Code session surfaces a banner with critical risks (if any exist) via the session startup hook
  4. Every tool previously available in portfolio-dashboard has an equivalent MC MCP tool, and the Claude Code MCP config points to the new server
  5. portfolio-dashboard repo is archived after successful parallel-run validation
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD
- [ ] 10-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8 → 9 → 10

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-03-09 |
| 2. Dashboard Core | v1.0 | 2/2 | Complete | 2026-03-09 |
| 3. Capture Pipeline | v1.0 | 4/4 | Complete | 2026-03-09 |
| 4. Search & Intelligence | v1.0 | 3/3 | Complete | 2026-03-10 |
| 5. Dashboard Enrichments & Real-Time | v1.0 | 3/3 | Complete | 2026-03-10 |
| 6. Data Foundation | v1.1 | 2/2 | Complete | 2026-03-14 |
| 7. Git Health Engine | 2/3 | In Progress|  | - |
| 8. Health API & Events | v1.1 | 0/? | Not started | - |
| 9. Dashboard Intelligence | v1.1 | 0/? | Not started | - |
| 10. MCP Server & Deprecation | v1.1 | 0/? | Not started | - |
