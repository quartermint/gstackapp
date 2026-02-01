# Phase 3 Review Prompt

Copy and paste this prompt into a new Claude Code session to review the Phase 3 implementation:

---

```
cd /Users/root1/mission-control-phase3

Review the Phase 3 implementation for Mission Control. This branch (`feature/phase3-integration`) contains 4 workstreams implemented in parallel.

## Summary of Implementation

Phase 3 completed the integration layer with 22 commits across 4 workstreams:

### Workstream A: Claude CLI Integration
- **`packages/hub/src/services/claude-client.ts`** (NEW)
  - `executeClaudeCli()` - Spawn Claude CLI and capture response
  - `streamClaudeCli()` - Streaming responses for long-running requests
  - `executeClaudeCliWithFallback()` - Graceful fallback when CLI unavailable
  - Timeout handling with configurable limits
  - Conversation session management via `--conversation` flag
  - Token usage extraction from CLI output
- **`packages/hub/tests/claude-client.test.ts`** (NEW): 15 tests
- **`packages/hub/src/routes/chat.ts`** (MODIFIED): Wired CLI client with fallback
- **`packages/hub/src/services/circuit-breaker.ts`** (MODIFIED): Structured logging
- **`packages/shared/src/constants.ts`** (MODIFIED): Added GATEWAY_TIMEOUT (504)

### Workstream B: Workflow Orchestration
- **`packages/hub/src/services/workflow.ts`** (NEW)
  - `WorkflowDefinition` and `WorkflowStep` types with Zod schemas
  - Step types: task, condition, parallel, wait
  - Dependency validation and cycle detection
- **`packages/hub/src/services/workflow-executor.ts`** (NEW)
  - `WorkflowExecutor` class with DAG-based execution
  - `validateWorkflow()` - Validate step definitions and dependencies
  - `executeWorkflow()` - Run workflow with parallel step execution
  - Topological sorting for dependency ordering
  - Step failure handling with configurable retry
- **`packages/hub/src/services/workflow-templates.ts`** (NEW)
  - `buildTestDeploy` - Standard CI/CD pipeline
  - `codeReview` - PR review workflow
  - `release` - Version bump and publish
  - `parallelTest` - Parallel test suites
  - `monorepo` - Multi-package build
- **`packages/hub/tests/workflow.test.ts`** (NEW): 42 tests
- **`packages/hub/src/services/apikey.ts`** (MODIFIED): Convex persistence
- **`convex/convex/apiKeys.ts`** (NEW): CRUD for API keys
- **`convex/convex/tasks.ts`** (MODIFIED): Dependency and workflow fields
- **`convex/convex/schema.ts`** (MODIFIED): apiKeys table, workflow fields

### Workstream C: Admin Dashboard API
- **`packages/hub/src/routes/admin.ts`** (NEW): 15 endpoints
  - `GET /admin/overview` - System summary
  - `GET /admin/nodes` - All nodes with circuit breaker state
  - `POST /admin/nodes/:id/drain` - Drain node gracefully
  - `POST /admin/nodes/:id/enable` - Re-enable drained node
  - `POST /admin/nodes/:id/force-offline` - Force node offline
  - `DELETE /admin/nodes/:id` - Remove node from registry
  - `GET /admin/tasks` - Tasks with filtering
  - `POST /admin/tasks/:id/cancel` - Cancel running task
  - `POST /admin/tasks/:id/retry` - Retry failed task
  - `POST /admin/tasks/:id/priority` - Boost task priority
  - `GET /admin/audit-logs` - Search audit logs
  - `GET /admin/audit-logs/export` - Export logs as JSON
  - `GET /admin/config` - System configuration
  - `POST /admin/config` - Update configuration
  - `GET /admin/health/detailed` - Detailed health check
- **`packages/hub/tests/admin.test.ts`** (NEW): 24 tests
- **`packages/hub/src/services/dispatcher.ts`** (MODIFIED): Node operations
- **`packages/hub/src/server.ts`** (MODIFIED): Register admin routes
- **`convex/convex/auditLog.ts`** (MODIFIED): Search and export queries

### Workstream D: Deployment & CI
- **`.github/workflows/ci.yml`** (NEW)
  - Jobs: lint, typecheck, test, build
  - Runs on push to main and PRs
  - Caches pnpm store for faster builds
- **`infra/deploy-hub.sh`** (NEW)
  - SSH-based deployment to Hetzner
  - Rollback support on failure
  - Health check after deploy
- **`infra/deploy-worker.sh`** (NEW)
  - Cloudflare Worker deployment via wrangler
  - Environment variable management
- **`infra/health-check.sh`** (NEW)
  - Checks hub, worker, Convex, Tailscale
  - Exit codes for monitoring integration
- **`infra/setup-node.sh`** (NEW)
  - macOS compute node setup
  - launchd service configuration
  - Tailscale and pnpm installation
- **`.env.example`** (NEW): Environment variable template
- **`infra/secrets.template.md`** (NEW): Secrets management guide

## Review Checklist

### Security Review
- [ ] Admin routes enforce `internal` trust level only (admin.ts:34-43)
- [ ] Claude CLI client validates/sanitizes prompt input (claude-client.ts:78-87)
- [ ] API key hashing uses SHA-256 (apikey.ts)
- [ ] No shell injection vectors in CLI spawning
- [ ] Workflow executor validates step definitions before execution
- [ ] Deployment scripts don't expose secrets in logs

### API Compatibility
- [ ] All existing public APIs preserved
- [ ] Chat route falls back gracefully when CLI unavailable
- [ ] Error responses follow existing conventions
- [ ] Admin API uses consistent response format

### Claude CLI Integration
- [ ] Handles missing CLI binary gracefully
- [ ] Timeout errors return 504 Gateway Timeout
- [ ] Execution errors return 500 with masked details
- [ ] Streaming mode properly handles partial responses
- [ ] Conversation ID persists across turns

### Workflow Orchestration
- [ ] DAG validation rejects cycles
- [ ] Missing dependencies detected at validation
- [ ] Parallel steps execute concurrently
- [ ] Step failures don't block unrelated steps
- [ ] Workflow status accurately reflects execution state

### Admin Dashboard API
- [ ] All endpoints require internal trust (Tailscale peer)
- [ ] Node drain operation is graceful (finishes in-flight tasks)
- [ ] Task cancellation sends proper signals
- [ ] Audit log queries support filtering and pagination
- [ ] Configuration changes validated before applying

### Deployment & CI
- [ ] CI workflow runs on correct triggers
- [ ] Deployment scripts are idempotent
- [ ] Rollback restores previous version correctly
- [ ] Health checks detect real failures
- [ ] Setup script handles existing installations

### Code Quality
- [ ] No `any` types (TypeScript strict mode)
- [ ] Conventional commit messages used
- [ ] Structured logging (no console.log)
- [ ] Error handling includes typed errors
- [ ] JSDoc comments on public functions

## Test Results

| Package | Tests | Status |
|---------|-------|--------|
| shared | 81 | PASS |
| compute | 42 | PASS |
| hub | 257 | PASS |
| **Total** | **380** | **PASS** |

## Verification Commands

```bash
# Verify build passes
pnpm install && pnpm typecheck && pnpm build

# Run all tests
pnpm test

# Check test coverage
pnpm test:coverage

# View commit history
git log --oneline feature/phase3-integration --not main

# Compare with main branch
git diff main...HEAD --stat
```

## Deferred Items for Phase 4

1. **Mobile Apps (iOS/Android)** - Primary Phase 4 deliverable
2. **WebSocket streaming** - Currently HTTP polling for workflow status
3. **Metrics dashboard UI** - Admin API returns data, no visualization
4. **Multi-region deployment** - Scripts support single region
5. **Rate limiting per API key** - Currently global only
6. **Workflow visualization** - DAG rendering for admin UI
7. **Automated backup** - Convex backup scheduling

## Merge Recommendation Criteria

**Ready to merge if:**
1. All checklist items verified
2. `pnpm install && pnpm typecheck && pnpm build` succeeds
3. `pnpm test` passes with 380 tests
4. No security regressions identified
5. Code review completed

**Do NOT merge if:**
- Any security checklist item fails
- Tests are failing
- TypeScript errors present
- Admin routes accessible without internal trust

## Merge Commands

```bash
cd /Users/root1/mission-control
git fetch origin
git checkout main
git merge --no-ff feature/phase3-integration -m "feat: Phase 3 integration layer

- Claude CLI integration with streaming support
- DAG-based workflow orchestration
- Admin dashboard API (15 endpoints)
- CI/CD pipeline and deployment scripts
- 380 tests passing"
git push origin main
```

## Post-Merge Cleanup

```bash
# Remove the worktree
git worktree remove ../mission-control-phase3

# Delete the feature branch
git branch -d feature/phase3-integration
```

## Commits in This Branch (22)

```
46c1068 feat(shared): add GATEWAY_TIMEOUT to HTTP_STATUS constants
9d10f2e refactor(hub): replace console calls with structured logger in circuit-breaker
347d519 feat(hub): wire Claude CLI client into chat route
137f06a feat(hub): implement Claude CLI client with streaming support
5e8a939 feat(hub): register admin routes in server
411a9d8 test(hub): add workflow execution tests
8ee4cd9 feat(hub): add Convex API types for admin dashboard
b45bf49 feat(hub): add Convex persistence to API key service
dc19b84 feat(convex): add API key persistence
de41642 feat(convex): add audit log search and export queries
becd63a feat(convex): add task dependencies and workflow support
b0b35da feat(hub): add node drain/enable/force-offline operations
5dc34d1 feat(hub): add workflow templates for common patterns
36075b6 feat(hub): add admin routes with internal trust enforcement
623a367 feat(hub): implement DAG-based workflow executor
d9144c9 feat(hub): add workflow definition and step types
d514f75 docs: add environment and secrets templates
3b02675 infra: add compute node setup script
9724e0d infra: add health check script for monitoring
a3730ec infra(worker): add Cloudflare deployment script
ecd32e4 infra(hub): add deployment script with rollback support
8fb6ad7 ci: add GitHub Actions workflow for CI
```

## Next Steps After Merge

1. Deploy CI workflow (push to main triggers it)
2. Run `infra/health-check.sh` against staging
3. Test Claude CLI integration with real CLI binary
4. Verify admin routes work from Tailscale peer
5. Begin Phase 4 planning (mobile apps)
```
