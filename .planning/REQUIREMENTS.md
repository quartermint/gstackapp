# Requirements: Mission Control

**Defined:** 2026-03-15
**Core Value:** Every time you open Mission Control, you're smarter than you were 3 seconds ago

## v1.2 Requirements

Requirements for Session Orchestrator + Local LLM Gateway milestone. Each maps to roadmap phases.

### Session Tracking

- [ ] **SESS-01**: Claude Code sessions report activity to MC API via HTTP hooks (SessionStart, PostToolUse for Write/Edit, Stop)
- [x] **SESS-02**: MC stores session lifecycle with status machine (active → completed/abandoned)
- [ ] **SESS-03**: Session reaper marks sessions with no heartbeat for 15+ minutes as abandoned
- [ ] **SESS-04**: Sessions resolve to tracked projects via cwd prefix matching with git remote URL fallback
- [ ] **SESS-05**: Aider sessions detected passively via git commit attribution during scan cycle
- [ ] **SESS-06**: Hook scripts are fire-and-forget (<100ms), backgrounded curl, always exit 0

### Budget & Routing

- [x] **BUDG-01**: MC derives model tier from session model string (opus/sonnet/local)
- [ ] **BUDG-02**: Weekly budget summary shows session count by tier with estimated cost range
- [ ] **BUDG-03**: Tier routing recommendations suggest model based on budget burn rate (rule-based, not AI)
- [ ] **BUDG-04**: Budget estimates clearly labeled as "estimated" — never auto-restrict, suggestions only

### Intelligence

- [ ] **INTL-01**: File-level conflict detection across active sessions on same project
- [ ] **INTL-02**: SSE alert emitted when two sessions report writing to the same file
- [ ] **INTL-03**: Session relationships grouped by project — sessions on same project linked

### Gateway

- [ ] **GATE-01**: MC health probe polls LM Studio API on Mac Mini (:1234) for model availability
- [ ] **GATE-02**: Three-state model health: unavailable / loading / ready (Qwen3-Coder-30B)
- [ ] **GATE-03**: LM Studio status surfaced in existing health panel

### Dashboard

- [ ] **DASH-01**: Active sessions panel with live feed — project name, tool icon, model tier badge, elapsed time
- [ ] **DASH-02**: Budget widget showing weekly tier usage and burn rate indicator
- [ ] **DASH-03**: Conflict alert cards when file overlap detected across sessions
- [ ] **DASH-04**: Session count badges on departure board project cards ("2 active")
- [ ] **DASH-05**: SSE-driven updates for session lifecycle events (started/stopped/conflict)

### API

- [ ] **API-01**: POST /api/sessions — create/start session from hook data
- [ ] **API-02**: POST /api/sessions/:id/heartbeat — update files touched, last activity
- [ ] **API-03**: POST /api/sessions/:id/stop — mark session completed
- [ ] **API-04**: GET /api/sessions — list sessions with filters (status, project, tool)
- [ ] **API-05**: GET /api/budget — weekly summary by tier with estimated costs
- [ ] **API-06**: GET /api/models — LM Studio model status and availability

### Infrastructure

- [x] **INFR-01**: Update MC infra/ scripts to use svc conventions and /opt/services/ paths

## Future Requirements

### Convergence Detection (→ v1.3)

- **CONV-01**: Watch git activity across sessions, flag when parallel work is ready to merge
- **CONV-02**: Detect when multiple sessions on same project both reach "stopped" with commits
- **CONV-03**: Surface convergence cards on dashboard with merge recommendation

### Session Enrichment (→ v1.3)

- **ENRICH-01**: Session replay/timeline visualization per session
- **ENRICH-02**: MCP session tools (session_status, session_conflicts)
- **ENRICH-03**: Smart routing with learning from historical session outcomes

### Auto-Discovery + Star Intelligence (→ v1.3)

- **DISC-01**: Discovery engine for new git repos (local dirs, Mac Mini SSH, GitHub orgs)
- **STAR-01**: GitHub star intent categorization (reference, try, tool, inspiration)
- **DASH-D01**: Dashboard discoveries section with track/dismiss/categorize actions

### CLI Client (→ v1.3 or v2.0)

- **CLI-01**: `mc capture "thought"` from terminal without leaving session
- **CLI-02**: Piped input support: `echo "idea" | mc capture`
- **CLI-03**: CLI query for project status and recent captures

### iOS Companion (→ v2.0)

- **IOS-01**: Widget capture in 3 taps (tap, type/dictate, send)
- **IOS-02**: Share sheet extension for links/text from any app
- **IOS-03**: Voice capture with transcription AND audio storage
- **IOS-04**: Read-only dashboard view for phone
- **IOS-05**: Offline capture queueing with sync

### Advanced Intelligence (→ v2.0)

- **ADVINT-01**: Semantic/vector search via embeddings
- **ADVINT-02**: AI-generated narrative summaries for project context restoration

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-spawning sessions from MC | MC observes and routes, it doesn't launch terminals or create sessions |
| Token-level usage tracking per session | Claude hooks don't expose token counts. Budget uses session-count + tier heuristics |
| AI-powered task classification for routing | Rule-based keyword matching is sufficient and instant for personal use |
| Real-time file diff tracking | File-level list sufficient; git diff at convergence/merge time |
| Full transcript storage in MC | 10-100MB JSONL per session would bloat SQLite. Store metadata only, link to transcript path |
| Automatic model switching mid-session | Sessions can't switch models mid-conversation. Next session gets recommendation |
| Aider auto-configuration | Install + model verification are prerequisites, not MC features |
| Session chat/messaging between agents | Inter-agent communication is unsolved. MC observes, user coordinates |
| Aider wrapper script (active tracking) | Passive git detection sufficient for v1.2. Wrapper adds UX friction |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SESS-01 | Phase 12 | Pending |
| SESS-02 | Phase 11 | Complete |
| SESS-03 | Phase 12 | Pending |
| SESS-04 | Phase 12 | Pending |
| SESS-05 | Phase 12 | Pending |
| SESS-06 | Phase 12 | Pending |
| BUDG-01 | Phase 11 | Complete |
| BUDG-02 | Phase 13 | Pending |
| BUDG-03 | Phase 13 | Pending |
| BUDG-04 | Phase 13 | Pending |
| INTL-01 | Phase 14 | Pending |
| INTL-02 | Phase 14 | Pending |
| INTL-03 | Phase 14 | Pending |
| GATE-01 | Phase 13 | Pending |
| GATE-02 | Phase 13 | Pending |
| GATE-03 | Phase 13 | Pending |
| DASH-01 | Phase 15 | Pending |
| DASH-02 | Phase 15 | Pending |
| DASH-03 | Phase 15 | Pending |
| DASH-04 | Phase 15 | Pending |
| DASH-05 | Phase 15 | Pending |
| API-01 | Phase 12 | Pending |
| API-02 | Phase 12 | Pending |
| API-03 | Phase 12 | Pending |
| API-04 | Phase 12 | Pending |
| API-05 | Phase 13 | Pending |
| API-06 | Phase 13 | Pending |
| INFR-01 | Phase 11 | Complete |

**Coverage:**
- v1.2 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after roadmap creation*
