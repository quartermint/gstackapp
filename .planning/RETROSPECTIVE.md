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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Execution Time | Phases | Key Change |
|-----------|---------------|--------|------------|
| v1.0 | 2.0 hours | 5 | First milestone — established GSD pipeline patterns |
| v1.1 | ~1 session | 5 | Design spec upfront, parallel Wave 1, integration audit |

### Cumulative Quality

| Milestone | Tests | Tech Debt | LOC |
|-----------|-------|-----------|-----|
| v1.0 | 135 | 0 items | 12,121 |
| v1.1 | 356 | 0 items | 25,426 |

### Top Lessons (Verified Across Milestones)

1. Foundation phase quality determines velocity of all subsequent phases
2. Persist first, enrich later — eliminates latency concerns and simplifies error handling
3. Detailed design specs eliminate discuss-phase overhead for well-defined milestones
4. Integration checking catches cross-phase wiring bugs invisible to per-phase verification
5. Pure functions + side effects separation accelerates both testing and integration
