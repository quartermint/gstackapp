# Phase 2: Pipeline Engine - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

5-stage parallel Claude tool_use pipeline with sandboxed file access. Each stage (CEO, Eng, Design, QA, Security) produces structured findings. This is the core product — the pipeline IS gstackapp.

</domain>

<decisions>
## Implementation Decisions

### Model Selection
- **D-01:** Mixed model strategy — Opus for CEO + Security stages (high-judgment, strategic), Sonnet for Eng + Design + QA stages (pattern-matching, lower cost)
- **D-02:** Use prompt caching headers + `token-efficient-tools` beta header on all stages for 60-80% cost reduction
- **D-03:** Estimated cost: ~$100-400/mo depending on PR volume at mixed models with caching

### Stage Execution
- **D-04:** All 5 stages execute in parallel via Promise.allSettled
- **D-05:** Each stage gets an independent Claude API conversation with its own tool_use context
- **D-06:** Dedicated prompt file per stage at `packages/api/src/pipeline/prompts/{stage}.md`
- **D-07:** Shared StageResult Zod schema + per-stage typed findings

### Smart Stage Filtering
- **D-08:** CEO and Design stages use smart filtering — only fire when relevant changes detected (UI changes, new features, architecture shifts, config changes). Eng, QA, Security fire on every PR.
- **D-09:** Filtering logic runs before clone/AI invocation to save cost on irrelevant PRs
- **D-10:** Filter criteria: CEO fires on new files, architecture changes, dependency changes, large PRs. Design fires on CSS/component/UI file changes.

### Failure Handling
- **D-11:** Default behavior: retry once on API error/timeout, then FLAG the stage for user review (not silent SKIP)
- **D-12:** User-configurable in onboarding: can choose between retry+FLAG (default), retry+SKIP, or fail-fast
- **D-13:** Stage timeouts: 5 minutes per stage max. Pipeline timeout: 10 minutes total.
- **D-14:** Pipeline persists RUNNING status before stages begin (crash recovery)

### Sandbox Security
- **D-15:** Shallow clone to /tmp with `git clone --depth=1 --branch`
- **D-16:** Post-clone symlink removal: `find /tmp/clone-dir -type l -delete`
- **D-17:** Path validation: `fs.realpathSync()` BEFORE prefix check (CVE-2025-53109 prevention)
- **D-18:** Tool set: read_file, list_files, search_code (grep-like). No write tools.

### Claude's Discretion
- Tool_use loop iteration limits per stage
- Token budget allocation per stage
- Prompt engineering approach for CEO and Design stages (novel, no prior art — iterate after seeing real outputs)
- Clone cleanup strategy (on-completion vs timer-based)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline Architecture
- `.planning/research/ARCHITECTURE.md` — Full system architecture with component diagram, data flows, recommended project structure
- `.planning/research/ARCHITECTURE.md` §Component Responsibilities — Stage executor, sandbox file layer, pipeline orchestrator specs

### Security
- `.planning/research/PITFALLS.md` §Pitfall 3 — Sandbox escape prevention (CVE-2025-53109/53110)
- `.planning/research/PITFALLS.md` §Pitfall 4 — Installation token expiration mid-pipeline

### Cost & Signal
- `.planning/research/PITFALLS.md` §Pitfall 1 — Review comment noise (70-90% ignored industry-wide)
- `.planning/research/PITFALLS.md` §Pitfall 5-6 — Claude API cost management, SQLite concurrency

### Stack
- `.planning/research/STACK.md` — @anthropic-ai/sdk v0.80, tool_use configuration, token-efficient-tools header

### Design System
- `DESIGN.md` §Stage Identity Colors — CEO=#FF8B3E, Eng=#36C9FF, Design=#B084FF, QA=#2EDB87, Security=#FF5A67

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1 establishes: Drizzle schema, Hono routes, shared Zod types

### Established Patterns
- Phase 1 establishes: route structure, DB access patterns, webhook handling

### Integration Points
- Webhook handler triggers pipeline orchestrator
- Pipeline writes to stage_results and findings tables
- SSE broadcaster emits stage completion events (consumed by Phase 4 dashboard)

</code_context>

<specifics>
## Specific Ideas

- CEO stage is Garry Tan's gstack philosophy applied to code review — challenges the premise of the change, not just the implementation. "Does this change make sense for users? Is this the right abstraction?"
- Design stage reviews CSS changes, component structure, accessibility, design system adherence
- Security stage: injection, XSS, auth issues, sensitive data exposure
- QA stage: test coverage gaps, edge cases, error handling
- Eng stage: architecture, performance, maintainability, code quality

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-pipeline-engine*
*Context gathered: 2026-03-30*
