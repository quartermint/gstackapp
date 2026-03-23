# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Mission Control MVP

**Shipped:** 2026-03-10
**Phases:** 5 | **Plans:** 15 | **Execution time:** 2.0 hours

### What Was Built
- API-first personal operating environment with Hono API, SQLite + FTS5, project scanner
- Departure board dashboard with warm Arc-browser visual identity and real-time SSE updates
- AI-powered capture pipeline with Gemini categorization, link extraction, stale triage
- Natural language search across captures, projects, and commits via command palette
- Sprint heatmap, "Previously on..." breadcrumbs, stale nudges, Mac Mini health pulse

### What Worked
- GSD phase pipeline kept scope tight — 5 phases delivered in 37 calendar days, 2 hours execution time
- "Persist first, enrich later" pattern eliminated capture latency concerns entirely
- Zod schema-first approach gave end-to-end type safety with minimal boilerplate
- App factory pattern (createApp) made testing trivial — 135 tests, all in-memory SQLite
- Phase 5 averaged 5min/plan — fastest phase because foundation was solid

### What Was Inefficient
- Plain fetch() in hooks survived through 4 phases before RPC migration in tech debt cleanup — should have committed to hc client earlier
- Phase 4 Plan 3 (search UI) took 25min vs 5min average — command palette integration with cmdk had unexpected complexity around unique item values and CSS flash issues
- Route registration had to be refactored from imperative to chaining for Hono RPC type preservation — not discovered until tech debt cleanup

### Patterns Established
- Hono route chaining (not imperative app.route()) for RPC type preservation
- useRef pattern for keyboard shortcut handlers to avoid stale closures
- fetchCounter pattern for SSE-triggered data refresh
- Delete-before-insert dedup for FTS5 indexes (no ON CONFLICT support)
- Fire-and-forget enrichment via queueMicrotask for single-user v1

### Key Lessons
1. **Commit to typed clients early.** Plain fetch "for now" persisted across 4 phases. The RPC migration was clean but could have been avoided.
2. **FTS5 has sharp edges.** No ON CONFLICT, no Drizzle support, no contentless column retrieval. Know the limitations upfront.
3. **cmdk is powerful but opinionated.** Unique item values, filter mode switching, and CSS isolation all needed workarounds.
4. **Tailwind v4 is a different paradigm.** @theme tokens and @custom-variant replace JS config entirely — don't reach for v3 patterns.
5. **Zero tech debt at milestone close is achievable.** The 5-item cleanup took one quick task. Don't carry debt into the next milestone.

### Cost Observations
- Model mix: Opus for planning, Sonnet for execution (balanced profile)
- Sessions: ~6 sessions across 2 calendar days of active work
- Notable: 15 plans in 2 hours = 8min average per plan, Phase 5 hit 5min/plan

---

## Milestone: v1.1 — Git Health Intelligence + MCP

**Shipped:** 2026-03-15
**Phases:** 5 | **Plans:** 12 | **Execution time:** ~1 session (plan + execute all 5 phases)

### What Was Built
- Git health engine with 7 check types, risk scoring, and `detectedAt` age-based severity escalation
- Multi-host copy discovery with remote URL normalization, ancestry-based divergence detection, stale SSH graceful degradation
- Dashboard risk feed (compact single-line severity cards), sprint timeline (thin swimlane bars), health dots (with split-dot for diverged copies)
- `@mission-control/mcp` package with 4 tools and session startup hook
- Portfolio-dashboard deprecated and replaced

### What Worked
- **Detailed design spec upfront** — the v1.1 design spec (rev 2) eliminated nearly all ambiguity. Discuss-phase sessions were fast because decisions were already made.
- **Pure function architecture** — health checks as `HealthScanData -> HealthFindingInput | null` enabled 54 unit tests with zero DB or SSH mocking. Fastest phase to test.
- **Parallel Wave 1 execution (Phase 9)** — risk feed and sprint timeline built simultaneously with zero file conflicts. Wave design paid off.
- **Integration checker caught 3 real bugs** — manual refresh missing sqlite arg, wrong check type string, missing GitHub unmonitored guard. All fixed before ship.
- **Research phase identified the critical SQLite limitation** — partial unique index doesn't work with `onConflictDoUpdate`. Saved hours of debugging.

### What Was Inefficient
- **Discuss-phase was mostly "All fine as-is"** — the design spec already covered everything. Could have skipped discuss-phase for infrastructure phases (6, 7, 8) and gone straight to plan.
- **SUMMARY frontmatter inconsistency** — `one_liner` and `requirements-completed` fields sometimes present, sometimes missing. Made milestone completion extraction fragile.
- **Nyquist VALIDATION.md frontmatter never updated** — all phases left at `nyquist_compliant: false` despite all tests passing. Cosmetic but messy.

### Patterns Established
- `SELECT-then-UPDATE/INSERT` transaction for SQLite upserts with partial unique conditions (no `onConflictDoUpdate`)
- Post-scan health phase (not inline) — run all checks after all repos scanned, enabling cross-host reconciliation
- `fetchCounter` SSE pattern extended to `health:changed` events — notification-only, no payload
- Warm severity palette (deep rust / warm gold / sage green) as the dashboard's native severity language
- `p-limit(10)` for concurrent git process management across 35+ repos

### Key Lessons
1. **A design spec replaces discuss-phase for well-defined milestones.** When the spec is detailed enough, `/gsd:plan-phase --prd` would have been faster than discuss-phase.
2. **Integration checking is worth the time.** 3 bugs caught that would have been embarrassing in production — all were cross-phase wiring issues invisible to per-phase verification.
3. **Pure functions + side effects separation pays double.** Fast tests AND clear integration points. The health engine was the most complex phase but the cleanest to verify.
4. **SQLite has upsert gotchas.** `INSERT OR REPLACE` is DELETE+INSERT (kills `detectedAt`). `onConflictDoUpdate` requires unconditional unique indexes. Know the limitations.
5. **Warm palette works better than standard severity colors.** The dashboard feels cohesive rather than bolted-on. Design energy matters.

### Cost Observations
- Model mix: Opus for planning + execution, Sonnet for verification + research synthesis (quality profile)
- Entire milestone (5 phases, 12 plans, 34 requirements) completed in a single extended session
- Notable: Phase 9 Wave 1 parallel execution saved significant wall-clock time

---

## Milestone: v2.0 — Intelligence Engine

**Shipped:** 2026-03-23
**Phases:** 7 | **Plans:** 25 | **Tasks:** 53 | **Commits:** 117

### What Was Built
- Hybrid search: sqlite-vec + BM25 + RRF fusion + LM Studio query expansion + cross-encoder reranking
- Capture intelligence: few-shot AI with user corrections, 5-type extraction with grounding, Capacities import, iMessage monitoring
- Knowledge compounding: solutions registry auto-populated from Claude Code sessions, compound score dashboard
- Active intelligence daemon: "Previously on..." narratives, daily digest, routing, tool calling — all local LLM
- iOS edge intelligence: Apple Foundation Models on-device classification, offline capture enrichment
- Proactive insights: morning digest, stale capture triage, activity patterns, cross-project insights
- Bella client: chat-first "Ryan interpreter" with 7 MC data tools and API explorer

### What Worked
- **Vision doc before roadmap** — v2.0-VISION.md defined the intelligence transformation clearly, phases mapped to it cleanly
- **Local-first AI stack** — LM Studio + sqlite-vec + constrained generation gave full intelligence without external API dependency
- **Reuse of existing patterns** — fetchCounter, SSE events, ON CONFLICT upserts, health findings table all extended naturally
- **Phase 38 (Bella) as forcing function** — building a second client validated the API-first architecture and exposed the searchMC bypass gap
- **Quick task for tech debt** — 5 functional debt items fixed in one atomic quick task before milestone close

### What Was Inefficient
- **searchMC bypassed hybrid search** — Phase 38 chat tools called BM25-only searchUnified instead of hybridSearch. Caught by audit, not by tests. Integration test for cross-phase wiring would have caught this during execution.
- **CAP-03 extraction display never wired** — LEFT JOIN missing in listCaptures, so ExtractionBadges/GroundedText were hollow for the entire milestone. Detected at audit, not during Phase 33 verification.
- **REQUIREMENTS.md was v1.4** — v2.0 requirements tracked only in ROADMAP phase details and audit, not in a standalone REQUIREMENTS.md. Made audit cross-referencing harder.
- **Nyquist validation never completed** — 0/7 phases compliant. VALIDATION.md files created but never finalized.

### Patterns Established
- ON CONFLICT(compound_key) DO UPDATE for intelligence cache upserts
- Cache-first API serving with async regeneration via queueMicrotask
- z.discriminatedUnion for type-safe tool dispatch without native function calling
- Content-hash dedup (SHA-256) for insights, solutions, knowledge — same pattern everywhere
- Model-tier-aware context budgets (regex pattern matching on model name)
- zodSchema() for AI SDK tool definitions (workaround for v6 overload resolution)

### Key Lessons
1. **Integration tests across phases are non-negotiable.** Both searchMC and CAP-03 were cross-phase wiring bugs invisible to per-phase verification. The milestone audit caught them but should have been caught during execution.
2. **Build the second client early.** Bella's chat forced real testing of the API surface. The searchMC bypass would have persisted indefinitely with only the dashboard as client.
3. **Local LLM is viable for production intelligence.** Narratives, extraction, query expansion, and tool calling all work reliably with Qwen3.5 via LM Studio. Zero API costs.
4. **Quick task is the right scope for tech debt.** 5 items across 3 phases fixed in one session with atomic commits. Don't let debt accumulate across milestones.
5. **REQUIREMENTS.md should exist for every milestone.** v2.0 skipped it and paid the cost in audit complexity.

### Cost Observations
- Model mix: 100% Opus for planning + execution (quality profile)
- 7 phases shipped in a single calendar day (117 commits)
- Notable: Phase 38 (Bella) required AI SDK v6 migration mid-execution (zodSchema, stepCountIs, toTextStreamResponse changes)

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Execution Time | Phases | Plans | Commits | Key Change |
|-----------|---------------|--------|-------|---------|------------|
| v1.0 | 2.0 hours | 5 | 15 | ~60 | First milestone — established GSD pipeline patterns |
| v1.1 | ~1 session | 5 | 12 | ~40 | Design spec upfront, parallel Wave 1, integration audit |
| v1.2 | ~1 session | 5 | 12 | ~50 | Session orchestrator, local LLM gateway, 1-day turnaround |
| v1.3 | 2 days | 7 | 19 | ~80 | Auto-discovery, GitHub stars, CLI client |
| v1.4 | ~2 sessions | 9 | 19 | ~100 | iOS companion, cross-project intelligence, knowledge unification |
| v2.0 | 1 day | 7 | 25 | 117 | Intelligence daemon, hybrid search, local AI stack, second client |

### Cumulative Quality

| Milestone | Tests | Tech Debt at Close | LOC | New Packages |
|-----------|-------|--------------------|-----|--------------|
| v1.0 | 135 | 0 items | 12,121 | api, web, shared |
| v1.1 | 356 | 0 items | 25,426 | mcp |
| v1.2 | 462 | 4 items | ~32,000 | — |
| v1.3 | 610 | 0 items | ~38,000 | cli |
| v1.4 | 711 | 0 items | ~44,000 | iOS (sibling) |
| v2.0 | 1,115 | 0 items (fixed pre-close) | 70,076 | — |

### Top Lessons (Verified Across Milestones)

1. Foundation phase quality determines velocity of all subsequent phases
2. Persist first, enrich later — eliminates latency concerns and simplifies error handling
3. Detailed design specs eliminate discuss-phase overhead for well-defined milestones
4. Integration checking catches cross-phase wiring bugs invisible to per-phase verification
5. Pure functions + side effects separation accelerates both testing and integration
6. Build the second client early — validates API-first architecture and catches wiring gaps
7. Local LLM is viable for production intelligence at single-user scale
8. REQUIREMENTS.md should exist for every milestone — audit complexity increases without it
