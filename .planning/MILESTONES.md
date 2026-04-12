# Milestones

## v2.0 Mission Control 4.0 — The Cathedral (Shipped: 2026-04-12)

**Phases completed:** 5 phases, 16 plans, 33 tasks

**Key accomplishments:**

- Tailscale ACL + magic link auth with operator/admin roles and session management (Phase 17)
- Harness-independent pipeline execution — web-triggered agent loops without Claude Code (Phase 17)
- Full operator mode: intake → clarify → execute → verify → handoff with 11 error/escalation paths (Phase 18)
- gbrain MCP integration: 10,609 pages of knowledge context with async prefetch, Postgres cache, and graceful degradation (Phase 19)
- Ryan Power Dashboard: 5-view admin surface — project overview with health scores, pipeline topology with SSE, ideation workspace, gbrain knowledge console, cross-repo intelligence (Phase 20)
- 524 tests passing across api + web packages, 25 requirements satisfied

---

## v1.1 @gstackapp/harness (Shipped: 2026-04-03)

**Phases completed:** 5 phases, 9 plans, 15 tasks

**Key accomplishments:**

- Removed Anthropic SDK type leak from tools.ts and MONOREPO_ROOT hardcoding from config.ts, enabling standalone package extraction
- @gstackapp/harness npm workspace with 3 LLM providers, model profiles, CLI, and 35 passing tests
- Rewired all api provider imports to @gstackapp/harness, deleted old providers/ directory, 265 tests pass across both workspaces
- Cross-SDK error detection, router config, token usage schema, and UsageBuffer with periodic SQLite flush
- ModelRouter implementing LLMProvider with predictive burn rate + reactive 429 catch + proactive API polling, quality-aware stage-tier routing (CEO/Security queue for Opus), and transparent resolveModel() wrapping
- ToolAdapter interface with 3 harness adapters (claude-code/opencode/codex), SkillManifest Zod schema, and SkillRegistry with local + remote loading
- runSkill tool_use loop with adapter translation, harness barrel exports for adapters/skills, and CLI run-skill command
- Rsync argument builder, PID-based lock file, and exclude/include rules for memory + planning file sync over Tailscale

---
