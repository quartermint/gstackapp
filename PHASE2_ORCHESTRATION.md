# Phase 2 Orchestration Command

Copy and paste this command into a new Claude Code session:

---

```
cd /Users/root1/mission-control

Orchestrate Phase 2 implementation for Mission Control using parallel subagents in a git worktree.

## Setup

1. Create a worktree for Phase 2:
   ```bash
   git worktree add ../mission-control-phase2 -b feature/phase2-production-ready
   ```

2. Work exclusively in `/Users/root1/mission-control-phase2`

## Phase 2 Scope

Phase 2 focuses on production-readiness: reliability, observability, and security hardening. There are 4 workstreams that can be developed in parallel:

### Workstream A: Reliability and Resilience (packages/hub)
- Implement retry logic with exponential backoff in dispatcher.ts
- Add circuit breaker pattern for per-node failure isolation
- Create dead letter queue in Convex for permanently failed tasks
- Add task timeout recovery in Convex cron job
- Deliverables: `circuit-breaker.ts`, updated `dispatcher.ts`, `convex/crons.ts`

### Workstream B: Node Capability Matching (packages/hub, packages/shared)
- Extend NodeCapabilitiesSchema with task-type tags (e.g., "gpu", "high-memory")
- Implement capability-based routing in dispatcher
- Create node scoring algorithm (load + capability match + affinity)
- Deliverables: updated `node.ts` schema, `node-scorer.ts`, updated `dispatcher.ts`

### Workstream C: Observability and Metrics (all packages)
- Add Prometheus metrics endpoint `/metrics` on Hub
- Create structured JSON logger with correlation IDs
- Enhance health checks with deep Convex connectivity checks
- Add audit log query functions for forensics
- Deliverables: `metrics.ts` route, `logger.ts` utility, updated `health.ts`

### Workstream D: Security Hardening (packages/worker, packages/hub)
- Implement JWT refresh/rotation with short-lived tokens (15 min)
- Add per-user rate limiting (not just IP-based)
- Add API key support for service-to-service calls
- Share JWT verification logic between worker and hub
- Deliverables: updated `auth.ts`, `ratelimit.ts`, `apikey.ts`

## Orchestration Strategy

Use the Task tool to spawn parallel subagents:

1. **Spawn 4 subagents in parallel** (one per workstream) using a single message with multiple Task tool calls
2. Each subagent should:
   - Work on its assigned workstream
   - Make atomic commits with conventional commit messages
   - Ensure `pnpm typecheck` passes after each change
3. After all subagents complete, verify the combined build passes
4. Create a REVIEW_PROMPT.md with evaluation checklist

## Deliverables

1. All 4 workstreams implemented and committed
2. `pnpm install && pnpm typecheck && pnpm build` passes
3. `pnpm test` passes with new tests added
4. REVIEW_PROMPT.md created with:
   - Summary of what was implemented
   - Review checklist for next session
   - Any deferred items for Phase 3
   - Merge recommendation criteria

## Constraints

- Do NOT modify the security model or trust levels
- Do NOT add new dependencies without justification
- Preserve all existing public APIs
- Keep commits atomic and well-described
- Each workstream should be independently mergeable
- Coordinate dispatcher.ts changes between Workstreams A and B

## Begin

Start by creating the worktree, then spawn the 4 subagents in parallel to maximize efficiency.
```

---

## Notes for the Orchestrating Session

- The subagents have access to all tools and can read/write files
- Use `subagent_type: "general-purpose"` for coding tasks
- Monitor progress by checking git log in the worktree
- Workstreams A & B both modify dispatcher.ts - coordinate to avoid conflicts
- Workstream C logger should be adopted by all workstreams as they complete
- The final verification should be done by the orchestrator, not a subagent
