# Domain Pitfalls: v1.1 Git Health Intelligence + MCP

**Domain:** Adding git health monitoring, multi-host scanning, MCP server, and data visualization to an existing Node.js + SQLite + React app
**Researched:** 2026-03-14
**Milestone context:** Subsequent milestone on Mission Control v1.0 (12K LOC, 135 tests, production on Mac Mini)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or production outages.

---

### Pitfall 1: Git Command Spawning Floods the Process Table

**What goes wrong:** The health engine adds ~5 new git commands per repo (rev-list, remote -v, rev-parse, status -sb, merge-base). With 35 repos scanned in parallel via `Promise.allSettled`, that is 175 child processes spawned nearly simultaneously on top of the existing 105 (3 per repo x 35). Total: ~280 concurrent `execFile` calls per scan cycle.

**Why it happens:** The existing scanner already runs 3 git commands per repo in parallel (`scanProject` does `rev-parse`, `status --porcelain`, `git log` concurrently). Adding 5 more per repo nearly triples the child process count. Node.js `execFile` spawns real OS processes, each needing file descriptor pairs for stdin/stdout/stderr pipes. Git commands hitting the same `.git/index.lock` files on the same repo can contend with each other.

**Consequences:** Scan cycle wall-clock time balloons from ~2s to 10s+. Intermittent `EMFILE` (too many open files) or `EAGAIN` errors. Git lock contention causes random `execFile` failures that look like flaky behavior. On the Mac Mini (which also runs Go services, Docker containers, and training jobs), this is especially dangerous -- other services can be starved of file descriptors.

**Prevention:**
1. Run health checks **sequentially after** the existing scan for each repo, not in parallel with it. The existing scanner parallelizes across repos -- that is the right axis. Within a single repo, serialize: scan first, then health checks.
2. Use a concurrency limiter (e.g., `p-limit` set to 10-15) for cross-repo parallelism instead of unbounded `Promise.allSettled`. The current codebase uses `Promise.allSettled` without a limiter -- fine for 35 x 3, not for 35 x 8.
3. Batch health check git commands per repo into a single shell invocation. The SSH scanner (`scanRemoteProject`) already does this -- chains commands with `&&` and parses sections. Apply the same pattern to local repos: one `execFile("sh", ["-c", script])` instead of five `execFile("git", ...)`.

**Detection:** Monitor scan cycle duration. If it exceeds 10 seconds, you have a spawning problem. Log child process error codes -- `EMFILE` or `EAGAIN` are the signals. Add timing to `scanAllProjects`: `console.log('Scan cycle: ${elapsed}ms')`.

**Phase:** Git Health Engine (Phase 1). Address at scanner integration time.

---

### Pitfall 2: `@{u}` Upstream Ref Fails Silently on Multiple Repo States

**What goes wrong:** The spec uses `git rev-list @{u}..HEAD --count` for unpushed commit detection and `git rev-parse --abbrev-ref @{u}` for tracking check. The `@{u}` shorthand fails with a non-zero exit code in several common states that are NOT the "broken tracking" case:
- **Detached HEAD** -- common during rebase, bisect, or checking out a tag/commit
- **New branch never pushed** -- has no upstream yet, which is normal workflow
- **Orphan branch** -- no commits at all (rare but possible with `git checkout --orphan`)
- **Branch tracking a deleted remote branch** -- `@{u}` resolves but the ref is gone

**Why it happens:** `@{u}` is sugar for "the upstream of the current branch." When there is no current branch (detached HEAD) or no upstream configured (new branch), git returns exit code 128. The spec correctly identifies "broken tracking" as a check, but the implementation must distinguish between "broken tracking on a branch that SHOULD have an upstream" and "legitimately has no upstream yet."

**Consequences:** False critical alerts. A new branch you just created locally shows "CRITICAL: broken tracking" in the risk feed. Detached HEAD during a rebase triggers "CRITICAL: broken tracking." These false positives cause the user to ignore the risk feed within days.

**Prevention:**
1. Run checks in dependency order: `git remote -v` first (no_remote), then branch detection (`git symbolic-ref --short HEAD` -- returns non-zero on detached HEAD), then `git rev-parse --abbrev-ref @{u}` (broken_tracking), and only then `@{u}`-dependent checks (unpushed, unpulled). If earlier checks fail, skip dependent checks and produce the appropriate finding instead.
2. If detached HEAD, skip ALL upstream checks. Report as `info` severity: "detached HEAD (rebase/bisect in progress?)".
3. Distinguish "no upstream configured" from "upstream configured but broken": check `git config branch.<name>.remote`. If no config, it is "no upstream" (Warning for established repos). If config exists but ref resolution fails, THAT is "broken tracking" (Critical).
4. Every `execFile` call must have explicit error handling that produces a finding, not swallows the error. A failed git command IS a health finding.
5. Unit test every check with: success, exit code 128, empty output, detached HEAD, shallow clone, and empty repo.

**Detection:** Test health engine against repos in detached HEAD state, repos with new unpushed branches, and repos mid-rebase. If your test suite only covers happy-path branches with upstreams, you WILL miss this.

**Phase:** Git Health Engine (Phase 1). Must be addressed in the check implementation itself.

---

### Pitfall 3: SSH Scanning Returns Stale Data That Corrupts Divergence Detection

**What goes wrong:** The existing `scanRemoteProject` catches SSH failures and returns `null`. But SSH can also succeed while returning stale/incorrect data: Mac Mini mid-reboot (SSH succeeds, git commands return partial results), repo path moved, or git commands fail due to lock contention from other processes.

For v1.1, divergence detection compares HEAD commits between local and Mac Mini copies. If the Mac Mini scan returns stale `headCommit` data (from a previous successful scan), divergence detection produces false positives ("diverged" when actually synced) or false negatives (missed real divergence because stale data shows matching HEADs).

**Why it happens:** The existing scanner treats SSH as fire-and-forget: try it, cache whatever comes back, move on. This was fine for v1.0 where SSH data was display-only. In v1.1, SSH data feeds health scoring decisions that produce user-facing alerts.

**Consequences:** "CRITICAL: diverged copies" when both copies are actually identical. User investigates, finds nothing wrong, loses trust in the system. Or worse: real divergence goes undetected.

**Prevention:**
1. Track `lastCheckedAt` per copy in `project_copies` (the spec already calls for this). Display staleness in the UI next to any divergence finding.
2. When SSH scan fails, do NOT fall back to cached data for health decisions. Mark the copy as `status: unreachable` and downgrade divergence findings to `info` with "(Mac Mini unreachable -- cannot verify)".
3. Staleness threshold: if `lastCheckedAt` > 2 scan cycles old (10+ minutes), demote divergence from `critical` to `warning` with staleness note.
4. The SSH batch script must use `; echo "===SEPARATOR===" ;` instead of `&&` between health commands, so individual command failures do not abort the entire batch. The existing scan commands can keep `&&` (they rarely fail on valid repos), but health commands like `@{u}` resolution fail frequently.

**Detection:** Integration test: simulate SSH failure mid-scan. Verify divergence findings include staleness warnings and are NOT reported as `critical`. Monitor `lastCheckedAt` gaps in production.

**Phase:** Multi-Host Copy Discovery (Phase 2). Address at copy reconciliation time.

---

### Pitfall 4: `detectedAt` Overwritten on Upsert, Breaking Dirty Age Tracking

**What goes wrong:** The dirty working tree check relies on `detectedAt` being preserved across scan cycles to compute age ("dirty for 3 days" vs "dirty for 5 minutes"). A naive upsert (SQLite `INSERT OR REPLACE`) deletes the existing row and inserts a new one, resetting `detectedAt` to the current timestamp every cycle. The dirty age resets to zero every 5 minutes, making the 3-day and 7-day severity escalation impossible.

**Why it happens:** SQLite's `INSERT OR REPLACE` is implemented as DELETE + INSERT, not as an in-place update. It destroys the original row (including `detectedAt`) and creates a new one. The same problem occurs with Drizzle's `.onConflictDoUpdate()` if `detectedAt` is included in the `set` clause.

**Consequences:** Dirty working tree severity never escalates past "info" because the age is always < 5 minutes. The 3-day and 7-day thresholds become dead code. The age-based escalation -- a key feature of the spec -- silently does not work.

**Prevention:**
1. Use Drizzle's `onConflictDoUpdate` on a composite unique index `(projectSlug, checkType)` where `resolvedAt IS NULL`. The `set` clause must explicitly exclude `detectedAt`:
   ```typescript
   .onConflictDoUpdate({
     target: [projectHealth.projectSlug, projectHealth.checkType],
     set: { severity: sql`excluded.severity`, detail: sql`excluded.detail`, metadata: sql`excluded.metadata` },
     where: isNull(projectHealth.resolvedAt),
   })
   ```
2. Alternatively, use explicit SELECT-then-UPDATE/INSERT logic: check if active finding exists, UPDATE if yes (excluding `detectedAt`), INSERT if no.
3. Wrap the entire health check write phase in a transaction for atomicity.
4. Write a specific test: insert a dirty finding with `detectedAt` = 4 days ago, run another upsert cycle, assert `detectedAt` is still 4 days ago.

**Detection:** Health findings for dirty repos always show "detected just now" in the risk feed, even for repos dirty for days. The 3-day and 7-day thresholds never trigger.

**Phase:** Git Health Engine (Phase 1). Address at database write layer.

---

### Pitfall 5: MCP Server stdout Pollution Breaks the stdio Protocol

**What goes wrong:** The MCP stdio transport uses stdout exclusively for JSON-RPC messages. Any `console.log()`, library debug output, or Node.js runtime warnings written to stdout corrupt the protocol stream. Claude Code receives malformed JSON, fails to parse, and disconnects the MCP server silently.

**Why it happens:** The MCP server package calls the MC API via HTTP. During development, `console.log()` is natural. Libraries used by fetch might log to stdout. Even Node.js writes deprecation warnings to stdout in some cases. The existing portfolio-dashboard (Python) handles this correctly: `logging.basicConfig(stream=sys.stderr)`. The TypeScript replacement needs the same discipline.

**Consequences:** MCP server connects, works for a few calls, then silently disconnects. Claude Code retries, hits the same log statement, disconnects again. The user sees "MCP server unavailable" with no explanation. This is insidious because it works during development (HTTP transport / mcp-inspector) and fails in production (stdio transport).

**Prevention:**
1. Override console methods in the MCP entry point BEFORE any imports:
   ```typescript
   console.log = (...args: unknown[]) => console.error(...args);
   console.warn = (...args: unknown[]) => console.error(...args);
   console.info = (...args: unknown[]) => console.error(...args);
   ```
2. Set `NODE_NO_WARNINGS=1` in the MCP server startup command.
3. Lint rule: ban `console.log` in the MCP package.
4. Integration test: run the MCP server as a child process, capture stdout, validate every line is valid JSON-RPC. Any non-JSON-RPC output = test failure.
5. Test through actual stdio transport, not just mcp-inspector.

**Detection:** Integration test validating stdout contains only JSON-RPC. Any stray output = immediate failure.

**Phase:** MCP Server (Phase 4). Address at package creation, not after.

---

## Moderate Pitfalls

Mistakes that cause rework, poor UX, or performance degradation.

---

### Pitfall 6: Alert Fatigue From Over-Sensitive Severity Thresholds

**What goes wrong:** The spec defines Warning at 1-5 unpushed commits, Critical at 6+. In the user's actual workflow (serial sprints, batch pushing), having 1-5 unpushed commits during active development is completely normal. The risk feed shows 10+ amber warning cards every morning, all for expected behavior. Within a week, the user stops reading the risk feed entirely.

**Why it happens:** Severity thresholds designed on paper are calibrated for "worst case." The 2025 SANS Detection & Response Survey found that organizations where 40%+ of alerts are false positives experience severe alert fatigue -- analysts dismiss real threats assuming "it's probably nothing." The same dynamic applies to personal tools, but faster (no organizational pressure to keep looking).

**Consequences:** The risk feed becomes noise. When a real critical issue appears (54 unpushed on public repo, diverged copies), it is buried in amber cards the user has stopped reading.

**Prevention:**
1. Start with higher thresholds: Warning at 10+ unpushed (not 1), Critical at 25+ (not 6). Exception: public repos where the spec's "escalate one tier" is correct.
2. Suppress warnings for the currently-focused project (most commits in last 7 days). Active development = expected unpushed commits.
3. Risk feed shows collapsed COUNT badge for warnings. "3 warnings" as a pill is less fatiguing than 3 full cards. Expand only for critical findings.
4. Use `detectedAt` for time-based escalation: new findings start as `info` for 24 hours before escalating. Catches transient states.
5. Track active findings count after deployment. If consistently > 5 at baseline, thresholds are too sensitive.

**Phase:** Git Health Engine (Phase 1) and Dashboard Risk Feed (Phase 3). Tune severity with actual workflow data.

---

### Pitfall 7: Sprint Timeline Rendering Performance with Many Projects

**What goes wrong:** The sprint timeline renders horizontal swimlane bars for every project with activity in 12 weeks. With 35 projects, this creates 35 rows of interactive DOM elements with hover listeners and tooltip positioning. The existing heatmap creates ~2,940 DOM nodes and works fine, but swimlane segments with hover states are more expensive per element.

**Why it happens:** Each segment needs mouse event handlers for hover tooltips and click-to-navigate. Short sprints (1-2 day bursts) produce hundreds of small segments. React re-renders all of them on SSE-triggered refetches.

**Prevention:**
1. Filter: only show projects with 5+ commits in the window. Most projects will have 0-2 commits in 12 weeks.
2. Merge segments shorter than 2 days into neighbors. Individual commit dots are noise at timeline scale.
3. Use CSS `div` elements with `background-color` and flexbox, not SVG. The existing heatmap uses divs successfully.
4. Cap at 10 projects max, sorted by commits. "Show all" toggle for the rest.
5. Wrap in `React.memo` with `useMemo` for segment computation. Timeline data changes once per scan cycle (5 min), not per render.

**Phase:** Sprint Timeline (Phase 3). Address at component design.

---

### Pitfall 8: Hono RPC Type Chain Breaks When Adding New Route Groups

**What goes wrong:** The existing `app.ts` uses method chaining (`.route("/api", ...)`) to preserve route types for `hc<AppType>`. Adding 2-4 new route groups can push TypeScript's type inference past its instantiation depth limit, causing the RPC client to return `any` for new routes -- silently losing type safety.

**Why it happens:** Hono tracks every route through deeply nested generics. With 8 existing + 4 new = 12 route groups, TypeScript approaches its depth limit. The existing 8 work; 12 might not.

**Prevention:**
1. After adding each route, verify RPC types in a test: `const res = await client.api['health-checks'].$get(); type Check = typeof res;` -- if `any`, chain is broken.
2. Minimize `.route()` calls: one for health/risk endpoints, one for copies/timeline. Two new calls, not four.
3. If depth limits hit, split into sub-apps with their own type exports.
4. Run `pnpm typecheck` in CI. But also add explicit type assertions -- passing typecheck does NOT guarantee correct RPC inference.

**Phase:** API Routes (Phase 2-3). Test types after every route addition.

---

### Pitfall 9: Portfolio-Dashboard Deprecation Breaks Session Startup Hook

**What goes wrong:** The existing portfolio-dashboard MCP server is consumed by Claude Code hooks. Swapping MCP config changes all tool names (`portfolio_status` -> `project_health`, `find_uncommitted` -> `project_risks`). Any hook referencing old names silently fails.

**Why it happens:** MCP tool names are strings with no compile-time validation. The portfolio-dashboard is Python (FastMCP); the replacement is TypeScript (MCP SDK). Different language, different tool signatures.

**Consequences:** Session startup hook silently stops showing risks. The primary MCP use case is defeated without visible error.

**Prevention:**
1. Grep all Claude Code configs and hooks for old tool names before removing portfolio-dashboard.
2. Map references using the spec's migration table (Section 5).
3. Run both servers in parallel for at least one session.
4. Add `--test` flag to MCP server for quick verification.
5. After swap, verify startup banner in a fresh Claude Code session.

**Phase:** MCP Server + Deprecation (Phase 4-5). Test in parallel before cutting over.

---

### Pitfall 10: Remote URL Normalization Misses Edge Cases

**What goes wrong:** Copy discovery groups repos across hosts by normalized remote URL. The spec's normalization (strip `.git`, convert `git@host:` to `host/`) misses: `ssh://git@github.com/user/repo.git`, `https://user:token@github.com/repo`, case differences (`GitHub.com` vs `github.com`), and shorthand formats.

**Consequences:** Multi-copy projects fail to match. Divergence detection never runs for mismatched copies.

**Prevention:**
1. Normalize to `host/owner/repo` (lowercase) regardless of format:
   - Strip protocol prefix
   - Strip authentication credentials
   - Convert `:` to `/` after hostname
   - Strip `.git` suffix
   - Lowercase everything
2. Do NOT log or store URLs with embedded tokens.
3. Unit test with every URL format from your actual repos.
4. Only match `origin` remote. Don't match `upstream` or fork remotes.

**Phase:** Multi-Host Copy Discovery (Phase 2).

---

### Pitfall 11: Event Bus Becomes a Re-render Firehose

**What goes wrong:** The spec adds `health:changed` and `copy:diverged` SSE events. If health engine emits per-project events (20 projects x 1 event each), the frontend gets 20 events in 2 seconds, causing 20 re-renders of any health-subscribed component.

**Why it happens:** The existing system emits ONE `scan:complete` per cycle. Naively emitting per-finding events creates 20x amplification.

**Prevention:**
1. Emit a single `health:changed` event AFTER all health checks complete for all projects. Frontend refetches full state in response.
2. Better: piggyback on existing `scan:complete`. Frontend re-fetches health data alongside project data on `scan:complete`. No new events needed.
3. If new event types are needed for manual re-scans, debounce the callback on the frontend (500ms).

**Phase:** Scanner Changes (Phase 2) and Dashboard (Phase 3). Decide event granularity before building listeners.

---

### Pitfall 12: MCP Server Fails Silently When API Is Unreachable

**What goes wrong:** The MCP server runs on the MacBook, calls the MC API on the Mac Mini over HTTP. When Mac Mini is offline, `fetch()` throws a network error. If the tool handler doesn't catch this, the MCP process crashes and Claude Code loses the connection for the rest of the session.

**Why it happens:** Stdio MCP servers are single-process. One unhandled exception kills everything. Unlike web servers, there is no request isolation.

**Prevention:**
1. Wrap every `fetch()` in try/catch. Return error as MCP tool content, not exception:
   ```typescript
   catch (err) {
     return { content: [{ type: "text", text: `MC API unreachable: ${err.message}` }] };
   }
   ```
2. Connection timeout (5s) on all fetch calls.
3. Top-level `process.on('uncaughtException')` handler that logs but keeps the process alive.

**Phase:** MCP Server (Phase 4).

---

## Minor Pitfalls

---

### Pitfall 13: `gh api` Rate Limiting for Public Repo Detection

**What goes wrong:** 35 repos x `gh api repos/{owner}/{repo}` = 35 GitHub API calls on first scan. Unauthenticated limit is 60/hour.

**Prevention:** Cache `isPublic` persistently (the spec does this). Handle rate limits gracefully (set `null`, retry next cycle). Consider GraphQL batch query. Only call for repos with GitHub remotes.

**Phase:** Git Health Engine (Phase 1).

---

### Pitfall 14: `git merge-base --is-ancestor` Fails Without Shared History

**What goes wrong:** Divergence detection requires both commit hashes to exist locally. If Mac Mini has commits never pushed to the remote, the local repo lacks those commits and `merge-base` fails.

**Prevention:** Verify hash existence (`git cat-file -t <hash>`) before ancestry check. Report "cannot verify -- commits not available locally" instead of "diverged."

**Phase:** Multi-Host Copy Discovery (Phase 2).

---

### Pitfall 15: MCP Package Needs Standalone Build for stdio Execution

**What goes wrong:** `@mission-control/mcp` runs as a separate process spawned by Claude Code. If it imports `@mission-control/shared`, those imports must resolve at runtime outside the monorepo context.

**Prevention:** Bundle with `tsup` or `esbuild`, inlining workspace dependencies. Test by running from outside the monorepo. Add `bin` entry in `package.json`.

**Phase:** MCP Server (Phase 4).

---

### Pitfall 16: Heatmap Removal Causes Dashboard Layout Shift

**What goes wrong:** Replacing heatmap with risk feed + sprint timeline changes the layout. When risk feed is empty (healthy state), visual anchor points shift.

**Prevention:** Zero-height render when risk feed is empty. Sprint timeline occupies heatmap's former position. Deprecate heatmap route but don't remove in v1.1.

**Phase:** Dashboard Changes (Phase 3).

---

### Pitfall 17: Sprint Timeline Segment Algorithm Off-by-One

**What goes wrong:** The gap threshold for merging segments is ambiguous. A 2-day gap over a weekend should merge; a 2-day gap mid-week might not. Off-by-one errors make the visualization look wrong.

**Prevention:** Define: 3+ calendar days with zero commits = segment break. Make threshold configurable via query parameter. Compute segmentation in TypeScript (not SQL) for testability. Validate against real commit data.

**Phase:** Sprint Timeline (Phase 3).

---

### Pitfall 18: Health Checks Create Noise for GitHub-Only Projects

**What goes wrong:** Projects with `host: "github"` have no local clone. Running git health checks on nonexistent paths produces false critical findings.

**Prevention:** The spec handles this: skip all checks for github-only projects, return `healthScore: null`, `riskLevel: "unmonitored"`. Implement as an early return guard in the health engine. Dashboard shows gray dot, not red.

**Phase:** Git Health Engine (Phase 1).

---

## Phase-Specific Warning Summary

| Phase | Likely Pitfall | Mitigation | Severity |
|-------|---------------|------------|----------|
| Git Health Engine | `@{u}` failures on detached HEAD / new branches (P2) | Dependency-ordered checks, detect branch state first | Critical |
| Git Health Engine | Process flooding from parallel git commands (P1) | Serialize within repo, limit cross-repo concurrency | Critical |
| Git Health Engine | `detectedAt` overwritten on upsert (P4) | Exclude from UPDATE set, write preservation test | Critical |
| Git Health Engine | Over-sensitive thresholds (P6) | Higher defaults, suppress for focused project | Moderate |
| Git Health Engine | `gh api` rate limiting (P13) | Cache isPublic, handle gracefully | Minor |
| Git Health Engine | GitHub-only project noise (P18) | Guard clause, return unmonitored | Minor |
| Multi-Host Copy | SSH stale data corrupts divergence (P3) | Track staleness, demote when stale | Critical |
| Multi-Host Copy | URL normalization misses formats (P10) | Comprehensive regex, unit test all formats | Moderate |
| Multi-Host Copy | `merge-base` fails without shared history (P14) | Verify commit existence first | Minor |
| Schema Migration | Future column changes lose data | Design conservatively, backup before migrate | Critical |
| Dashboard Risk Feed | Event bus re-render firehose (P11) | Single batch event per cycle | Moderate |
| Sprint Timeline | DOM performance with many projects (P7) | CSS divs, filter top 10, memo | Moderate |
| Sprint Timeline | Segment gap algorithm (P17) | 3-day threshold, configurable, test with real data | Minor |
| Dashboard Layout | Layout shift on heatmap removal (P16) | Zero-height empty risk feed | Minor |
| API Routes | Hono RPC type chain breaks (P8) | Type-level tests, fewer .route() calls | Moderate |
| MCP Server | stdout pollution (P5) | All logging to stderr, integration test | Critical |
| MCP Server | API unreachable crashes process (P12) | try/catch all fetch, return errors as content | Moderate |
| MCP Server | Standalone build needed (P15) | Bundle with tsup, test outside monorepo | Minor |
| Portfolio Deprecation | Hook references old tool names (P9) | Grep, map, parallel test | Moderate |

---

## Integration Risk Matrix

| Feature Interaction | Risk | Why |
|---------------------|------|-----|
| Health Engine + SSH Scanning | **HIGH** | Health checks depend on SSH freshness for divergence. Stale SSH + aggressive severity = false alerts. P1, P2, P3, P6 intersect. |
| Health Engine + Event Bus + Dashboard | **HIGH** | Many checks produce many findings produce many events produce many re-renders. P1, P6, P11 compound. |
| MCP Server + Portfolio Deprecation | **MEDIUM** | Tool name changes break consumers silently. P5, P9, P12, P15 form a chain: server must build standalone, log to stderr, handle API failures, and match expected tool API. |
| API Routes + Hono RPC Types | **MEDIUM** | New routes must preserve type chain. P8 affects all new API work. |
| Sprint Timeline + Heatmap Removal | **LOW** | Straightforward replacement. Same data source, different rendering. P7, P16, P17 are independent. |
| Schema + Scanner | **LOW** | New tables are additive. No retroactive data migration needed. |

---

## Sources

- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) -- execFile behavior, file descriptor limits
- [Node.js child_process spawn performance issue #21632](https://github.com/nodejs/node/issues/21632) -- process spawning overhead
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- server implementation, stdio transport
- [MCP TypeScript SDK server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) -- tool registration patterns
- [MCP SDK capability registration issue #893](https://github.com/modelcontextprotocol/typescript-sdk/issues/893) -- dynamic registration gotcha
- [Drizzle ORM migrations](https://orm.drizzle.team/docs/migrations) -- SQLite migration limitations
- [SQLite UPSERT documentation](https://www.sqlite.org/lang_UPSERT.html) -- INSERT OR REPLACE = DELETE + INSERT
- [Drizzle onConflictDoUpdate](https://orm.drizzle.team/docs/insert#on-conflict-do-update) -- correct upsert pattern
- [Git branch documentation](https://git-scm.com/docs/git-branch) -- upstream tracking, detached HEAD behavior
- [Git upstream tracking edge cases](https://felipec.wordpress.com/2013/09/01/advanced-git-concepts-the-upstream-tracking-branch/) -- @{u} resolution
- [2025 SANS Detection & Response Survey](https://www.stamus-networks.com/blog/what-the-2025-sans-detection-response-survey-reveals-false-positives-alert-fatigue-are-worsening) -- false positive rates
- [IBM: What Is Alert Fatigue](https://www.ibm.com/think/topics/alert-fatigue) -- monitoring anti-patterns
- [Atlassian: Alert fatigue](https://www.atlassian.com/incident-management/on-call/alert-fatigue) -- threshold tuning strategies
- [MCP 2026 Roadmap](http://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) -- protocol evolution areas
- Existing Mission Control codebase: `project-scanner.ts`, `event-bus.ts`, `db/index.ts`, `app.ts`, `use-sse.ts`
- Existing portfolio-dashboard: `server.py` (Python/FastMCP, stderr logging pattern reference)
