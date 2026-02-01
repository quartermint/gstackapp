# Phase 1 Review Prompt

Copy and paste this prompt into a new Claude Code session to review the Phase 1 implementation:

---

```
cd /Users/root1/mission-control-phase1

Review the Phase 1 implementation for Mission Control. This branch (`feature/phase1-integration`) contains 4 workstreams implemented in parallel.

## Summary of Implementation

### Workstream A: JWT Authentication
- **File**: `packages/hub/src/services/trust.ts`
- **Changes**:
  - Replaced stub JWT verification with real `jose` library implementation
  - Added `verifyJwt()` - async function that verifies JWT signature using JWT_SECRET
  - Added `signJwt()` - utility for generating signed JWTs (testing/admin)
  - Added `classifyTrustAsync()` - async trust classification with full verification
  - Validates required claims: `sub`, `iat`, `exp`
  - Supports HS256, HS384, HS512 algorithms

### Workstream B: Convex Integration
- **Files**:
  - `packages/hub/src/services/convex.ts` (new)
  - `packages/hub/src/services/audit.ts` (new)
  - `packages/hub/src/routes/tasks.ts`
  - `packages/hub/src/services/dispatcher.ts`
- **Changes**:
  - Added ConvexHttpClient initialization with singleton pattern
  - Replaced in-memory taskStore with Convex mutations/queries
  - Replaced in-memory nodeRegistry with Convex persistence
  - Wired up audit logging to Convex with requestId tracing
  - Graceful degradation when Convex is not configured

### Workstream C: Hub-Compute Communication
- **Files**:
  - `packages/hub/src/services/dispatcher.ts`
  - `packages/hub/src/routes/nodes.ts` (new)
  - `packages/hub/src/server.ts`
- **Changes**:
  - Implemented real HTTP POST dispatch to compute nodes
  - Added task result callback endpoint (`POST /api/nodes/tasks/callback`)
  - Implemented node health checking with heartbeat verification
  - Added least-loaded node selection algorithm with round-robin tiebreaker
  - Added node management endpoints (GET /api/nodes, /api/nodes/healthy, /api/nodes/stats)

### Workstream D: Test Infrastructure
- **Files**:
  - `packages/shared/vitest.config.ts` (new)
  - `packages/hub/vitest.config.ts` (new)
  - `packages/compute/vitest.config.ts` (new)
  - `packages/shared/src/utils/validation.test.ts` (new)
  - `packages/shared/src/utils/id.test.ts` (new)
  - `packages/shared/src/schemas/chat.test.ts` (new)
  - `packages/hub/src/services/sanitizer.test.ts` (new)
  - `packages/hub/tests/helpers.ts` (new)
  - `packages/hub/tests/health.test.ts` (new)
  - `packages/compute/src/sandbox.test.ts` (new)
- **Test Coverage**: 173 tests total (58 shared, 73 hub, 42 compute)

## Review Checklist

### Security Review
- [ ] JWT verification rejects expired tokens
- [ ] JWT verification rejects invalid signatures
- [ ] JWT verification requires all mandatory claims
- [ ] No secrets logged or exposed in error messages
- [ ] Audit logging captures all security-relevant events
- [ ] Node authentication uses proper Authorization headers

### API Compatibility
- [ ] All existing public APIs preserved
- [ ] No breaking changes to request/response schemas
- [ ] HTTP status codes follow conventions
- [ ] Error responses include proper error codes

### Convex Integration
- [ ] ConvexHttpClient properly initialized
- [ ] Graceful degradation when CONVEX_URL not set
- [ ] Task state transitions are atomic
- [ ] Node registration persists across restarts
- [ ] Audit log entries include requestId

### Hub-Compute Communication
- [ ] HTTP dispatch includes proper timeout handling
- [ ] Failed nodes marked as offline
- [ ] Busy nodes (503) handled correctly
- [ ] Callback endpoint validates task results
- [ ] Health check detects stale heartbeats

### Test Quality
- [ ] Tests cover happy path and error cases
- [ ] Sanitizer tests include bypass attempts
- [ ] Sandbox tests validate dangerous commands rejected
- [ ] Integration tests use fastify.inject (no real server)

### Code Quality
- [ ] No `any` types (TypeScript strict mode)
- [ ] Conventional commit messages used
- [ ] No console.log debugging left behind
- [ ] Error handling is consistent

## Deferred Items for Phase 2

1. **End-to-end integration tests** - Full request flow from worker to compute
2. **JWT refresh/rotation** - Token refresh mechanism
3. **Node capability matching** - Route tasks to nodes with specific capabilities
4. **Retry logic** - Automatic retry on transient failures
5. **Metrics/observability** - Add prometheus metrics endpoints
6. **Rate limiting per user** - User-specific rate limits in hub

## Verification Commands

```bash
# Verify build passes
pnpm install && pnpm typecheck && pnpm build

# Run all tests
pnpm test

# Check test coverage
pnpm test:coverage

# View commit history
git log --oneline -20

# Compare with main branch
git diff main...HEAD --stat
```

## Merge Recommendation Criteria

**Ready to merge if:**
1. All checklist items pass
2. `pnpm install && pnpm typecheck && pnpm build` succeeds
3. `pnpm test` passes with 173 tests
4. No security regressions identified
5. Code review completed by at least one reviewer

**Do NOT merge if:**
- Any security checklist item fails
- Tests are failing
- TypeScript errors present
- Breaking API changes detected

## Next Steps After Merge

1. Deploy to staging environment
2. Run manual integration tests with real Convex instance
3. Verify JWT flow with actual tokens
4. Test hub-compute communication over Tailscale
5. Begin Phase 2 planning
```

---

## Commits in This Branch

```
a15d154 chore: update lockfile for vitest dependency
8733551 test(compute): add unit tests for sandbox command validation
1dfa824 test(hub): add unit tests for sanitizer and integration tests for routes
172f8a5 test(shared): add unit tests for validation and ID utilities
d5e18e2 feat(hub): integrate Convex for task storage and audit logging
e8c34ef fix(hub): fix type errors in dispatcher Convex integration
ea1b50d feat(hub): implement HTTP dispatch to compute nodes
87ceae8 feat(hub): implement JWT verification with jose library
```
