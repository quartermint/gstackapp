# Phase 18: Auto-Discovery Engine (SSH + GitHub Orgs) - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the Phase 17 discovery engine with Mac Mini SSH scanning and GitHub org repo listing. Cross-host deduplication. SSH failure handling. Local discovery already works — this phase adds remote sources.

</domain>

<decisions>
## Implementation Decisions

### SSH discovery
- Batch `find` command over SSH: `find /Users/ryanstern -maxdepth 2 -name .git -type d` + `git remote get-url origin` per repo
- 3-second SSH connect timeout, 10-second command timeout
- SSH failure is non-fatal: dashboard shows "last scanned X ago" badge instead of erroring
- Reuse existing SSH infrastructure from `project-scanner.ts` (same host, same execFile pattern)

### GitHub org discovery
- `gh api orgs/{org}/repos --paginate` for configured orgs (quartermint, vanboompow)
- Surface repos not cloned locally (no matching path or remote URL in config)
- GitHub org repos appear as discoveries with host="github" (distinguish from local/mac-mini)

### Cross-host deduplication
- Use `normalizeRemoteUrl()` (already exists in git-health.ts) to match same repo across hosts
- Same repo found on MacBook + Mac Mini + GitHub = one discovery entry showing all locations
- Dedup runs after all sources complete, before emitting discovery:found events

### Claude's Discretion
- Exact SSH command batching strategy
- GitHub API pagination implementation
- Dedup merge logic for multi-source discoveries
- Error recovery and retry behavior

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SSH patterns
- `packages/api/src/services/project-scanner.ts` — Existing SSH scan implementation, timeout handling, execFile pattern
- `packages/api/src/services/git-health.ts` — `normalizeRemoteUrl()` function, `checkAncestry()` pattern

### GitHub API
- `packages/api/src/services/project-scanner.ts` — Existing `gh api` usage via execFile (fetchIsPublic, scanGithubProject)

### Discovery engine
- `packages/api/src/services/discovery-engine.ts` (Phase 17) — Local discovery implementation to extend

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- SSH batch command pattern from `project-scanner.ts` (already tested with Mac Mini)
- `normalizeRemoteUrl()` strips .git suffix, normalizes protocol — proven for copy matching
- `execFile` with timeout options — standard pattern throughout

### Established Patterns
- SSH commands use `ryans-mac-mini` host from config.macMiniSshHost
- GitHub API via `gh api` execFile (not Octokit) — handles auth natively
- Graceful SSH degradation: existing scanner already handles Mac Mini unreachable

### Integration Points
- Discovery engine service from Phase 17 gains SSH and GitHub source methods
- Same SSE events (discovery:found) for all sources
- Same promote/dismiss flow regardless of discovery source

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follow existing SSH and GitHub API patterns from project-scanner.ts.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-auto-discovery-engine-ssh-github-orgs*
*Context gathered: 2026-03-16*
