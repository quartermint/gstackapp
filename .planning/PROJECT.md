# gstackapp

## What This Is

Cognitive code review platform for GitHub PRs with a portable AI harness. Five AI review stages (CEO, Eng, Design, QA, Security) run as a pipeline on every PR, surface cross-repo intelligence, and visualize quality trends. The `@gstackapp/harness` package provides provider-agnostic LLM routing with automatic failover, portable skill execution, and state sync across devices.

## Core Value

Every PR gets reviewed by five specialized AI brains -- each one catches what the others miss. The pipeline visualization makes the review process visible, not a black box.

## Current State

**v1.1 @gstackapp/harness shipped 2026-04-03.**

Two packages:
- `@gstackapp/api` — PR review pipeline, GitHub webhook handling, dashboard (v1.0)
- `@gstackapp/harness` — Provider-agnostic LLM routing, model failover, skill system, state sync (v1.1)

407 tests passing across both packages. 65 files, ~4800 LOC added in v1.1.

## Requirements

### Validated

- ✓ GitHub App installs on user's repos and receives PR webhooks — v1.0
- ✓ PR webhook triggers 5-stage cognitive review pipeline — v1.0
- ✓ Each stage runs in parallel with Claude API tool_use — v1.0
- ✓ Pipeline posts incremental review results as PR comment — v1.0
- ✓ Dashboard shows pipeline visualization as hero view — v1.0
- ✓ Dashboard shows reverse-chronological feed of PR reviews — v1.0
- ✓ Dashboard shows quality trends over time — v1.0
- ✓ Cross-repo findings embedded via sqlite-vec — v1.0
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

(To be defined in next milestone)

### Out of Scope

- Light mode — dark-only
- Mobile responsive — desktop-only
- GitHub OAuth / multi-user / org scoping — single-user, no auth
- GitHub Checks API merge blocking — PR comments only
- Next.js / tRPC migration — Hono + React
- Postgres / pgvector migration — SQLite + sqlite-vec
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
- Backend: Hono + SQLite + Drizzle ORM (api + harness packages)
- Frontend: React + Vite
- AI: Claude API with tool_use + multi-provider failover (Gemini, OpenAI/Qwen)
- Embeddings: sqlite-vec
- Code access: Shallow clone to /tmp, sandboxed file tools
- Deploy: Mac Mini via Tailscale Funnel
- Harness: Provider registry, model failover router, skill runner, state sync

**v1.1 additions:**
- `packages/harness/` — independently publishable npm package
- Router: ModelRouter with 3-layer failover, BurnRateCalculator, ProactivePoller, RequestQueue
- Skills: ToolAdapter interface (3 adapters), SkillManifest schema, SkillRegistry, runSkill runner
- Sync: rsync over Tailscale with lock files, exclude rules, bidirectional push/pull

## Constraints

- **Stack**: Hono + SQLite + Drizzle + React
- **Deploy**: Mac Mini via Tailscale Funnel
- **AI Provider**: Multi-provider via @gstackapp/harness (Claude primary, Gemini/Qwen failover)
- **Auth**: None — dashboard is public, single-user
- **Display**: Desktop-only, dark mode only, 1024px min-width
- **Security**: Sandboxed AI file access

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 5 stages from day 1 | Full cognitive pipeline is the product differentiator | ✓ Good — v1.0 |
| Cross-repo embeddings from day 1 | sqlite-vec is lightweight, early data accumulation | ✓ Good — v1.0 |
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

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-04-03 after v1.1 @gstackapp/harness milestone completion*
