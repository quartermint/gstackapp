# Roadmap: Mission Control

## Overview

Mission Control goes from empty repo to daily-driver personal operating environment in 5 phases. Phase 1 lays the API-first foundation on the Mac Mini. Phase 2 delivers the departure board dashboard -- the first visible value. Phase 3 adds the capture pipeline with AI categorization, making the dashboard a place you go to dump thoughts, not just read state. Phase 4 layers search and AI intelligence across everything captured. Phase 5 enriches the dashboard with sprint heatmaps, real-time updates, and ambient health indicators, turning a static display into a living awareness surface.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - API server, SQLite database, project data aggregation, and platform constraints on Mac Mini behind Tailscale
- [ ] **Phase 2: Dashboard Core** - Departure board layout with project rows, hero card, responsive design, and Arc browser visual identity
- [ ] **Phase 3: Capture Pipeline** - Zero-friction text capture with AI categorization, command palette, keyboard shortcuts, and captures woven into project cards
- [ ] **Phase 4: Search & Intelligence** - Full-text and AI-powered natural language search across all captures, projects, and commit messages
- [ ] **Phase 5: Dashboard Enrichments & Real-Time** - Sprint heatmap, "Previously on..." recaps, stale nudges, Mac Mini health pulse, and SSE live updates

## Phase Details

### Phase 1: Foundation
**Goal**: A working API server on the Mac Mini that stores and retrieves captures, projects, and metadata -- the shared platform every client builds on
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, PLAT-01, PLAT-02, PLAT-03
**Success Criteria** (what must be TRUE):
  1. User can hit the API health endpoint from any device on the Tailscale network and get a JSON response
  2. User can create, read, update, and delete captures via API calls and see them persisted across server restarts
  3. User can query the API for project data (git status, commits, GSD state, dirty files) aggregated from local repos
  4. Full-text search returns ranked results across captures, project metadata, and commit messages via the API
  5. Every API endpoint accepts a user context parameter (future-proofing for multi-user) and is documented
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- Wipe old ZeroClaw code, scaffold clean monorepo, create shared Zod schemas and types
- [ ] 01-02-PLAN.md -- SQLite database with Drizzle + FTS5, captures CRUD and search API routes, test infrastructure
- [ ] 01-03-PLAN.md -- Project scanner with git aggregation, project API routes, web dashboard scaffold, end-to-end verification

### Phase 2: Dashboard Core
**Goal**: User opens Mission Control in a browser and instantly sees all projects organized by activity -- the "smarter in 3 seconds" moment
**Depends on**: Phase 1
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-10, DASH-11
**Success Criteria** (what must be TRUE):
  1. Dashboard loads in under 1 second showing all projects grouped by Active/Idle/Stale with name, tagline, host badge, branch, last activity, and dirty file indicator
  2. Most recently active project displays as an expanded hero card with last 3-5 commits, GSD state, and "last context" narrative
  3. User can click any project row to swap it into the hero position
  4. Dashboard renders readable project status on mobile screens
  5. Visual identity is distinctive and opinionated -- warm, Arc browser energy, not dark-mode-by-default or sterile white
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Capture Pipeline
**Goal**: User can dump a raw thought into Mission Control from the dashboard and see it appear on the right project card, categorized by AI -- zero cognitive overhead at capture time
**Depends on**: Phase 2
**Requirements**: CAPT-01, CAPT-02, CAPT-03, CAPT-04, CAPT-05, CAPT-06, CAPT-07, CAPT-08, CAPT-09, INTR-01, INTR-02, INTR-03
**Success Criteria** (what must be TRUE):
  1. User can type a raw thought into the capture field and submit it in under 3 seconds -- capture is persisted immediately, AI enrichment happens asynchronously
  2. AI auto-categorizes each capture to a project with a confidence score, and the capture appears woven into its assigned project card (not a separate inbox)
  3. User can correct the AI's project assignment with one click, and unlinked captures appear in a "loose thoughts" section
  4. Command palette (Cmd+K) provides quick access to capture, project navigation, and search, with keyboard shortcuts for all power actions
  5. Captures older than 2 weeks are surfaced by AI triage for user action (act, archive, dismiss), and archived captures remain searchable but leave project cards
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: Search & Intelligence
**Goal**: User can find anything they ever captured or committed using natural language -- the system becomes retrievable memory, not just a capture dump
**Depends on**: Phase 3
**Requirements**: SRCH-01, SRCH-02, SRCH-03
**Success Criteria** (what must be TRUE):
  1. User can search across all captures, project metadata, and commit messages from the command palette using natural language
  2. Search results are ranked by relevance with source type indicated (capture, commit, project)
  3. AI-powered queries return contextually relevant results beyond keyword matching (e.g., "what was I thinking about for the flight app" finds captures linked to OpenEFB and SFR)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Dashboard Enrichments & Real-Time
**Goal**: The dashboard feels alive -- updates stream in without refresh, sprint patterns are visible at a glance, and ambient health indicators keep you aware of system state
**Depends on**: Phase 2 (dashboard structure), Phase 3 (captures for real-time display)
**Requirements**: DASH-05, DASH-06, DASH-07, DASH-08, DASH-09
**Success Criteria** (what must be TRUE):
  1. Sprint heatmap displays a GitHub-style contribution grid with one row per project showing commit intensity over the last 12-16 weeks
  2. "Previously on..." expandable breadcrumbs show recent commit messages and GSD pause summaries per project
  3. Projects idle 2+ weeks with uncommitted work receive a subtle visual nudge (not alarming, just noticeable)
  4. Mac Mini health pulse shows reachability and service status as an ambient green/amber/red indicator
  5. Dashboard updates in real-time via SSE -- new captures appear, AI enrichments update, health indicators pulse, all without page refresh
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 1/3 | Executing | - |
| 2. Dashboard Core | 0/? | Not started | - |
| 3. Capture Pipeline | 0/? | Not started | - |
| 4. Search & Intelligence | 0/? | Not started | - |
| 5. Dashboard Enrichments & Real-Time | 0/? | Not started | - |
