# Requirements: gstackapp

**Defined:** 2026-04-08
**Core Value:** One place to see everything, start anything, and let AI execute autonomously after rich frontloading.

## v2.0 Requirements

Requirements for Command Center milestone. Each maps to roadmap phases.

### Dashboard

- [ ] **DASH-01**: User can view all projects with GSD state (.planning/STATE.md) aggregated into a single dashboard
- [ ] **DASH-02**: User can see git status and uncommitted file counts per project at a glance
- [ ] **DASH-03**: User can browse design docs from ~/.gstack/projects/ as first-class artifacts with project association
- [ ] **DASH-04**: User can view aggregated worklog carryover items across all projects with staleness tracking
- [ ] **DASH-05**: User can see Mac Mini service health, Tailscale Funnel endpoints, and deployment status
- [ ] **DASH-06**: User can identify stale projects (no activity, drifting uncommitted work) vs active ones

### Ideation

- [ ] **IDEA-01**: User can launch an office-hours brainstorm session from the browser with no repo required (idea-first)
- [ ] **IDEA-02**: User can chain ideation skills (office-hours → CEO review → eng review → design consultation) as a connected pipeline
- [ ] **IDEA-03**: User can view, compare, and iterate on design doc outputs from ideation sessions
- [ ] **IDEA-04**: User can scaffold a new repo from ideation output when ready to build (design doc → repo with CLAUDE.md + .planning/)

### Sessions

- [ ] **SESS-01**: User can start an AI conversation session with a generator-based agent loop that supports tool execution
- [ ] **SESS-02**: User can run multiple concurrent sessions as tabs, each with per-project context
- [ ] **SESS-03**: User can have long sessions without context degradation via 4-layer compression pipeline (snip, micro, collapse, auto-compact)
- [ ] **SESS-04**: User can persist sessions and resume them across browser visits

### Routing

- [ ] **ROUT-01**: User can route work to GPT-Codex (GPT-5.4/5.2) as a provider alongside Claude and Gemini
- [ ] **ROUT-02**: User can run tasks on Mac Mini local models with empirical boundary discovery and benchmarking (not assumed limits)
- [ ] **ROUT-03**: User can have tasks routed based on task type (ideation vs scaffolding vs review vs debugging), not just failover
- [ ] **ROUT-04**: User can use Gemma 4 26B-A4B MoE as a local model option alongside Qwen3.5-35B-A3B

### Autonomous GSD

- [ ] **AUTO-01**: User can trigger one-click autonomous execution: roadmap → discuss all phases → execute, from the UI
- [ ] **AUTO-02**: User can watch real-time pipeline visualization showing phase progress, agent spawns, and commits
- [ ] **AUTO-03**: User can respond to decision gates surfaced in the UI when autonomous execution needs input
- [ ] **AUTO-04**: Discuss phase carries forward ideation context and only asks user for decisions where their input genuinely adds value

### PR Review (existing)

- [ ] **PREV-01**: Existing v1.0 PR review pipeline is accessible as a feature within the command center dashboard

## Future Requirements

### Collaboration

- **COLLAB-01**: Multiple users can share a workspace view
- **COLLAB-02**: Team-level project aggregation across members

### Advanced Routing

- **ROUT-05**: Auto-tuning of routing thresholds based on task outcome feedback
- **ROUT-06**: Cost dashboard showing spend per provider per project

### Mobile

- **MOB-01**: Responsive mobile view for monitoring (not editing)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Reimplementing gstack skills | gstackapp consumes gstack as upstream dependency — invoke real skills |
| Reimplementing GSD workflow logic | gstackapp consumes GSD as upstream dependency — invoke real orchestrators |
| Multi-user auth | Single-user for v2.0, same as v1.0 |
| Light mode | Dark-only per design system |
| Cloud deployment | Mac Mini via Tailscale Funnel |
| Mobile-first design | Desktop-only, monitoring-only mobile deferred |
| Skill marketplace | Deferred from v1.1 |
| CRDT/real-time sync | rsync over Tailscale sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmapper) | | |

**Coverage:**
- v2.0 requirements: 19 total
- Mapped to phases: 0
- Unmapped: 19

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after initial definition*
