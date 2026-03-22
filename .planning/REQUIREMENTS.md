# Requirements: Mission Control v1.4

**Defined:** 2026-03-21
**Core Value:** Every time you open Mission Control, you're smarter than you were 3 seconds ago

## v1.4 Requirements

### Foundation

- [x] **FOUND-01**: API captures endpoint accepts idempotency key to prevent duplicate captures from offline queue retries
- [x] **FOUND-02**: Config schema supports `dependsOn` field on project entries with cycle detection at load time
- [x] **FOUND-03**: Health check enum extended with `dependency_impact`, `convention_violation`, and `stale_knowledge` check types (schema migration)

### Cross-Project Intelligence

- [x] **INTEL-01**: User can define project dependency relationships via `dependsOn` in mc.config.json
- [x] **INTEL-02**: Dashboard displays dependency badges on project cards showing which projects each depends on
- [x] **INTEL-03**: Health engine detects when a dependency project has commits the dependent hasn't pulled (dependency drift)
- [x] **INTEL-04**: Dependency drift findings surface in the risk feed with severity escalation (>24h warning, >7d critical)
- [x] **INTEL-05**: Cross-machine reconciliation runs continuously, detecting unpushed commits, diverged copies, and stale services across MacBook and Mac Mini
- [x] **INTEL-06**: Commit impact alerts fire when a dependency project pushes new commits, surfaced as health findings on the dependent project
- [ ] **INTEL-07**: User can view an interactive project relationship graph showing dependency connections, colored by host/status
- [ ] **INTEL-08**: Relationship graph is force-directed (d3-force), lazy-loaded, and code-split via React.lazy

### iOS Companion

- [x] **IOS-01**: User can capture text and links from any iOS app via share sheet extension
- [x] **IOS-02**: Share sheet writes to shared App Group container without networking (offline-first, <120MB memory)
- [ ] **IOS-03**: User can capture text in 3 taps via home screen widget (tap widget, type/dictate, send)
- [ ] **IOS-04**: Widget writes to shared offline queue within 3-second execution budget
- [ ] **IOS-05**: User can record voice captures with no time limit; on-device transcription via SFSpeechRecognizer in 60s chunks
- [ ] **IOS-06**: Voice captures store both transcription text and audio file (.m4a)
- [x] **IOS-07**: Captures queued offline sync automatically on app foreground with retry logic
- [x] **IOS-08**: User sees sync status in-app ("3 captures pending sync")
- [ ] **IOS-09**: User can view project list with health dots, recent captures, and risk summary in native SwiftUI
- [ ] **IOS-10**: Dashboard supports pull-to-refresh and shows "Last synced: X ago" when offline
- [x] **IOS-11**: Captures include context metadata (city-level location, time of day, source app, connectivity)
- [ ] **IOS-12**: App gracefully handles Tailscale disconnection with "Connect to Tailscale" prompt and deep link
- [x] **IOS-13**: User-assigned project on captures is preserved (not overridden by server AI re-categorization)

### Knowledge Unification

- [x] **KNOW-01**: MC aggregates CLAUDE.md content from all local projects and Mac Mini projects via SSH
- [x] **KNOW-02**: CLAUDE.md aggregation uses content-hash caching (only re-reads when git reports file changed)
- [x] **KNOW-03**: Aggregation runs on a separate timer from the main scan cycle with graceful SSH failure handling
- [x] **KNOW-04**: Convention anti-pattern registry is config-driven with support for negative context patterns
- [x] **KNOW-05**: Convention scanner detects anti-patterns in CLAUDE.md files during scan and surfaces as health findings
- [x] **KNOW-06**: Convention registry launches with ≤5 curated rules validated against all projects for zero false positives
- [x] **KNOW-07**: MCP server exposes `project_knowledge` tool returning aggregated CLAUDE.md content for a project
- [x] **KNOW-08**: MCP server exposes `convention_check` tool returning active conventions and any violations
- [x] **KNOW-09**: MCP server exposes `cross_project_search` tool for searching across all project knowledge
- [x] **KNOW-10**: Session startup hook enriched with project knowledge summary (related projects, recent decisions, conventions)
- [x] **KNOW-11**: Stale knowledge health check flags CLAUDE.md files >30 days old with >10 commits since last update

### Dashboard Enhancement

- [x] **DASH-01**: Server stores last-visit timestamp per client via API endpoint
- [x] **DASH-02**: Dashboard highlights projects with activity since last visit (float changed rows to top of group)
- [x] **DASH-03**: Dashboard shows summary count of changed projects since last visit ("4 projects changed since yesterday")
- [x] **DASH-04**: Highlight treatment reviewed against existing badge density (health dots, convergence badges)

## Future Requirements

### Deferred from v1.4

- **INTEL-F01**: Pipeline awareness via `dataFlow` field — reserved in schema, not consumed by alert logic
- **IOS-F01**: iOS background sync via BGAppRefreshTask — foreground sync sufficient for v1.4
- **IOS-F02**: iOS push notifications for critical health alerts — pull-based by design
- **IOS-F03**: Screenshot OCR capture — Vision framework complexity deferred
- **KNOW-F01**: Runtime convention enforcement (intercepting Claude Code tool calls) — scan-time only in v1.4
- **KNOW-F02**: Voice capture upgrade to SpeechAnalyzer when iOS 26 adoption is sufficient
- **DASH-F01**: Session replay (view past session files, duration, accomplishments)
- **DASH-F02**: Capture intent detection (AI detects bug vs feature idea vs question)
- **ACT-F01**: Automated reconciliation actions (one-click git push/pull from dashboard)
- **ACT-F02**: Smart routing with learning from historical session outcomes
- **ACT-F03**: Session convergence merge preview (git merge-base analysis)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-detected dependencies (import analysis) | 4+ languages, poor recall. Manual `dependsOn` is 10 min setup, 100% accurate. |
| Dependency version tracking (semver) | MC projects aren't published packages. Track commit divergence, not versions. |
| Automated dependency updates (auto-pull) | MC observes, it doesn't act. Awareness not action. |
| Full dashboard parity on iOS | iOS does 2 things: capture and glance. Deep analysis on web. |
| Camera/whiteboard capture | Feature creep. MC captures thoughts, not images. |
| Multi-user auth | Single user for v1.4. Trust-based via Tailscale. |
| iOS background execution | BGAppRefreshTask complexity vastly outweighs value for ≤5 queued captures. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 23 | Complete |
| FOUND-02 | Phase 23 | Complete |
| FOUND-03 | Phase 23 | Complete |
| INTEL-01 | Phase 23 | Complete |
| INTEL-02 | Phase 25 | Complete |
| INTEL-03 | Phase 25 | Complete |
| INTEL-04 | Phase 25 | Complete |
| INTEL-05 | Phase 25 | Complete |
| INTEL-06 | Phase 25 | Complete |
| INTEL-07 | Phase 31 | Pending |
| INTEL-08 | Phase 31 | Pending |
| IOS-01 | Phase 29 | Complete |
| IOS-02 | Phase 29 | Complete |
| IOS-03 | Phase 30 | Pending |
| IOS-04 | Phase 30 | Pending |
| IOS-05 | Phase 30 | Pending |
| IOS-06 | Phase 30 | Pending |
| IOS-07 | Phase 29 | Complete |
| IOS-08 | Phase 29 | Complete |
| IOS-09 | Phase 29 | Pending |
| IOS-10 | Phase 29 | Pending |
| IOS-11 | Phase 29 | Complete |
| IOS-12 | Phase 29 | Pending |
| IOS-13 | Phase 29 | Complete |
| KNOW-01 | Phase 24 | Complete |
| KNOW-02 | Phase 24 | Complete |
| KNOW-03 | Phase 24 | Complete |
| KNOW-04 | Phase 26 | Complete |
| KNOW-05 | Phase 26 | Complete |
| KNOW-06 | Phase 26 | Complete |
| KNOW-07 | Phase 27 | Complete |
| KNOW-08 | Phase 27 | Complete |
| KNOW-09 | Phase 27 | Complete |
| KNOW-10 | Phase 27 | Complete |
| KNOW-11 | Phase 24 | Complete |
| DASH-01 | Phase 28 | Complete |
| DASH-02 | Phase 28 | Complete |
| DASH-03 | Phase 28 | Complete |
| DASH-04 | Phase 28 | Complete |

**Coverage:**
- v1.4 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 after roadmap creation*
