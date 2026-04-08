# gstackapp

## What This Is

Personal AI command center for builders who ship across many projects. Central workspace where you see all project state, incubate new ideas through a structured ideation funnel (office-hours → CEO review → eng review → design), then launch autonomous GSD execution. Multi-provider harness routes work to Claude, GPT-Codex, Gemini, or Mac Mini local models based on task characteristics. PR review pipeline and cross-repo intelligence are features within the larger platform.

## Core Value

One place to see everything, start anything, and let AI execute autonomously after rich frontloading. The ideation-to-execution pipeline makes the creative process visible and the execution hands-free.

## Current Milestone: v2.0 Command Center

**Goal:** Transform gstackapp from a PR review platform into a central AI workspace — see all projects, incubate new ones through rich frontloading, then autonomous execution through GSD. Route work to the right model across frontier APIs and Mac Mini local.

**Target features:**
- Project Dashboard — cross-project state from .planning/, git, worklog, design docs
- Ideation Funnel — office-hours → CEO review → eng review → design consultation from the browser, idea-first (no repo required)
- Autonomous GSD Pipeline — one-click roadmap → discuss all phases → autonomous execution with real-time visualization
- Work Sessions — tab-based AI conversations with generator-based agent loop, context-aware
- Multi-Provider Routing — Claude, GPT-Codex, Gemini, Mac Mini local (Qwen3.5-35B-A3B, Gemma 4 26B-A4B), task-aware routing
- PR Review as Feature — existing v1.0 pipeline becomes one capability within the platform

**Key constraint:** gstackapp consumes gstack/GSD as upstream dependencies. Skills discovered dynamically from ~/.claude/skills/gstack/ and ~/.claude/get-shit-done/. No hardcoded skill logic.

## Previous State

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

(Defined in REQUIREMENTS.md for v2.0)

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

**Origin:** Repo was quartermint/mission-control, renamed to quartermint/gstackapp on 2026-03-30. MC v2.0 was a personal dashboard; gstackapp pivoted to PR review (v1.0), then harness extraction (v1.1), now evolving to personal AI command center (v2.0).

**Competitive landscape:** Claude Code, Cursor, Windsurf, HolyClaude, Trellis, Conductor. For PR review: CodeRabbit, Qodo. gstackapp's differentiator is unified ideation-to-execution pipeline across all projects with multi-provider routing including local models.

**Design system:** DESIGN.md (2026-03-30). Industrial precision aesthetic, electric lime (#C6FF3B) accent, operations-room dark (#0B0D11). Dashboard and session views to be designed for v2.0.

**Workflow foundation:** gstack (90 ideation skill invocations/18 days) and GSD (full lifecycle) are upstream dependencies consumed dynamically. The app surfaces their capabilities, doesn't reimplement them.

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
- **AI Provider**: Multi-provider via @gstackapp/harness (Claude, GPT-Codex, Gemini, Mac Mini local)
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
*Last updated: 2026-04-08 after v2.0 Command Center milestone start*
