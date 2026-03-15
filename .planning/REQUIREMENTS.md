# Requirements: Mission Control

**Defined:** 2026-03-14
**Core Value:** Every time you open Mission Control, you're smarter than you were 3 seconds ago

## v1.1 Requirements

Requirements for Git Health Intelligence + MCP milestone. Each maps to roadmap phases.

### Git Health Engine

- [x] **HLTH-01**: System detects unpushed commits per project with severity (warning: 1-5, critical: 6+)
- [x] **HLTH-02**: System detects projects with no remote configured (critical)
- [x] **HLTH-03**: System detects broken upstream tracking (critical)
- [x] **HLTH-04**: System detects deleted remote branches (critical)
- [x] **HLTH-05**: System detects unpulled commits (warning)
- [x] **HLTH-06**: System tracks dirty working tree age with escalating severity (info: fresh, warning: 3+ days, critical: 7+ days)
- [x] **HLTH-07**: Public repos escalate unpushed severity one tier (1-5 on public = critical)
- [x] **HLTH-08**: Each project gets health score (0-100) and risk level (healthy/warning/critical/unmonitored)
- [x] **HLTH-09**: Health findings persist with upsert semantics preserving first-detected timestamps
- [x] **HLTH-10**: GitHub-only projects (no local clone) show as "unmonitored" with null health score

### Multi-Host Copy Discovery

- [x] **COPY-01**: System auto-discovers multi-copy projects by matching normalized remote URLs across hosts
- [x] **COPY-02**: Config supports explicit multi-host entries alongside existing single-host format
- [x] **COPY-03**: System detects diverged copies via HEAD comparison and ancestry check
- [x] **COPY-04**: System tracks per-copy freshness and handles stale SSH data gracefully

### Dashboard: Risk Feed

- [x] **RISK-01**: Risk feed appears above departure board with severity-grouped cards (critical first)
- [x] **RISK-02**: Each card shows severity icon, project name, problem description, duration, action hint
- [x] **RISK-03**: Cards are non-dismissable — disappear only when underlying issue resolves
- [x] **RISK-04**: Active risk count appears in browser page title
- [x] **RISK-05**: Current-scan-cycle detections marked "new"

### Dashboard: Sprint Timeline

- [x] **TMLN-01**: Horizontal swimlane chart replaces heatmap, showing project bars with commit density over 12 weeks
- [x] **TMLN-02**: Currently-focused project (most commits in last 7 days) is highlighted
- [x] **TMLN-03**: Hover shows commit count + date range; click navigates to project on departure board

### Dashboard: Health Indicators

- [x] **HDOT-01**: Project cards show green/amber/red health dot based on worst active finding
- [x] **HDOT-02**: Multi-copy projects with divergence show split dot indicator
- [x] **HDOT-03**: Clicking health dot expands inline findings panel (same pattern as "Previously On")

### MCP Server

- [x] **MCP-01**: @mission-control/mcp package with stdio transport for Claude Code integration
- [x] **MCP-02**: project_health tool returns full health report across all projects
- [x] **MCP-03**: project_risks tool returns active problems filtered by severity
- [x] **MCP-04**: project_detail tool returns deep status for one project
- [x] **MCP-05**: sync_status tool returns sync report (unpushed, no remote, diverged, broken tracking)
- [ ] **MCP-06**: Session startup hook surfaces critical risks in banner

### Migration

- [x] **MIGR-01**: All portfolio-dashboard tool capabilities mapped to MC MCP equivalents
- [ ] **MIGR-02**: Claude Code MCP config updated to point to new server
- [ ] **MIGR-03**: portfolio-dashboard repo archived

## Future Requirements

### Advanced Intelligence (deferred from v1.0)

- **INTL-01**: Semantic/vector search via embeddings (conceptual similarity beyond keywords)
- **INTL-02**: AI-generated narrative summaries for project context restoration

### Health Engine Enhancements

- **HLTH-11**: Auto-fix actions from dashboard (push, pull)
- **HLTH-12**: Git fetch on scan for fresh remote state
- **HLTH-13**: Historical trend graphs for health scores
- **HLTH-14**: Branch-level health checks

### Notifications

- **NOTF-01**: Webhook/notification on health state change
- **NOTF-02**: Push alerts for critical risks

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-fix actions from dashboard | MC surfaces problems, you fix them in terminal — awareness not action |
| Git fetch on scan | Write operation, adds network load; not needed for common-case detection |
| Historical health trend graphs | Binary signals don't trend meaningfully |
| Notification push on health change | Pull-based by design; notification fatigue kills adoption |
| Code quality checks (lint, coverage) | Different domain from sync health; different tooling |
| Branch-level health | Overengineering for single-user serial sprint workflow |
| Multi-user auth changes | Single user for now; Tailscale boundary is access control |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HLTH-01 | Phase 7 | Complete |
| HLTH-02 | Phase 7 | Complete |
| HLTH-03 | Phase 7 | Complete |
| HLTH-04 | Phase 7 | Complete |
| HLTH-05 | Phase 7 | Complete |
| HLTH-06 | Phase 7 | Complete |
| HLTH-07 | Phase 7 | Complete |
| HLTH-08 | Phase 7 | Complete |
| HLTH-09 | Phase 6 | Complete |
| HLTH-10 | Phase 6 | Complete |
| COPY-01 | Phase 7 | Complete |
| COPY-02 | Phase 6 | Complete |
| COPY-03 | Phase 7 | Complete |
| COPY-04 | Phase 7 | Complete |
| RISK-01 | Phase 9 | Complete |
| RISK-02 | Phase 9 | Complete |
| RISK-03 | Phase 9 | Complete |
| RISK-04 | Phase 8 | Complete |
| RISK-05 | Phase 8 | Complete |
| TMLN-01 | Phase 9 | Complete |
| TMLN-02 | Phase 9 | Complete |
| TMLN-03 | Phase 9 | Complete |
| HDOT-01 | Phase 9 | Complete |
| HDOT-02 | Phase 9 | Complete |
| HDOT-03 | Phase 9 | Complete |
| MCP-01 | Phase 10 | Complete |
| MCP-02 | Phase 10 | Complete |
| MCP-03 | Phase 10 | Complete |
| MCP-04 | Phase 10 | Complete |
| MCP-05 | Phase 10 | Complete |
| MCP-06 | Phase 10 | Pending |
| MIGR-01 | Phase 10 | Complete |
| MIGR-02 | Phase 10 | Pending |
| MIGR-03 | Phase 10 | Pending |

**Coverage:**
- v1.1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 after roadmap creation*
