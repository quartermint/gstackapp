# Phase 15: Ideation Funnel & Autonomous GSD - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can go from a raw idea to autonomous execution — brainstorm in the browser, chain ideation skills, then launch one-click GSD with real-time progress. This is the capstone phase that ties everything together: sessions (Phase 12), routing (Phase 13), and dashboard (Phase 14) all feed into this.

</domain>

<decisions>
## Implementation Decisions

### Skill Invocation
- **D-01:** API wrapper using existing harness SkillRegistry + runSkill, SSE streaming results to browser
- **D-02:** Skills discovered dynamically from ~/.claude/skills/gstack/ and ~/.claude/get-shit-done/ — no hardcoded skill logic
- **D-03:** When gstack or GSD update, gstackapp picks up new skills automatically via dynamic discovery
- **D-04:** Hono API endpoints wrap skill runner, stream execution to browser via SSE (same pattern as v1.0 pipeline viz)

### Ideation Flow
- **D-05:** Thread + artifacts — conversation persists between chained skills AND each skill produces a durable artifact (design doc, review notes, architecture plan)
- **D-06:** Office-hours → CEO review → eng review → design consultation as a connected pipeline
- **D-07:** Each skill stage reads prior artifacts as context, building cumulative understanding
- **D-08:** User can start ideation with no repo — idea-first. Repo created later via scaffolding.

### Decision Gate UI
- **D-09:** Notification cards — non-blocking, positioned in sidebar or top bar
- **D-10:** User addresses decisions when ready — pipeline continues on non-blocking decisions
- **D-11:** Blocking decisions (architecture choices, scope questions) surface prominently but don't hide the pipeline progress

### Discuss Phase Intelligence
- **D-12:** Discuss phase carries forward ALL ideation context — office-hours design doc, CEO review decisions, eng review architecture, design consultation output
- **D-13:** Only asks user for decisions where their input genuinely adds value — if the ideation pipeline already decided something, don't re-ask
- **D-14:** Discuss all phases at once (batch discussion) so autonomous execution can run end-to-end

### Multi-Tab Sessions
- **D-15:** Multiple concurrent sessions as tabs, each scoped to a different project
- **D-16:** Tabs show project name and active status (thinking, waiting for input, idle)
- **D-17:** Switching tabs preserves full conversation state

### Repo Scaffolding
- **D-18:** Template system — templates per stack type (React, Python, Swift, Go)
- **D-19:** Templates populated with project context from ideation output (name, description, constraints, stack choices)
- **D-20:** Creates repo with CLAUDE.md + .planning/ structure ready for GSD workflow

### Autonomous GSD Pipeline
- **D-21:** One-click: roadmap → discuss all phases → autonomous execution
- **D-22:** Real-time pipeline visualization showing phase progress, agent spawns, and commits (reuse v1.0 pipeline viz patterns)
- **D-23:** Autonomous execution runs as a background process — user can switch to other sessions while it builds

### Claude's Discretion
- Template contents per stack type
- Notification card visual design and positioning
- Exact skill runner API endpoint design
- How to handle skill runner errors and retries

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Skill System
- `packages/harness/src/skills/` — SkillManifest, SkillRegistry, runSkill runner
- `~/.claude/skills/gstack/` — gstack skill definitions (dynamically discovered)
- `~/.claude/get-shit-done/` — GSD workflow definitions (dynamically discovered)

### Ideation Pipeline
- `~/.gstack/projects/` — Design doc artifacts from ideation sessions (20+ design docs across a dozen projects)
- `~/.claude/skills/gstack/office-hours/SKILL.md` — Office hours skill definition

### Pipeline Visualization
- `packages/web/src/components/pipeline/PipelineHero.tsx` — Existing pipeline viz (adapt for GSD phases)
- `packages/api/src/routes/sse.ts` — SSE streaming for real-time updates

### Design System
- `DESIGN.md` — Visual design system for all UI components

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/harness/src/skills/` — Complete skill runner infrastructure (manifest, registry, runner)
- `packages/web/src/components/pipeline/` — Pipeline visualization components (adapt for GSD)
- `packages/api/src/routes/sse.ts` — SSE streaming endpoint pattern
- `packages/web/src/hooks/useSSE.ts` — Client-side SSE consumption

### Established Patterns
- Skill manifest declares tool requirements, input schema
- SkillRegistry loads skills from filesystem paths
- runSkill executes tool_use loop with adapter translation
- SSE for streaming real-time pipeline progress

### Integration Points
- New routes for skill invocation API, GSD automation API
- New React components for ideation pipeline UI, decision gates, repo scaffolding
- Extend session tabs (from Phase 12) for concurrent project sessions
- Connect to dashboard (Phase 14) for project card → session flow

</code_context>

<specifics>
## Specific Ideas

- The ideation funnel mirrors Ryan's proven workflow: office-hours (47 invocations) → CEO review (35 invocations) → eng review → design consultation. 90 ideation skill invocations in 18 days — this is core, not occasional.
- Autonomous GSD execution should feel like "push a button and watch it build" — the frontloading in ideation + discuss makes this possible
- Ryan's actual pattern: discuss all phases at once, then /gsd:autonomous to execute everything end-to-end with zero human intervention
- Non-blocking decision gates let the pipeline keep moving on most decisions while surfacing the ones that genuinely need human judgment

</specifics>

<deferred>
## Deferred Ideas

- Skill marketplace / versioning / hot-reload — deferred from v1.1
- Team-level project aggregation — future milestone
- Mobile monitoring view — future milestone

</deferred>

---

*Phase: 15-ideation-funnel-autonomous-gsd*
*Context gathered: 2026-04-08*
