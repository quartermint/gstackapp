# Phase 7: Git Health Engine - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the project scanner to run 7 remote-aware health checks per project, compute health scores (0-100) and risk levels, auto-discover multi-host copies by normalized remote URL, detect divergence between copies, and handle stale SSH data gracefully. No API routes, no dashboard changes — pure scanner + health engine.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User deferred all implementation decisions. Resolve using the design spec and research findings:

- **Severity thresholds:** Follow spec defaults (unpushed warning: 1-5, critical: 6+). Research recommends starting higher but spec is fine for v1.1 — can tune later with real data.
- **SSH scan behavior:** Extend existing `scanRemoteProject()` SSH batch with health commands. If Mac Mini unreachable, mark copies as stale via `lastCheckedAt`, demote divergence findings to warning.
- **Health score formula:** Derive from worst active finding severity per spec. Exact 0-100 mapping is Claude's choice.
- **`@{u}` edge case handling:** Research identified detached HEAD, new branches, orphan branches as failure modes. Run checks in dependency order: detect detached HEAD first, then check upstream config, then resolve `@{u}` only when safe.
- **Process concurrency:** Research recommends `p-limit(10-15)` for cross-repo concurrency + serialized commands within each repo. Follow this guidance.
- **Remote URL normalization:** Strip `.git` suffix, normalize `git@github.com:` to `github.com/`, lowercase. Follow spec.
- **`isPublic` cache:** Use `gh api repos/{owner}/{repo} --jq .private` on first scan, cache in `project_copies.isPublic`. Follow spec.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — follow the design spec (docs/superpowers/specs/2026-03-14-git-health-intelligence-design.md) which has detailed check types, severity logic, and scanner integration approach.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/api/src/services/project-scanner.ts`: Full scanner with `scanProject()` (local), `scanRemoteProject()` (SSH batch), `scanGithubProject()`, `scanAllProjects()` orchestrator, and `startBackgroundPoll()`.
- `packages/api/src/db/queries/health.ts`: `upsertHealthFinding()` (transaction-based), `resolveFindings()`, `getActiveFindings()`, `getProjectRiskLevel()` — all from Phase 6.
- `packages/api/src/db/queries/copies.ts`: `upsertCopy()`, `getCopiesByProject()`, `getCopiesByRemoteUrl()` — from Phase 6.
- `packages/api/src/services/event-bus.ts`: `eventBus.emit("mc:event", { type, id })` — add new `health:changed` and `copy:diverged` event types.
- `packages/shared/src/schemas/health.ts`: All Zod schemas and types for health findings, copies, risk levels.

### Established Patterns
- **Scanner pattern**: `Promise.allSettled()` for parallel repo scanning, `.catch(() => fallback)` per command, SSH commands batched in single `ssh` call via shell script.
- **SSH batch**: Single SSH connection running a `&&`-chained script with `===SECTION===` delimiters for parsing. Currently 4 commands, needs extension to ~9.
- **Scan cache**: `TTLCache<GitScanResult>` keyed by slug, 10-min TTL. Health data may need its own cache or extend this.
- **GitScanResult interface**: Branch, dirty, dirtyFiles, commits, gsdState. Needs extension with health fields (remotes, upstream, headCommit, etc.).
- **Config routing**: `scanAllProjects()` routes by `project.host` (local/mac-mini/github). Multi-copy entries need special handling.

### Integration Points
- `scanAllProjects()`: After existing scan loop, add post-scan health check phase. Health checks run on the `GitScanResult` data already collected.
- `GitScanResult`: Extend interface with new fields needed by health checks (remote URL, upstream ref, HEAD hash, status branch line).
- `eventBus`: Add `health:changed` and `copy:diverged` to `MCEventType` union in `event-bus.ts`.
- Multi-copy config entries: Currently skipped with the discriminant guard added in Phase 6. Need to un-skip and scan both copies.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-git-health-engine*
*Context gathered: 2026-03-14*
