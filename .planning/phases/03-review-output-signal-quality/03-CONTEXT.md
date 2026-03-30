# Phase 3: Review Output & Signal Quality - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

PR comment rendering with incremental stage updates, inline diff comments, three-tier noise filtering, and false positive feedback mechanism. This is the primary user-facing surface — what developers see in their PR.

</domain>

<decisions>
## Implementation Decisions

### PR Comment Format
- **D-01:** Pipeline topology format — visual pipeline diagram at top showing 5 stages with verdict badges (colored by stage spectral identity), then collapsible findings per stage below. NOT a CodeRabbit clone, NOT a generic scorecard.
- **D-02:** Pipeline topology in comment mirrors the dashboard hero experience — gstackapp's comments are visually recognizable and distinct from any competitor
- **D-03:** Comment updated in-place as each stage completes (incremental rendering). Skeleton → stage 1 result → stage 2 → ... → complete
- **D-04:** Per-PR mutex prevents concurrent comment updates from parallel stage completions
- **D-05:** Find-or-create pattern: search for existing gstackapp comment by marker, create if not found

### Inline PR Comments
- **D-06:** Inline review comments on specific diff lines via GitHub Pull Request Review API
- **D-07:** Only Tier 1 (critical) and Tier 2 (notable) findings get inline comments — Tier 3 stays in summary only
- **D-08:** Each inline comment includes stage identity (color badge/label) so developers know which "brain" found it

### Signal Quality
- **D-09:** Three-tier finding classification: Tier 1 (runtime errors, security vulns, breaking changes), Tier 2 (architecture issues, measurable perf problems), Tier 3 (style, subjective, minor)
- **D-10:** Only Tier 1 and Tier 2 appear prominently in PR comments. Tier 3 in collapsible "Minor" section
- **D-11:** Target signal ratio > 60% (Tier 1 + Tier 2 / Total findings). Track from launch.
- **D-12:** SKIP is a first-class verdict — silence is a valid review outcome

### Feedback Mechanism
- **D-13:** Both GitHub reactions AND dashboard feedback — GitHub reactions (thumbs up/down) on inline comments for zero-friction feedback, plus richer dashboard feedback UI with optional context
- **D-14:** Feedback stored in findings table for future prompt improvement (not auto-applied in v1)
- **D-15:** GitHub reaction webhooks captured to sync feedback to database

### Claude's Discretion
- Exact markdown template for PR comment topology
- How to render the pipeline flow in markdown (Unicode box drawing? ASCII? Emoji?)
- Collapsible section implementation details
- How to map findings to specific diff hunks

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Signal Quality
- `.planning/research/PITFALLS.md` §Pitfall 1 — Review comment noise (70-90% ignored), three-tier classification, signal ratio target
- `.planning/research/FEATURES.md` §Table Stakes — PR summary comment, inline comments, severity classification

### Architecture
- `.planning/research/ARCHITECTURE.md` §Comment Manager — Find-or-create pattern, per-PR mutex

### Design System
- `DESIGN.md` §Stage Identity Colors — Colors for stage badges in comments
- `DESIGN.md` §Status Verdict Colors — PASS=#2EDB87, FLAG=#FFB020, BLOCK=#FF5A67, SKIP=#6F7C90

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 2 establishes: StageResult Zod schema, Finding types, verdict enum

### Established Patterns
- Phase 2 establishes: per-stage structured output format

### Integration Points
- Pipeline orchestrator calls comment manager after each stage completes
- Findings table stores feedback alongside findings
- SSE broadcaster emits comment update events

</code_context>

<specifics>
## Specific Ideas

- PR comment should be visually recognizable as gstackapp — the pipeline topology makes it distinctive
- The comment IS the product for developers who never visit the dashboard
- Silence (SKIP) is better than noise — a stage that finds nothing should say nothing

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-review-output-signal-quality*
*Context gathered: 2026-03-30*
