# gstackapp

## What This Is

Cognitive code review platform for GitHub PRs. Five AI review stages (CEO, Eng, Design, QA, Security) run as a pipeline on every PR, surface cross-repo intelligence ("Seen in your other repos"), and visualize quality trends over time. Built for the YC/gstack builder community — developers who ship daily and care about code quality, not enterprise procurement.

## Core Value

Every PR gets reviewed by five specialized AI brains -- each one catches what the others miss. The pipeline visualization makes the review process visible, not a black box.

## Current Milestone: v1.1 @gstackapp/harness

**Goal:** Extract provider abstraction into independently published npm package with automatic model failover (Claude -> Gemini -> Qwen) for billing cap resilience.

**Target features:**
- Seam cleanup: fix Anthropic.Tool[] type leak in tools.ts, decouple config from MONOREPO_ROOT
- Extract @gstackapp/harness as publishable npm package with CLI entry point
- 3-layer model failover router (predictive burn rate + proactive API polling + reactive 429 catch)
- Tool name adapters for cross-harness portability (Claude Code, OpenCode, Codex)
- SkillManifest JSON Schema spec + registry + runner
- State sync for memory and GSD state via rsync over Tailscale with lock file conflict guard

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] GitHub App installs on user's repos and receives PR webhooks
- [ ] PR webhook triggers 5-stage cognitive review pipeline (CEO, Eng, Design, QA, Security)
- [ ] Each stage runs in parallel with Claude API tool_use (read_file, list_files, search_code)
- [ ] Pipeline posts incremental review results as a PR comment (updates in-place)
- [ ] Dashboard shows pipeline visualization as the hero view (60%+ viewport)
- [ ] Dashboard shows reverse-chronological feed of all PR reviews across repos
- [ ] Dashboard shows quality trends over time (per repo, per stage)
- [ ] Cross-repo findings embedded via sqlite-vec from day 1
- [ ] Cross-repo intelligence surfaces "Seen in your other repos" when matches exist
- [ ] In-app guided onboarding: install GitHub App → pick repos → trigger first review
- [ ] Each stage produces structured findings with PASS/FLAG/BLOCK/SKIP verdicts
- [ ] Desktop-only (1024px min), dark mode only
- [ ] Deployed on Mac Mini via Tailscale Funnel

### Out of Scope

- Light mode -- dark-only
- Mobile responsive -- desktop-only
- GitHub OAuth / multi-user / org scoping -- single-user, no auth
- GitHub Checks API merge blocking -- PR comments only
- Next.js / tRPC migration -- Hono + React
- Postgres / pgvector migration -- SQLite + sqlite-vec
- BullMQ / Redis job queue -- in-process execution
- Fly.io deployment -- Mac Mini
- gstack OpenCode host PR -- deferred, build first-party harness first
- CRDT/real-time sync -- rsync over Tailscale sufficient for v1.1
- Mobile agent client -- tmux+ssh for remote access
- Multi-user sync auth -- single-user, lock file sufficient

## Context

**Origin:** Repo was quartermint/mission-control, renamed to quartermint/gstackapp on 2026-03-30. MC v2.0 was a personal dashboard; gstackapp is a platform product. Fresh codebase, preserved git history.

**Competitive landscape:** CodeRabbit, Qodo, Graphite, Buildkite. All single-pass review (one AI brain per PR). gstackapp's differentiator is multi-stage cognitive pipeline + cross-repo memory.

**Design system:** Full design system defined in DESIGN.md (2026-03-30). Industrial precision aesthetic, electric lime (#C6FF3B) accent, operations-room dark (#0B0D11), pipeline topology as hero, General Sans + Geist + JetBrains Mono type stack.

**Tech stack (Phase 1):**
- Backend: Hono + SQLite + Drizzle ORM
- Frontend: React
- AI: Claude API with tool_use
- Embeddings: sqlite-vec
- Code access: Shallow clone to /tmp, sandboxed file tools
- Deploy: Mac Mini, GitHub App webhook via Tailscale Funnel
- Database: 6 tables — github_installations, repositories, pull_requests, pipeline_runs, stage_results, findings

**Architecture decisions from eng review:**
- Skill runtime: tool_use (1B) with future distillation to single API call (1A)
- New pipeline_run per force-push (re-render comment from latest)
- Shared StageResult Zod schema + per-stage typed findings
- Separate prompt files (packages/api/src/pipeline/prompts/*.md)
- Strict path + symlink sandboxing (fs.realpathSync after path.resolve)
- AI SDK MockLanguageModelV1 for test mocking
- Dashboard IS the landing page (no auth Phase 1)
- Webhook durability: persist RUNNING status before stages, detect stale on restart

## Constraints

- **Stack**: Hono + SQLite + Drizzle + React — proven from MC, same stack fresh code
- **Deploy**: Mac Mini via Tailscale Funnel — no cloud infra for Phase 1
- **AI Provider**: Claude API only — multi-provider deferred to Phase 2
- **Auth**: None for Phase 1 — dashboard is public, single-user
- **Display**: Desktop-only, dark mode only, 1024px min-width
- **Security**: Sandboxed AI file access — path resolution + symlink escape prevention

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 5 stages from day 1 | Full cognitive pipeline is the product differentiator | — Pending |
| Cross-repo embeddings from day 1 | sqlite-vec is lightweight, early data accumulation is valuable | — Pending |
| In-app guided onboarding | Low effort, high impact for first-run experience | — Pending |
| Pipeline-first dashboard | Design system mandates pipeline as hero (60%+ viewport) | — Pending |
| PR comment over Checks API | Simpler, more visible, Checks API deferred to Phase 2 | — Pending |
| Single pipeline_run per force-push | Clean re-render, no stale data accumulation | — Pending |
| Tool_use skill runtime | Gives AI structured code access, future distillation to single-call | -- Pending |
| Extract @gstackapp/harness | Provider abstraction independently publishable for model sovereignty | -- Pending |
| 3-layer failover (predictive+proactive+reactive) | Belt+suspenders+parachute for billing cap resilience | -- Pending |
| Two fallback policies | gstackapp PR reviews: no-fallback. Harness: quality-aware routing | -- Pending |
| Never switch providers mid-tool-loop | Tool call ID formats differ across providers, mid-loop switch corrupts state | -- Pending |
| File-based sync via rsync | Boring technology over Tailscale, markdown only (not SQLite) | -- Pending |
| WAL + batch commit for token tracking | Flush every 5min, graceful degradation if WAL corrupted | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-03 after milestone v1.1 initialization*
