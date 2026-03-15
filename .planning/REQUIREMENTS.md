# Requirements: Mission Control

**Defined:** 2026-03-15
**Core Value:** Every time you open Mission Control, you're smarter than you were 3 seconds ago

## v1.2 Requirements

Requirements for Auto-Discovery + Star Intelligence milestone. Each maps to roadmap phases.

### Discovery Engine

- [ ] **DISC-01**: System discovers new git repos in MacBook `~/` (maxdepth 2) via `find` command with `-prune` for ignored paths
- [ ] **DISC-02**: System discovers new git repos on Mac Mini via SSH batch scanning (reusing `===SECTION===` delimiter pattern)
- [ ] **DISC-03**: System discovers repos in GitHub orgs (quartermint + vanboompow) via `gh api`
- [ ] **DISC-04**: Discovery scan runs on 30-minute cycle (separate from 5-minute health scan)
- [ ] **DISC-05**: Discovered repos are deduped against tracked projects using three-way match (path, normalized remote URL, repo field)
- [ ] **DISC-06**: Discovered repos are deduped against previously-seen discoveries via unique index on (source, host, path)
- [ ] **DISC-07**: System infers name and slug from package.json, Cargo.toml, go.mod, or directory name (fallback chain)
- [ ] **DISC-08**: System generates AI tagline from README.md content via async Gemini pipeline (same pattern as capture enrichment)
- [ ] **DISC-09**: Dismissed discoveries re-surface when new activity is detected (lastActivityAt > dismissedAt) or after 30-day time decay
- [ ] **DISC-10**: GitHub API calls use ETag conditional requests to reduce rate limit consumption

### Star Intelligence

- [ ] **STAR-01**: System scans 10 most recent GitHub stars per cycle via `gh api /user/starred`
- [ ] **STAR-02**: User can categorize stars with intent: reference, try, tool, or inspiration
- [ ] **STAR-03**: Reference and try intents include project selector linking star to a tracked project
- [ ] **STAR-04**: Star categorization stored locally in starIntent/starProject columns (no GitHub Lists API)
- [ ] **STAR-05**: Re-surfaced star cards show "dismissed X ago" context with dismiss count

### Data & Config

- [ ] **DATA-01**: `discovered_projects` table with full schema (id, slug, name, path, host, source, tagline, remoteUrl, language, lastActivityAt, status, discoveredAt, dismissedAt, previouslyDismissedAt, dismissCount, promotedAt, starIntent, starProject, metadata)
- [ ] **DATA-02**: Drizzle migration for discovered_projects table with indexes on (status) and unique on (source, host, path)
- [ ] **DATA-03**: Config `discovery` section with scanDirs, githubOrgs, scanStars, intervalMinutes, ignorePaths — validated by Zod
- [ ] **DATA-04**: Promote flow writes new project entry to mc.config.json (re-read from disk, validate, append, write back)
- [ ] **DATA-05**: Promise-chain mutex serializes all config writes (no file locks needed for single-user)
- [ ] **DATA-06**: In-memory config hot-reload on promote (module-level currentConfig, config:changed event)
- [ ] **DATA-07**: Atomic config writes using temp file + rename pattern for crash safety

### Dashboard

- [ ] **DASH-01**: Discoveries section appears in layout between Risk Feed and Sprint Timeline (only when new items exist)
- [ ] **DASH-02**: Compact repo discovery cards with Track and Dismiss actions (matching risk feed density)
- [ ] **DASH-03**: Star discovery cards with Categorize and Dismiss actions showing language + star count
- [ ] **DASH-04**: Re-surfaced discovery cards show "dismissed X ago" badge with context
- [ ] **DASH-05**: Inline promote form with pre-filled editable name, slug, tagline (single-click Track for defaults)
- [ ] **DASH-06**: Inline star categorization panel with 4 intent options and project selector
- [ ] **DASH-07**: Manual scan trigger button in section header (refresh icon, debounced)
- [ ] **DASH-08**: SSE `discovery:new` event triggers TanStack Query invalidation for live updates
- [ ] **DASH-09**: Section visibility conditional on `status: new` discovery count (disappears when all handled)

### API Routes

- [ ] **API-01**: GET /api/discoveries — all discoveries, filterable by status and source
- [ ] **API-02**: POST /api/discoveries/:id/promote — promote to tracked project with optional name/slug/tagline overrides
- [ ] **API-03**: POST /api/discoveries/:id/dismiss — dismiss with re-surface rules
- [ ] **API-04**: POST /api/discoveries/:id/categorize — star intent categorization with optional project
- [ ] **API-05**: POST /api/discover — trigger immediate discovery scan

## Future Requirements

### CLI Client

- **CLI-01**: `mc capture "thought"` from terminal without leaving session
- **CLI-02**: Piped input support: `echo "idea" | mc capture`
- **CLI-03**: CLI query for project status and recent captures

### MCP Expansion

- **MCP-01**: MCP capture tools: create_capture, list_captures, search
- **MCP-02**: Claude Code sessions push captures and pull project context via MCP

### iOS Companion

- **IOS-01**: Widget capture in 3 taps (tap, type/dictate, send)
- **IOS-02**: Share sheet extension for links/text from any app
- **IOS-03**: Voice capture with transcription AND audio storage
- **IOS-04**: Read-only dashboard view for phone
- **IOS-05**: Offline capture queueing with sync

### Advanced Intelligence

- **INTL-01**: Semantic/vector search via embeddings
- **INTL-02**: AI-generated narrative summaries for project context restoration

## Out of Scope

| Feature | Reason |
|---------|--------|
| GitHub Star Lists API sync | API does not exist (verified — 404, requested since 2021, 241 upvotes, unresolved). Local-only categorization. |
| Auto-promote without confirmation | Human-in-the-loop principle. MC surfaces, you decide. |
| Deep directory scanning (maxdepth > 2) | Prevents scanning inside monorepos, node_modules, nested projects. |
| Language detection for local repos | Low value — user knows their local project languages. GitHub API provides it for github-sourced repos. |
| iOS share sheet / screenshot capture | Future milestone: Universal Capture. v1.2 is project-focused discovery. |
| Auto star categorization via AI | Removes the human insight that makes categorization valuable. Intent is personal. |
| File-system watchers (fsnotify/chokidar) | 30-min poll + manual scan is sufficient. No need for sub-minute detection. |
| Full star history import | 10-per-cycle covers expected volume. >10 stars in 30 min window is acceptable loss. |
| Cross-machine dedup by content | Already solved by remote URL normalization from v1.1 copy detection. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| DATA-05 | — | Pending |
| DATA-06 | — | Pending |
| DATA-07 | — | Pending |
| DISC-01 | — | Pending |
| DISC-02 | — | Pending |
| DISC-03 | — | Pending |
| DISC-04 | — | Pending |
| DISC-05 | — | Pending |
| DISC-06 | — | Pending |
| DISC-07 | — | Pending |
| DISC-08 | — | Pending |
| DISC-09 | — | Pending |
| DISC-10 | — | Pending |
| STAR-01 | — | Pending |
| STAR-02 | — | Pending |
| STAR-03 | — | Pending |
| STAR-04 | — | Pending |
| STAR-05 | — | Pending |
| DASH-01 | — | Pending |
| DASH-02 | — | Pending |
| DASH-03 | — | Pending |
| DASH-04 | — | Pending |
| DASH-05 | — | Pending |
| DASH-06 | — | Pending |
| DASH-07 | — | Pending |
| DASH-08 | — | Pending |
| DASH-09 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| API-04 | — | Pending |
| API-05 | — | Pending |

**Coverage:**
- v1.2 requirements: 36 total
- Mapped to phases: 0
- Unmapped: 36 ⚠️

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after initial definition*
