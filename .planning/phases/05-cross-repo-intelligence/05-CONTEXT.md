# Phase 5: Cross-Repo Intelligence - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Embedding query layer that surfaces "Seen in your other repos" callouts. Embeddings have been collected since Phase 2 — this phase adds the matching and presentation layer.

</domain>

<decisions>
## Implementation Decisions

### Embedding Strategy
- **D-01:** Claude embeddings API for finding similarity — consistent quality with the review pipeline, API cost per embed
- **D-02:** Embed all findings on pipeline completion (collection started in Phase 2 via sqlite-vec)
- **D-03:** sqlite-vec brute-force KNN search sufficient for single-user scale (<100K embeddings)

### Matching & Presentation
- **D-04:** "Seen in your other repos" callouts appear when cosine similarity exceeds threshold (tune empirically)
- **D-05:** Cross-repo matches surfaced in both PR comments (inline callout) and dashboard PR detail view
- **D-06:** Callout design: warm gold highlight (#FFD166) per DESIGN.md, with repo name + finding reference

### Claude's Discretion
- Exact similarity threshold (start with 0.85, tune based on false positive rate)
- How to handle cross-repo matches when the matched finding was marked as false positive
- Embedding batch size and rate limiting
- Whether to embed the full finding text or a normalized representation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture
- `.planning/research/ARCHITECTURE.md` §Embedding Service — Generate and query finding embeddings
- `.planning/research/ARCHITECTURE.md` §Data Layer — sqlite-vec component

### Stack
- `.planning/research/STACK.md` §sqlite-vec — v0.1.8, brute-force KNN, DiskANN coming

### Design
- `DESIGN.md` §Cross-Repo Intelligence — Insight highlight color #FFD166

### Pitfalls
- `.planning/research/PITFALLS.md` — sqlite-vec performance at scale needs benchmarking

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 2 establishes: findings table, sqlite-vec loaded into better-sqlite3
- Phase 3 establishes: PR comment rendering (add cross-repo callout section)
- Phase 4 establishes: dashboard PR detail view (add cross-repo insights panel)

### Established Patterns
- sqlite-vec query patterns from Phase 2 embedding writes
- PR comment template from Phase 3 (add callout section)

### Integration Points
- Pipeline completion triggers embedding write
- PR comment rendering includes cross-repo callout section
- Dashboard PR detail view includes cross-repo insights panel

</code_context>

<specifics>
## Specific Ideas

- Cross-repo intelligence is the long-term moat — value compounds with usage
- "Seen in your other repos" is the differentiator no competitor has for indie devs
- Start conservative with high similarity threshold — false cross-repo matches are worse than missing some

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-cross-repo-intelligence*
*Context gathered: 2026-03-30*
