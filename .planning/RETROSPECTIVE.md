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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Execution Time | Phases | Key Change |
|-----------|---------------|--------|------------|
| v1.0 | 2.0 hours | 5 | First milestone — established GSD pipeline patterns |

### Cumulative Quality

| Milestone | Tests | Tech Debt | LOC |
|-----------|-------|-----------|-----|
| v1.0 | 135 | 0 items | 12,121 |

### Top Lessons (Verified Across Milestones)

1. Foundation phase quality determines velocity of all subsequent phases
2. Persist first, enrich later — eliminates latency concerns and simplifies error handling
