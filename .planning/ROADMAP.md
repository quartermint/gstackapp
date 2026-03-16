# Roadmap: Mission Control

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-03-10)
- ✅ **v1.1 Git Health Intelligence + MCP** — Phases 6-10 (shipped 2026-03-15)
- ✅ **v1.2 Session Orchestrator + Local LLM Gateway** — Phases 11-15 (shipped 2026-03-16)

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

<details>
<summary>✅ v1.1 Git Health Intelligence + MCP (Phases 6-10) — SHIPPED 2026-03-15</summary>

- [x] Phase 6: Data Foundation (2/2 plans) — completed 2026-03-14
- [x] Phase 7: Git Health Engine (3/3 plans) — completed 2026-03-14
- [x] Phase 8: Health API & Events (2/2 plans) — completed 2026-03-15
- [x] Phase 9: Dashboard Intelligence (3/3 plans) — completed 2026-03-15
- [x] Phase 10: MCP Server & Deprecation (2/2 plans) — completed 2026-03-15

Full details: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

<details>
<summary>✅ v1.2 Session Orchestrator + Local LLM Gateway (Phases 11-15) — SHIPPED 2026-03-16</summary>

**Milestone Goal:** Evolve MC from passive project dashboard to active coding session orchestrator — tracking all Claude Code and Aider sessions, detecting file conflicts across parallel sessions, routing tasks to the right model tier, and monitoring Claude usage budget. LM Studio on Mac Mini provides local model availability awareness.

- [x] **Phase 11: Data Foundation** - Session/budget schema, Drizzle migration, Zod types, model tier config, infra scripts update (completed 2026-03-16)
- [x] **Phase 12: Session Ingestion** - Session lifecycle API, hook scripts, project resolution, session reaper, Aider passive detection (completed 2026-03-16)
- [x] **Phase 13: LM Gateway + Budget** - LM Studio health probe, budget service, model/budget API endpoints, tier routing recommendations (completed 2026-03-16)
- [x] **Phase 14: Intelligence Layer** - File-level conflict detection across active sessions, SSE conflict alerts, session-project relationships (completed 2026-03-16)
- [x] **Phase 15: Dashboard** - Active sessions panel, budget widget, conflict alert cards, session badges on project cards, SSE-driven updates (completed 2026-03-16)

Full details: [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)

</details>

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-5 | v1.0 | 15/15 | Complete | 2026-03-10 |
| 6-10 | v1.1 | 12/12 | Complete | 2026-03-15 |
| 11-15 | v1.2 | 12/12 | Complete | 2026-03-16 |
