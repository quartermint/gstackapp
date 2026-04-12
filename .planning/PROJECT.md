# gstackapp

## What This Is

Personal product operator and mission control for the quartermint ecosystem. Two user modes: Ryan's power dashboard (multi-project overview, pipeline topology, ideation workspace, gbrain knowledge console, cross-repo intelligence) and a simplified operator flow for non-technical users (intake, clarify, execute, verify, handoff). Powered by a 5-stage cognitive quality pipeline (CEO, Eng, Design, QA, Security), gbrain knowledge integration (10,609 pages of compiled project/people/decision context), and the `@gstackapp/harness` for provider-agnostic LLM routing with automatic failover.

## Core Value

Encode Ryan's development workflow — taste, quality standards, accumulated knowledge — into a system that non-technical people can drive directly. The quality pipeline ensures every output is vetted by five specialized AI brains. The knowledge layer means the system knows your world, not just your prompt.

## Current State

**v2.0 complete 2026-04-12. All 5 phases shipped.**

Two packages:
- `@gstackapp/api` — PR review pipeline, operator mode, gbrain integration, power dashboard (v2.0)
- `@gstackapp/harness` — Provider-agnostic LLM routing, model failover, skill system, state sync (v1.1)

524 tests passing across both packages. v2.0 added: auth + harness independence (Phase 17), operator mode with intake→clarify→execute→verify flow (Phase 18), gbrain knowledge integration with 10K+ page context (Phase 19), and Ryan Power Dashboard with 5 views — project overview, pipeline topology, ideation workspace, gbrain console, cross-repo intelligence (Phase 20).

## Requirements

### Validated

- ✓ GitHub App installs on user's repos and receives PR webhooks — v1.0
- ✓ PR webhook triggers 5-stage cognitive review pipeline — v1.0
- ✓ Each stage runs in parallel with Claude API tool_use — v1.0
- ✓ Pipeline posts incremental review results as PR comment — v1.0
- ✓ Dashboard shows pipeline visualization as hero view — v1.0
- ✓ Dashboard shows reverse-chronological feed of PR reviews — v1.0
- ✓ Dashboard shows quality trends over time — v1.0
- ✓ Cross-repo findings embedded via pgvector (deferred to Phase 20, previously sqlite-vec) — v1.0
- ✓ Cross-repo intelligence surfaces "Seen in your other repos" — v1.0
- ✓ In-app guided onboarding — v1.0
- ✓ Structured findings with PASS/FLAG/BLOCK/SKIP verdicts — v1.0
- ✓ Desktop-only (1024px min), dark mode only — v1.0
- ✓ Deployed on Mac Mini via Tailscale Funnel — v1.0
- ✓ Provider-agnostic tool types (no Anthropic SDK leak) — v1.1
- ✓ Standalone config (no MONOREPO_ROOT) — v1.1
- ✓ @gstackapp/harness as publishable npm package — v1.1
- ✓ 3-layer model failover router (predictive + proactive + reactive) — v1.1
- ✓ Tool adapters for cross-harness portability — v1.1
- ✓ SkillManifest + registry + runner — v1.1
- ✓ State sync via rsync over Tailscale — v1.1

### Active

See REQUIREMENTS.md for v2.0 requirements with REQ-IDs.

## Current Milestone: v2.0 Mission Control 4.0 — The Cathedral

**Goal:** Transform gstackapp from a cognitive code review platform into a personal product operator with two user modes — Ryan's power dashboard and a simplified operator flow for non-technical users — powered by gbrain knowledge integration and an independent harness execution engine.

**Target features:**
- Phase 15 eng review rework (IDEA-05/06/07/08) + human UAT (prerequisite)
- Operator mode: intake → clarify → execute → verify → handoff with error paths and escalation
- Ryan power dashboard: multi-project overview, pipeline topology, ideation workspace, gbrain console, cross-repo intelligence
- gbrain MCP integration: search, entity lookup, related pages with async prefetch
- Harness independence: web-triggered agent execution loop without Claude Code
- Auth: Tailscale ACL + magic link fallback, operator vs admin roles
- Stack docs update: reflect SQLite → Neon Postgres migration

### Out of Scope

- Light mode — dark-only
- Mobile responsive — desktop-only
- ~~GitHub OAuth / multi-user / org scoping~~ — v2.0 adds Tailscale ACL + magic link auth with operator/admin roles (not GitHub OAuth)
- GitHub Checks API merge blocking — PR comments only
- Next.js / tRPC migration — Hono + React
- ~~Postgres / pgvector migration~~ — DONE (c1fc394, migrated to Neon Postgres)
- BullMQ / Redis job queue — in-process execution
- Fly.io deployment — Mac Mini
- CRDT/real-time sync — rsync over Tailscale sufficient
- Mobile agent client — tmux+ssh for remote access
- Multi-user sync auth — single-user, lock file sufficient
- Skill marketplace / versioning / hot-reload — deferred
- Cost dashboard UI — deferred
- Auto-tuning of failover thresholds — deferred

## Context

**Origin:** Repo was quartermint/mission-control, renamed to quartermint/gstackapp on 2026-03-30. MC v2.0 was a personal dashboard; gstackapp is a platform product.

**Competitive landscape:** CodeRabbit, Qodo, Graphite, Buildkite. All single-pass review. gstackapp's differentiator is multi-stage cognitive pipeline + cross-repo memory.

**Design system:** DESIGN.md (2026-03-30). Industrial precision aesthetic, electric lime (#C6FF3B) accent, operations-room dark (#0B0D11), pipeline topology as hero.

**Tech stack:**
- Backend: Hono + Postgres (Neon) + Drizzle ORM (api package) + SQLite (harness token tracking)
- Frontend: React + Vite
- AI: Claude API with tool_use + multi-provider failover (Gemini, OpenAI/Qwen)
- Embeddings: pgvector (deferred, cross-repo search pending Phase 20)
- Code access: Shallow clone to /tmp, sandboxed file tools
- Deploy: Mac Mini via Tailscale Funnel
- Harness: Provider registry, model failover router, skill runner, state sync

**v1.1 additions:**
- `packages/harness/` — independently publishable npm package
- Router: ModelRouter with 3-layer failover, BurnRateCalculator, ProactivePoller, RequestQueue
- Skills: ToolAdapter interface (3 adapters), SkillManifest schema, SkillRegistry, runSkill runner
- Sync: rsync over Tailscale with lock files, exclude rules, bidirectional push/pull

## Constraints

- **Stack**: Hono + Postgres (Neon/PGlite) + Drizzle + React (migrated from SQLite in c1fc394)
- **Deploy**: Mac Mini via Tailscale Funnel
- **AI Provider**: Multi-provider via @gstackapp/harness (Claude primary, Gemini/Qwen failover)
- **Auth**: Tailscale ACL primary + magic link email fallback (v2.0), operator vs admin roles
- **Display**: Desktop-only, dark mode only, 1024px min-width
- **Security**: Sandboxed AI file access

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 5 stages from day 1 | Full cognitive pipeline is the product differentiator | ✓ Good — v1.0 |
| Cross-repo embeddings from day 1 | sqlite-vec was lightweight, early data accumulation. Migrated to Neon Postgres in c1fc394. Vector search migration to pgvector deferred to Phase 20 (DASH-05). | ✓ Good — v1.0 |
| In-app guided onboarding | Low effort, high impact for first-run experience | ✓ Good — v1.0 |
| Pipeline-first dashboard | Design system mandates pipeline as hero (60%+ viewport) | ✓ Good — v1.0 |
| PR comment over Checks API | Simpler, more visible | ✓ Good — v1.0 |
| Single pipeline_run per force-push | Clean re-render, no stale data | ✓ Good — v1.0 |
| Tool_use skill runtime | Gives AI structured code access | ✓ Good — v1.0/v1.1 |
| Extract @gstackapp/harness | Provider abstraction independently publishable | ✓ Good — v1.1, 19kB tarball |
| 3-layer failover | Belt+suspenders+parachute for billing caps | ✓ Good — v1.1, tested |
| Two fallback policies (none/quality-aware) | PR reviews: no-fallback. Harness standalone: quality-aware | ✓ Good — v1.1 |
| Never switch providers mid-tool-loop | Tool call ID formats differ, mid-loop switch corrupts state | ✓ Good — v1.1, boundary test |
| File-based sync via rsync | Boring technology over Tailscale, markdown only | ✓ Good — v1.1, live-tested |
| WAL + batch commit for token tracking | 5min flush, graceful degradation on corruption | ✓ Good — v1.1 |
| Reframe from code review to personal product operator | Non-technical users (Ryn, Bella, Andrew) are the bottleneck signal; Ryan is the primary power user | v2.0 — design doc APPROVED |
| gbrain + delivery quality as co-equal differentiators | Codex challenged knowledge-only; user defended both pillars | v2.0 — validated via cross-model review |
| Tailscale ACL + magic link auth | Zero new infra for tailnet users; SendGrid fallback already configured for OIP | v2.0 |
| Async gbrain prefetch (not inline blocking) | Queries run during user brief review; 5s latency acceptable when prefetched | v2.0 |
| Descope agent orchestration and deployment controls | Separate product concerns; not in success criteria | v2.0 — per spec review |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-04-11 — v2.0 Mission Control 4.0 milestone started*
