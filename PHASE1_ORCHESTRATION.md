# Phase 1 Orchestration Command

Copy and paste this command into a new Claude Code session:

---

```
cd /Users/root1/mission-control

Orchestrate Phase 1 implementation for Mission Control using parallel subagents in a git worktree.

## Setup

1. Create a worktree for Phase 1:
   ```bash
   git worktree add ../mission-control-phase1 -b feature/phase1-integration
   ```

2. Work exclusively in `/Users/root1/mission-control-phase1`

## Phase 1 Scope

Phase 1 replaces the stubs from Phase 0 with real implementations. There are 4 workstreams that can be developed in parallel:

### Workstream A: JWT Authentication (packages/hub, packages/worker)
- Implement real JWT verification in `packages/hub/src/services/trust.ts` (replace stub at line 134-189)
- Use `jose` library for Workers-compatible JWT handling
- Verify signature using JWT_SECRET from environment
- Check token expiration and required claims (sub, iat, exp)
- Add JWT signing utility for generating tokens (for testing/admin)

### Workstream B: Convex Integration (packages/hub, packages/compute)
- Replace in-memory `taskStore` in `packages/hub/src/routes/tasks.ts` with Convex mutations/queries
- Replace in-memory `nodeRegistry` in `packages/hub/src/services/dispatcher.ts` with Convex
- Connect compute node registration to Convex via `convex/convex/nodes.ts`
- Wire up audit logging to `convex/convex/auditLog.ts`
- Add ConvexClient initialization in hub and compute packages

### Workstream C: Hub-Compute Communication (packages/hub, packages/compute)
- Implement real HTTP dispatch in `packages/hub/src/services/dispatcher.ts` `tryDispatchToNode()`
- Add task result callback endpoint in hub for compute nodes to report completion
- Implement proper node health checking with heartbeat verification
- Add node selection algorithm improvements (consider load, capabilities)

### Workstream D: Test Infrastructure (all packages)
- Set up vitest configuration for each package
- Add unit tests for shared utilities (validation, id generation)
- Add unit tests for sanitizer patterns
- Add unit tests for sandbox command validation
- Add integration test setup for hub routes (using fastify.inject)

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
3. `pnpm test` runs (even if some tests are placeholder)
4. REVIEW_PROMPT.md created with:
   - Summary of what was implemented
   - Review checklist for next session
   - Any deferred items for Phase 2
   - Merge recommendation criteria

## Constraints

- Do NOT modify the security model or trust levels
- Do NOT add new dependencies without justification
- Preserve all existing public APIs
- Keep commits atomic and well-described
- Each workstream should be independently mergeable

## Begin

Start by creating the worktree, then spawn the 4 subagents in parallel to maximize efficiency.
```

---

## Notes for the Orchestrating Session

- The subagents have access to all tools and can read/write files
- Use `subagent_type: "general-purpose"` for coding tasks
- Monitor progress by checking git log in the worktree
- If a workstream blocks another, handle sequentially
- The final verification should be done by the orchestrator, not a subagent
