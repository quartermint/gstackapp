# Requirements: Mission Control

**Defined:** 2026-03-09
**Core Value:** Every time you open Mission Control, you're smarter than you were 3 seconds ago

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: API server accepts and responds to HTTP requests with structured JSON on Mac Mini behind Tailscale
- [x] **FOUND-02**: SQLite database stores and retrieves captures, projects, and metadata with WAL mode for concurrent reads
- [x] **FOUND-03**: FTS5 full-text search indexes captures, project metadata, and commit messages with BM25 ranking
- [x] **FOUND-04**: API endpoints exist for: CRUD captures, list/detail projects, search, health check
- [x] **FOUND-05**: Project data aggregation pulls git status, recent commits, GSD state, and dirty file indicators from local repos

### Dashboard

- [x] **DASH-01**: Single-page web dashboard loads in under 1 second showing all projects grouped by Active/Idle/Stale
- [ ] **DASH-02**: Each project row shows: name, one-liner tagline, host badge (local/mac-mini), branch, last activity relative time, dirty file indicator
- [ ] **DASH-03**: Hero card expands most recently active project with last 3-5 commits as mini-timeline, GSD state, and "last context" narrative
- [ ] **DASH-04**: User can click any project row to swap it into the hero position
- [ ] **DASH-05**: Sprint heatmap displays GitHub-style contribution grid with one row per project showing commit intensity over last 12-16 weeks
- [ ] **DASH-06**: "Previously on..." expandable breadcrumbs show recent commit messages and GSD pause summaries per project
- [ ] **DASH-07**: Projects idle 2+ weeks with uncommitted work receive subtle visual treatment (not alarming, just "hey")
- [ ] **DASH-08**: Mac Mini health pulse shows reachability and service status as ambient indicator (green/amber/red)
- [ ] **DASH-09**: Dashboard updates in real-time via SSE without requiring page refresh
- [ ] **DASH-10**: Responsive layout renders readable project status on mobile screens
- [x] **DASH-11**: Visual identity follows Arc browser energy: opinionated, distinctive, warm — not dark-mode-by-default, not sterile white

### Capture

- [ ] **CAPT-01**: User can type a raw, unstructured thought into a capture field on the dashboard and submit it in under 3 seconds
- [ ] **CAPT-02**: AI auto-categorizes each capture to a project (or marks as unlinked) with confidence score, asynchronously after submission
- [ ] **CAPT-03**: User can correct AI's project assignment with one click
- [ ] **CAPT-04**: Captures appear woven into their assigned project cards on the dashboard — not in a separate inbox
- [ ] **CAPT-05**: Unlinked captures (no project match) appear in a "loose thoughts" section on the dashboard
- [ ] **CAPT-06**: Captures are persisted immediately on submission — the "persist first, enrich later" pattern
- [ ] **CAPT-07**: AI triage periodically surfaces captures older than 2 weeks for user action: act, archive, or dismiss
- [ ] **CAPT-08**: Archived captures are removed from project cards but remain searchable
- [ ] **CAPT-09**: Captures support text, URLs/links, and link metadata extraction (title, summary)

### Search & Intelligence

- [ ] **SRCH-01**: User can search across all captures, project metadata, and commit messages using natural language from the command palette
- [ ] **SRCH-02**: Search results are ranked by relevance with source type indicated (capture, commit, project)
- [ ] **SRCH-03**: AI-powered natural language queries return contextually relevant results (not just keyword matching)

### Interaction

- [ ] **INTR-01**: Command palette (Cmd+K) provides quick access to: capture, project navigation, and search
- [ ] **INTR-02**: Keyboard shortcuts exist for: open capture field, navigate between projects, toggle hero card, open search
- [ ] **INTR-03**: Dashboard interaction is hybrid: keyboard shortcuts for power actions, mouse/click for browsing and visual exploration

### Platform

- [x] **PLAT-01**: Every dashboard feature is backed by a documented API endpoint — no server-rendered shortcuts
- [x] **PLAT-02**: API design does not preclude multi-user access in the future (e.g., user context in requests even if single-user now)
- [x] **PLAT-03**: API is accessible only via Tailscale — private but built like a product

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### CLI Client

- **CLI-01**: User can capture thoughts from terminal via `mc capture "thought"` without leaving their session
- **CLI-02**: CLI supports piped input: `echo "idea" | mc capture`
- **CLI-03**: CLI can query project status and recent captures

### MCP Integration

- **MCP-01**: MC exposes an MCP server with tools: create_capture, list_captures, get_project_status, search
- **MCP-02**: Claude Code sessions can push captures during work and pull project context
- **MCP-03**: MC consumes portfolio-dashboard MCP server for live git data instead of direct repo access

### iOS Companion

- **IOS-01**: iOS widget enables capture in 3 taps max (tap widget, type/dictate, send)
- **IOS-02**: iOS share sheet extension captures links/text from any app with AI categorization
- **IOS-03**: Voice capture with transcription AND audio storage
- **IOS-04**: Read-only dashboard view for glancing at project status from phone
- **IOS-05**: Offline capture queueing with automatic sync when Mac Mini is reachable
- **IOS-06**: Super-app shell architecture supporting future module loading

### Advanced Intelligence

- **AINT-01**: Semantic/vector search using embeddings for conceptual similarity (not just keyword)
- **AINT-02**: AI-generated narrative summaries for project context restoration ("Previously on..." enhanced)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full task management / Kanban | MC is awareness + capture, not project management. Every previous task system became a graveyard. |
| Communications / messaging | QMspace handles comms. MC gets a lightweight QMspace plugin eventually. |
| Email triage / unified inbox | msgvault handles email. Future plugin territory, not core MC. |
| Rich text editor / documents | MC captures, it doesn't write. Link out to proper editors. |
| Real-time collaboration | Single user v1. Shared data layer, not shared editing. |
| Graph view / knowledge visualization | Visually impressive, rarely useful. Sprint heatmap provides the meaningful visualization. |
| Notification push alerts | Notification fatigue kills adoption. Dashboard is pull-based by design. |
| Calendar integration | Separate concern handled by Apple Calendar. |
| Auto-import from other tools | Starting fresh is the point. "Last environment" means clean start. |
| Multi-platform (Android, Windows) | All-Apple ecosystem. Web dashboard is accessible from any browser. |
| Formal plugin marketplace | No second user exists. Formalize when a second plugin demands it. |
| Principal's Ear integration | PE has its own commercial trajectory. Shared capture DNA, not code. |
| Auth system | Single user, trust-based. Figure out auth when Bella needs access. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1: Foundation | Complete (01-01) |
| FOUND-02 | Phase 1: Foundation | Complete (01-02) |
| FOUND-03 | Phase 1: Foundation | Complete (01-02) |
| FOUND-04 | Phase 1: Foundation | Complete (01-02) |
| FOUND-05 | Phase 1: Foundation | Complete (01-03) |
| PLAT-01 | Phase 1: Foundation | Complete (01-01) |
| PLAT-02 | Phase 1: Foundation | Complete (01-01) |
| PLAT-03 | Phase 1: Foundation | Complete (01-01) |
| DASH-01 | Phase 2: Dashboard Core | Complete |
| DASH-02 | Phase 2: Dashboard Core | Pending |
| DASH-03 | Phase 2: Dashboard Core | Pending |
| DASH-04 | Phase 2: Dashboard Core | Pending |
| DASH-10 | Phase 2: Dashboard Core | Pending |
| DASH-11 | Phase 2: Dashboard Core | Complete |
| CAPT-01 | Phase 3: Capture Pipeline | Pending |
| CAPT-02 | Phase 3: Capture Pipeline | Pending |
| CAPT-03 | Phase 3: Capture Pipeline | Pending |
| CAPT-04 | Phase 3: Capture Pipeline | Pending |
| CAPT-05 | Phase 3: Capture Pipeline | Pending |
| CAPT-06 | Phase 3: Capture Pipeline | Pending |
| CAPT-07 | Phase 3: Capture Pipeline | Pending |
| CAPT-08 | Phase 3: Capture Pipeline | Pending |
| CAPT-09 | Phase 3: Capture Pipeline | Pending |
| INTR-01 | Phase 3: Capture Pipeline | Pending |
| INTR-02 | Phase 3: Capture Pipeline | Pending |
| INTR-03 | Phase 3: Capture Pipeline | Pending |
| SRCH-01 | Phase 4: Search & Intelligence | Pending |
| SRCH-02 | Phase 4: Search & Intelligence | Pending |
| SRCH-03 | Phase 4: Search & Intelligence | Pending |
| DASH-05 | Phase 5: Dashboard Enrichments & Real-Time | Pending |
| DASH-06 | Phase 5: Dashboard Enrichments & Real-Time | Pending |
| DASH-07 | Phase 5: Dashboard Enrichments & Real-Time | Pending |
| DASH-08 | Phase 5: Dashboard Enrichments & Real-Time | Pending |
| DASH-09 | Phase 5: Dashboard Enrichments & Real-Time | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-09 after plan 01-03 execution (Phase 1 complete)*
