# TODOS

## Phase 0: Seam Cleanup (prerequisites for harness extraction)

- [ ] **Fix Anthropic.Tool[] type leak** — `packages/api/src/pipeline/tools.ts:33` `createSandboxTools()` returns `Anthropic.Tool[]` instead of normalized `ToolDefinition[]`. Blocks provider-agnostic extraction. Change return type, update callers in stage-runner.ts.

- [ ] **Decouple config from MONOREPO_ROOT** — `packages/api/src/lib/config.ts:8` resolves `.env` relative to monorepo root (4 levels up). Harness package needs standalone config loading. Extract config into harness with its own env resolution, keep gstackapp config as a wrapper.

## Phase 2: Router

- [ ] **Router observability** — Every route decision needs structured logging: which provider was selected, why (predictive/proactive/reactive trigger), token burn rate at decision time, prediction accuracy (compare predicted cap time vs actual). Metrics: failover rate, prediction error %, avg time between switches, sync lag.

- [ ] **Quality-aware routing** — Claude -> Gemini -> Qwen is a descending quality curve. Router should: (a) warn user when falling to lower-quality provider, (b) support task-level config for which tasks tolerate degradation vs which should queue until primary recovers, (c) track quality delta per provider per task type for trend visibility. Config: `fallbackPolicy: 'none' | 'quality-aware' | 'aggressive'`.

## Phase 11: State Sync

- [ ] **Sync CLI integration tests** — Phase 11 shipped as complete but CLI entry points may lack test coverage. The sync tests in `packages/harness/src/__tests__/sync-*.test.ts` cover the library layer but not the CLI commands. Sync bugs are silent data loss. Write integration tests that exercise the CLI entry points end-to-end. Independent of Phase 15 work.

## Phase 15: Ideation Pipeline

- [ ] **Formalize v1.2 REQUIREMENTS.md** — Requirement IDs IDEA-01 through IDEA-04, AUTO-01 through AUTO-04, and SESS-02 exist in verification reports and plan summaries but not in a formal requirements registry. Create `.planning/milestones/v1.2-REQUIREMENTS.md` for traceability. v1.0 and v1.1 both have REQUIREMENTS.md files; Phase 15 breaks the pattern.
