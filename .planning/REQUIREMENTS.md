# Requirements: gstackapp

**Defined:** 2026-04-11
**Core Value:** Encode Ryan's development workflow into a system that non-technical people can drive directly. Quality pipeline ensures every output is vetted. Knowledge layer means the system knows your world.

## v2.0 Requirements

Requirements for Mission Control 4.0 — The Cathedral. Each maps to roadmap phases.

### Prerequisites

- [ ] **PRE-01**: Phase 15 eng review items (IDEA-05/06/07/08) resolved and committed
- [x] **PRE-02**: Phase 15 human UAT passes (6 test items in 15-HUMAN-UAT.md)
- [ ] **PRE-03**: CLAUDE.md updated to reflect SQLite → Neon Postgres migration

### Auth & Multi-User

- [ ] **AUTH-01**: User on Tailscale tailnet can access dashboard without additional login
- [ ] **AUTH-02**: User not on tailnet can authenticate via magic link email (SendGrid)
- [ ] **AUTH-03**: Authenticated user is assigned operator or admin role
- [ ] **AUTH-04**: Each user has isolated session history, request queue, and audit trail

### Operator Mode

- [ ] **OP-01**: Operator can submit a request via intake form ("What do you need?" + "What does good look like?" + optional deadline)
- [ ] **OP-02**: System asks up to 5 clarification questions powered by gbrain context before locking scope
- [ ] **OP-03**: System generates an execution brief (scope, assumptions, acceptance criteria) that operator approves before execution starts
- [ ] **OP-04**: Operator sees non-technical progress visualization (thinking → planning → building → checking → done)
- [ ] **OP-05**: System produces a verification report in plain language with pass/fail and "here's what was built"
- [ ] **OP-06**: Decision gates pause pipeline and present Approve / Request Changes / Ask Ryan buttons
- [ ] **OP-07**: Every decision, AI output, and verification result is timestamped in an audit trail
- [ ] **OP-08**: On harness timeout (>5min), operator sees wait/escalate options with pipeline state persisted
- [ ] **OP-09**: On verification failure (BLOCK verdict), operator sees plain-language explanation with Request Changes pre-selected
- [ ] **OP-10**: On ambiguous request (5 questions couldn't lock scope), system presents partial brief + "Ask Ryan" escalation
- [ ] **OP-11**: On provider failure (all LLMs exhausted), operator sees "temporarily unavailable" with request saved to retry queue

### Ryan Power Dashboard

- [ ] **DASH-01**: Ryan sees multi-project overview of all quartermint repos with status, last activity, and health scores
- [ ] **DASH-02**: Pipeline topology view shows 5-stage reviews running across repos
- [ ] **DASH-03**: Ideation workspace surfaces office-hours → CEO review → eng review → execution flow visually
- [ ] **DASH-04**: gbrain console allows querying knowledge, viewing entity relationships, and reviewing compiled truth
- [ ] **DASH-05**: Cross-repo intelligence surfaces "Seen in your other repos" alerts and pattern detection

### gbrain Integration

- [ ] **GB-01**: Harness can call gbrain MCP tools (gbrain_search, gbrain_entity, gbrain_related)
- [ ] **GB-02**: gbrain queries run as async prefetch at pipeline start, cached per pipeline run in Postgres
- [ ] **GB-03**: For requests naming a known project or person, clarification stage includes at least one context-loaded question from gbrain (verifiable in audit trail)
- [ ] **GB-04**: If gbrain MCP server is unavailable, pipeline runs with graceful degradation and flags "Running without knowledge context"

### Harness Independence

- [ ] **HRN-01**: Web UI can trigger a pipeline run via API route (POST /api/operator/request)
- [ ] **HRN-02**: Harness spawns agent session with provider selection via ModelRouter, tool definitions, and injected gbrain context
- [ ] **HRN-03**: Agent executes pipeline stages (clarify → plan → execute → verify) with structured tool_use output
- [ ] **HRN-04**: Stage results stream to web UI via SSE (existing pattern extended)
- [ ] **HRN-05**: Decision gates emit SSE events, web UI renders approval buttons, user response resumes pipeline

## Future Requirements

Deferred beyond v2.0. Tracked but not in current roadmap.

### Agent Orchestration (descoped per spec review)

- **AGENT-01**: Ryan can spawn, monitor, and manage AI agent sessions from dashboard
- **AGENT-02**: Agent sessions show real-time output and can be paused/resumed

### Deployment Controls (descoped per spec review)

- **DEPLOY-01**: Mac Mini service management (start/stop/restart) from dashboard
- **DEPLOY-02**: Tailscale Funnel status visibility

### Mobile Access

- **MOB-01**: Operators can submit requests from mobile (responsive layout below 1024px)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Light mode | Dark-only by design (DESIGN.md mandate) |
| GitHub OAuth | Tailscale ACL + magic link sufficient for known users |
| Multi-tenant / org scoping | Single operator group, not enterprise |
| GitHub Checks API merge blocking | PR comments only |
| Skill marketplace / versioning | Deferred, not needed for operator mode |
| Cost dashboard UI | Deferred |
| Agent orchestration | Separate product concern, descoped per spec review |
| Deployment controls | Infra tooling, not product work |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRE-01 | Phase 16 | Pending |
| PRE-02 | Phase 16 | Complete |
| PRE-03 | Phase 16 | Pending |
| AUTH-01 | Phase 17 | Pending |
| AUTH-02 | Phase 17 | Pending |
| AUTH-03 | Phase 17 | Pending |
| AUTH-04 | Phase 17 | Pending |
| OP-01 | Phase 18 | Pending |
| OP-02 | Phase 18 | Pending |
| OP-03 | Phase 18 | Pending |
| OP-04 | Phase 18 | Pending |
| OP-05 | Phase 18 | Pending |
| OP-06 | Phase 18 | Pending |
| OP-07 | Phase 18 | Pending |
| OP-08 | Phase 18 | Pending |
| OP-09 | Phase 18 | Pending |
| OP-10 | Phase 18 | Pending |
| OP-11 | Phase 18 | Pending |
| DASH-01 | Phase 20 | Pending |
| DASH-02 | Phase 20 | Pending |
| DASH-03 | Phase 20 | Pending |
| DASH-04 | Phase 20 | Pending |
| DASH-05 | Phase 20 | Pending |
| GB-01 | Phase 19 | Pending |
| GB-02 | Phase 19 | Pending |
| GB-03 | Phase 19 | Pending |
| GB-04 | Phase 19 | Pending |
| HRN-01 | Phase 17 | Pending |
| HRN-02 | Phase 17 | Pending |
| HRN-03 | Phase 17 | Pending |
| HRN-04 | Phase 17 | Pending |
| HRN-05 | Phase 17 | Pending |

**Coverage:**
- v2.0 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 — traceability updated with phase mappings*
