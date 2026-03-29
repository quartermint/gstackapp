# Phase 7: Git Health Engine - Research

**Researched:** 2026-03-14
**Domain:** Git remote-aware health checks, multi-host copy discovery, health scoring
**Confidence:** HIGH

## Summary

Phase 7 is a pure backend phase that extends the existing project scanner (`project-scanner.ts`) to produce health findings for every project. The phase adds no API routes and no dashboard changes -- it writes health data to the `project_health` and `project_copies` tables created in Phase 6, and emits SSE events when health state changes. The core work is: (1) implementing 6 git check types as pure functions that take scan data and return health findings, (2) extending `GitScanResult` to carry the additional git data needed by health checks, (3) extending the SSH batch to collect health data from Mac Mini repos, (4) auto-discovering multi-copy projects by normalized remote URL and detecting divergence, (5) computing health scores and risk levels, and (6) handling edge cases around detached HEAD, new branches, stale SSH data, and public repo escalation.

The data foundation from Phase 6 is complete: `project_health` and `project_copies` tables exist with correct indexes, `upsertHealthFinding()` preserves `detectedAt` timestamps, `resolveFindings()` handles selective resolution, and all Zod schemas/types are exported from the shared package. The Phase 7 work is exclusively in the `packages/api/src/services/` directory, with the primary new file being `git-health.ts` (pure health check functions) and modifications to `project-scanner.ts` (scan data collection + health phase orchestration) and `event-bus.ts` (new event types).

**Primary recommendation:** Structure the health engine as pure functions (`GitScanResult -> HealthFinding[]`) separated from side effects (DB writes, SSH). This enables unit testing with mocked git output for every check type and edge case. Run health checks as a post-scan phase after all repos are scanned, because copy reconciliation requires data from both hosts.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No locked decisions -- user deferred all implementation decisions to Claude's discretion with guidance from the design spec.

### Claude's Discretion
User deferred all implementation decisions. Resolve using the design spec and research findings:

- **Severity thresholds:** Follow spec defaults (unpushed warning: 1-5, critical: 6+). Research recommends starting higher but spec is fine for v1.1 -- can tune later with real data.
- **SSH scan behavior:** Extend existing `scanRemoteProject()` SSH batch with health commands. If Mac Mini unreachable, mark copies as stale via `lastCheckedAt`, demote divergence findings to warning.
- **Health score formula:** Derive from worst active finding severity per spec. Exact 0-100 mapping is Claude's choice.
- **`@{u}` edge case handling:** Research identified detached HEAD, new branches, orphan branches as failure modes. Run checks in dependency order: detect detached HEAD first, then check upstream config, then resolve `@{u}` only when safe.
- **Process concurrency:** Research recommends `p-limit(10-15)` for cross-repo concurrency + serialized commands within each repo. Follow this guidance.
- **Remote URL normalization:** Strip `.git` suffix, normalize `git@github.com:` to `github.com/`, lowercase. Follow spec.
- **`isPublic` cache:** Use `gh api repos/{owner}/{repo} --jq .private` on first scan, cache in `project_copies.isPublic`. Follow spec.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HLTH-01 | Detect unpushed commits with severity (warning: 1-5, critical: 6+) | `git rev-list @{u}..HEAD --count` with dependency-ordered pre-checks; verified exit codes |
| HLTH-02 | Detect projects with no remote (critical) | `git remote -v` returns empty string; verified on test repo |
| HLTH-03 | Detect broken upstream tracking (critical) | Distinguish via `git config branch.<name>.remote` (absent = no upstream, present but `@{u}` fails = broken tracking); verified exit codes |
| HLTH-04 | Detect deleted remote branches (critical) | `git status -sb` output contains `[gone]`; verified on test repo with tracking to deleted remote |
| HLTH-05 | Detect unpulled commits (warning) | `git rev-list HEAD..@{u} --count`; same pre-check dependency as HLTH-01 |
| HLTH-06 | Track dirty working tree age with escalating severity | Existing `dirty` detection + `detectedAt` preservation from Phase 6 upsert; severity = f(now - detectedAt) |
| HLTH-07 | Public repos escalate unpushed severity one tier | `gh api repos/{owner}/{repo} --jq .private` cached in `project_copies.isPublic`; verified on public/private repos |
| HLTH-08 | Health score (0-100) and risk level per project | Pure function mapping worst-severity to score; `getProjectRiskLevel()` already exists from Phase 6 |
| COPY-01 | Auto-discover multi-copy projects by normalized remote URL | `getCopiesByRemoteUrl()` exists; normalization function needed (strip `.git`, normalize SSH to HTTPS, lowercase) |
| COPY-03 | Detect diverged copies via HEAD comparison + ancestry | `git merge-base --is-ancestor` exit codes verified: 0=ancestor, 1=not ancestor, 128=unknown commit |
| COPY-04 | Track per-copy freshness and handle stale SSH data | `lastCheckedAt` column exists; staleness = now - lastCheckedAt > 2 scan cycles (10min) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:child_process` (execFile) | Node.js 22 built-in | Git command execution | Already used throughout scanner; zero new dependency |
| `better-sqlite3` | 11.7+ | DB persistence | Already in use; Phase 6 tables ready |
| `drizzle-orm` | 0.38+ | Query builder | Already in use; all query functions from Phase 6 |
| `p-limit` | 7.3.0 | Cross-repo concurrency limiting | ESM-native, zero deps, prevents EMFILE from 35+ parallel git processes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 2.1+ | Test framework | Already configured; use for all health engine unit tests |
| `zod` | 3.24+ | Schema validation | Already in use; schemas from Phase 6 shared package |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `p-limit` | Hand-rolled Promise semaphore | p-limit is 1.3KB, well-tested, ESM; rolling your own is error-prone |
| `simple-git` | - | Abstraction over 5-line execFile calls; obscures exit code handling critical for health checks |
| `ssh2` | - | `execFile("ssh", [...])` already works in scanner; ssh2 adds complexity |

**Installation:**
```bash
pnpm --filter @mission-control/api add p-limit
```

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/services/
  git-health.ts              # Pure health check functions (new)
  project-scanner.ts         # Extended with health fields + post-scan phase (modified)
  event-bus.ts               # New event types added (modified)
  cache.ts                   # Unchanged
```

### Pattern 1: Health Checks as Pure Functions
**What:** Each health check is a pure function that takes scan data and returns a `HealthFinding | null`. No side effects, no DB access, no git commands.
**When to use:** All 6 check types (7th type, `diverged_copies`, runs at reconciliation level, not per-repo).
**Example:**
```typescript
// git-health.ts
import type { HealthFindingInput, HealthCheckType } from "@mission-control/shared";

/** Extended scan data collected per repo */
export interface HealthScanData {
  slug: string;
  branch: string;           // from existing scan
  dirty: boolean;           // from existing scan
  remoteUrl: string | null; // NEW: git remote get-url origin
  hasRemote: boolean;       // NEW: git remote -v non-empty
  isDetachedHead: boolean;  // NEW: git symbolic-ref --short HEAD exit code
  hasUpstream: boolean;     // NEW: git config branch.<name>.remote exists
  upstreamGone: boolean;    // NEW: git status -sb contains [gone]
  unpushedCount: number;    // NEW: git rev-list @{u}..HEAD --count (0 if N/A)
  unpulledCount: number;    // NEW: git rev-list HEAD..@{u} --count (0 if N/A)
  headCommit: string;       // NEW: git rev-parse HEAD
  isPublic: boolean | null; // from project_copies cache
}

export function checkUnpushedCommits(
  data: HealthScanData
): HealthFindingInput | null {
  if (!data.hasRemote || data.isDetachedHead || !data.hasUpstream || data.upstreamGone) {
    return null; // Other checks handle these cases
  }
  if (data.unpushedCount === 0) return null;

  const isPublicEscalated = data.isPublic && data.unpushedCount >= 1;
  const baseSeverity = data.unpushedCount >= 6 ? "critical" : "warning";
  const severity = (data.isPublic && baseSeverity === "warning") ? "critical" : baseSeverity;

  return {
    projectSlug: data.slug,
    checkType: "unpushed_commits",
    severity,
    detail: `${data.unpushedCount} unpushed commit${data.unpushedCount === 1 ? "" : "s"}${data.isPublic ? " (public repo)" : ""}`,
    metadata: { count: data.unpushedCount, public: data.isPublic ?? false },
  };
}
```

### Pattern 2: Dependency-Ordered Check Execution
**What:** Health checks run in a specific order because earlier checks gate later ones. Detached HEAD must be detected before attempting `@{u}` resolution.
**When to use:** Always -- this is the core execution flow.
**Example:**
```typescript
export function runHealthChecks(data: HealthScanData): HealthFindingInput[] {
  const findings: HealthFindingInput[] = [];

  // 1. No remote -- blocks all remote-dependent checks
  const noRemote = checkNoRemote(data);
  if (noRemote) { findings.push(noRemote); return findings; }

  // 2. Detached HEAD -- blocks upstream checks (detached HEAD has no @{u})
  // Note: detached HEAD is not itself a health finding, but it gates other checks

  // 3. Remote branch gone -- blocks unpushed/unpulled
  const gone = checkRemoteBranchGone(data);
  if (gone) findings.push(gone);

  // 4. Broken tracking -- blocks unpushed/unpulled
  const broken = checkBrokenTracking(data);
  if (broken) findings.push(broken);

  // 5. Only check unpushed/unpulled if upstream is healthy
  if (!gone && !broken && !data.isDetachedHead) {
    const unpushed = checkUnpushedCommits(data);
    if (unpushed) findings.push(unpushed);

    const unpulled = checkUnpulledCommits(data);
    if (unpulled) findings.push(unpulled);
  }

  // 6. Dirty working tree -- independent of remote state
  const dirty = checkDirtyWorkingTree(data);
  if (dirty) findings.push(dirty);

  return findings;
}
```

### Pattern 3: SSH Batch Extension
**What:** Extend the existing SSH batch script with additional git commands for health data, using the same `===SECTION===` delimiter pattern.
**When to use:** Mac Mini repos scanned via `scanRemoteProject()`.
**Example:**
```typescript
const script = [
  `cd "${projectPath}" 2>/dev/null || exit 1`,
  // Existing commands
  `echo "===BRANCH==="`, `git rev-parse --abbrev-ref HEAD 2>/dev/null`,
  `echo "===STATUS==="`, `git status --porcelain 2>/dev/null`,
  `echo "===LOG==="`, `git log -50 --format='%h|%s|%ar|%aI' 2>/dev/null`,
  `echo "===GSD==="`, `cat .planning/STATE.md 2>/dev/null || echo ""`,
  // NEW health commands
  `echo "===REMOTE==="`, `git remote get-url origin 2>/dev/null || echo ""`,
  `echo "===SYMREF==="`, `git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED"`,
  `echo "===STATUS_SB==="`, `git status -sb 2>/dev/null | head -1`,
  `echo "===UPSTREAM_REMOTE==="`, `git config branch.$(git symbolic-ref --short HEAD 2>/dev/null || echo __none__).remote 2>/dev/null || echo ""`,
  `echo "===REVLIST_UP==="`, `git rev-list @{u}..HEAD --count 2>/dev/null || echo "-1"`,
  `echo "===REVLIST_DOWN==="`, `git rev-list HEAD..@{u} --count 2>/dev/null || echo "-1"`,
  `echo "===HEAD_HASH==="`, `git rev-parse HEAD 2>/dev/null || echo ""`,
].join(" && ");
```

### Pattern 4: Post-Scan Health Phase
**What:** Health checks run after ALL repos are scanned (not inline with each scan). This enables copy reconciliation which needs data from both hosts.
**When to use:** In `scanAllProjects()`, after the existing scan loop.
**Example:**
```typescript
// In scanAllProjects():
// 1. Existing scan loop (unchanged)
// 2. NEW: Post-scan health phase
//    a. Run per-repo health checks on each scan result
//    b. Upsert findings to project_health
//    c. Resolve findings for check types that now pass
//    d. Run copy reconciliation pass (cross-host)
//    e. Emit health:changed event
```

### Pattern 5: Remote URL Normalization
**What:** Normalize git remote URLs to enable cross-host copy matching.
**When to use:** When storing `remoteUrl` in `project_copies` and when grouping copies.
**Example:**
```typescript
export function normalizeRemoteUrl(url: string): string {
  let normalized = url.trim();

  // git@github.com:owner/repo.git -> github.com/owner/repo
  normalized = normalized.replace(/^git@([^:]+):/, "$1/");

  // https://github.com/owner/repo.git -> github.com/owner/repo
  normalized = normalized.replace(/^https?:\/\//, "");

  // Strip .git suffix
  normalized = normalized.replace(/\.git$/, "");

  // Strip trailing slash
  normalized = normalized.replace(/\/$/, "");

  // Lowercase
  normalized = normalized.toLowerCase();

  return normalized;
}
```

### Anti-Patterns to Avoid
- **Inline health checks during scan:** Don't run health checks inside the per-repo scan loop. Copy reconciliation needs ALL repos scanned first.
- **`@{u}` without pre-checks:** Never call `git rev-list @{u}..HEAD` without first verifying: not detached HEAD, has remote, has upstream configured, upstream not gone. Each failure mode produces exit code 128 which is indistinguishable from other errors.
- **Separate SSH connections for health data:** Don't open a second SSH connection for health commands. Extend the existing batch script.
- **Using `INSERT OR REPLACE` for upserts:** Phase 6 already solved this -- `upsertHealthFinding()` uses SELECT-then-UPDATE/INSERT in a transaction. Don't bypass this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrency limiting | Promise semaphore | `p-limit` | 1.3KB, battle-tested, ESM; hand-rolled versions have subtle bugs with error handling |
| Health finding persistence | Raw SQLite INSERT | `upsertHealthFinding()` from Phase 6 | Already handles detectedAt preservation correctly |
| Finding resolution | Manual UPDATE queries | `resolveFindings()` from Phase 6 | Handles selective resolution by active check types |
| Risk level computation | Custom severity logic | `getProjectRiskLevel()` from Phase 6 | Already maps severity to risk level correctly |
| Copy upsert | Raw INSERT | `upsertCopy()` from Phase 6 | Handles conflict on (slug, host) unique index |

**Key insight:** Phase 6 built the entire data persistence layer. Phase 7 should exclusively use those functions for DB writes and focus on producing correct `HealthFindingInput` objects and `CopyInput` objects.

## Common Pitfalls

### Pitfall 1: `@{u}` Fails with Exit 128 on Multiple Conditions
**What goes wrong:** `git rev-list @{u}..HEAD` returns exit code 128 for detached HEAD, new branches (no upstream), orphan branches, and deleted remote branches. Without checking each case, you get false critical alerts.
**Why it happens:** `@{u}` is syntactic sugar for the upstream tracking ref. When there's no tracking ref, git has no way to resolve it.
**How to avoid:** Run checks in dependency order:
1. `git symbolic-ref --short HEAD` -- exit 128 = detached HEAD (skip all upstream checks)
2. `git remote -v` -- empty = no remote (HLTH-02: critical)
3. `git config branch.<name>.remote` -- empty/exit 1 = no upstream configured (not broken tracking, just unconfigured -- could be intentional)
4. `git status -sb | head -1` -- contains `[gone]` = remote branch deleted (HLTH-04: critical)
5. Only THEN: `git rev-list @{u}..HEAD --count` and `git rev-list HEAD..@{u} --count`
6. If step 5 still fails after all prechecks pass: broken tracking (HLTH-03: critical)
**Warning signs:** Tests that mock git output but don't test the check ordering.

### Pitfall 2: Process Flooding on 35+ Repos
**What goes wrong:** Running health check git commands in parallel across 35 repos spawns 200+ `execFile` processes simultaneously, hitting `EMFILE` (too many open files) or git lock contention.
**Why it happens:** `Promise.allSettled()` with no concurrency limit launches everything at once.
**How to avoid:** Use `p-limit(10)` for cross-repo concurrency. Within each repo, serialize commands into a single `sh -c` invocation (local) or into the existing SSH batch (Mac Mini).
**Warning signs:** Sporadic test failures on CI, `EMFILE` in logs, git commands returning empty output.

### Pitfall 3: `detectedAt` Overwritten on Upsert
**What goes wrong:** If someone bypasses `upsertHealthFinding()` and uses raw INSERT, `detectedAt` resets to "now" every scan cycle. Dirty age escalation (HLTH-06) never fires because the finding always looks fresh.
**Why it happens:** SQLite `INSERT OR REPLACE` is DELETE + INSERT.
**How to avoid:** Always use `upsertHealthFinding()` from Phase 6. It uses a transaction with SELECT-then-UPDATE (preserving `detectedAt`) or INSERT (fresh `detectedAt`). Already tested with regression test in `health.test.ts`.
**Warning signs:** Dirty working tree findings never escalate past "info" severity.

### Pitfall 4: SSH Stale Data Corrupts Divergence Detection
**What goes wrong:** Mac Mini is unreachable during a scan cycle. The old `headCommit` in `project_copies` is compared against the current local HEAD, producing a false divergence alert.
**Why it happens:** SSH failure returns null from `scanRemoteProject()`, but the old copy data persists in the DB.
**How to avoid:** Track staleness via `lastCheckedAt`. On SSH failure, do NOT update the copy's `headCommit` -- only check and log the failure. When computing divergence, check if `lastCheckedAt` is older than 2 scan cycles (10 minutes). If stale, either skip divergence check or demote the finding to "warning" with a staleness note.
**Warning signs:** Divergence alerts appearing when Mac Mini is down for maintenance.

### Pitfall 5: `isPublic` API Call Fails or Times Out
**What goes wrong:** `gh api repos/{owner}/{repo} --jq .private` fails due to rate limiting, auth issues, or network problems. Without caching, every scan cycle retries for every repo.
**Why it happens:** GitHub API has rate limits (5000/hour authenticated, 60/hour unauthenticated).
**How to avoid:** Check `project_copies.isPublic` first. Only call `gh api` when `isPublic` is null (first scan or cache miss). Cache the result in the DB via `upsertCopy()`. If `gh api` fails, leave `isPublic` as null and don't escalate severity (treat as private by default).
**Warning signs:** Slow scans on first run, API rate limit errors in logs.

### Pitfall 6: Multi-Copy Config Entries Skipped by Legacy Scanner
**What goes wrong:** The existing scanner has a guard: `if (!("path" in project) || !("host" in project)) return;` that skips multi-copy entries (they have `copies` array instead of `path`/`host`).
**Why it happens:** Phase 6 deliberately added this guard to defer multi-copy handling to Phase 7.
**How to avoid:** In `scanAllProjects()`, normalize both single-host and multi-copy config entries into a flat list of `(slug, host, path)` tuples before the scan loop. Each copy gets scanned individually using the existing `scanProject()` or `scanRemoteProject()` functions.
**Warning signs:** Multi-copy projects show zero health findings and zero copy records.

### Pitfall 7: Health Score Formula Edge Cases
**What goes wrong:** Projects with only `info` findings get scored as unhealthy, or projects with `null` findings (github-only) get scored instead of being `unmonitored`.
**Why it happens:** Conflating "no findings" with "healthy" vs "unmonitored".
**How to avoid:** `getProjectRiskLevel()` from Phase 6 already handles this correctly: no findings = "healthy", only info = "healthy". "unmonitored" is set at the scanner layer for github-only projects. For the 0-100 score: no findings = 100, worst info = 100, worst warning = 60, worst critical = 20. Or use a deduction model: start at 100, subtract per finding severity.
**Warning signs:** GitHub-only projects showing a health score instead of null.

## Code Examples

### Complete Health Check Flow Per Repo
```typescript
// Collect health-relevant git data for a single local repo
async function collectHealthData(
  projectPath: string,
  slug: string,
  cachedIsPublic: boolean | null
): Promise<HealthScanData | null> {
  try {
    // Run all commands in one sh -c invocation to minimize process count
    const script = [
      `git remote get-url origin 2>/dev/null || echo ""`,
      `echo "===DELIM==="`,
      `git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED"`,
      `echo "===DELIM==="`,
      `git status -sb 2>/dev/null | head -1`,
      `echo "===DELIM==="`,
      `BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo ""); test -n "$BRANCH" && git config branch.$BRANCH.remote 2>/dev/null || echo ""`,
      `echo "===DELIM==="`,
      `git rev-list @{u}..HEAD --count 2>/dev/null || echo "-1"`,
      `echo "===DELIM==="`,
      `git rev-list HEAD..@{u} --count 2>/dev/null || echo "-1"`,
      `echo "===DELIM==="`,
      `git rev-parse HEAD 2>/dev/null || echo ""`,
    ].join(" && ");

    const { stdout } = await execFile("sh", ["-c", script], {
      cwd: projectPath,
      timeout: 10_000,
    });

    const parts = stdout.split("===DELIM===").map(s => s.trim());
    const remoteUrl = parts[0] || null;
    const symref = parts[1] || "DETACHED";
    const statusSb = parts[2] || "";
    const upstreamRemote = parts[3] || "";
    const unpushedRaw = parseInt(parts[4] || "-1", 10);
    const unpulledRaw = parseInt(parts[5] || "-1", 10);
    const headCommit = parts[6] || "";

    return {
      slug,
      branch: symref === "DETACHED" ? "HEAD" : symref,
      dirty: false, // already tracked by existing scan
      remoteUrl,
      hasRemote: remoteUrl !== null && remoteUrl !== "",
      isDetachedHead: symref === "DETACHED",
      hasUpstream: upstreamRemote !== "",
      upstreamGone: statusSb.includes("[gone]"),
      unpushedCount: unpushedRaw >= 0 ? unpushedRaw : 0,
      unpulledCount: unpulledRaw >= 0 ? unpulledRaw : 0,
      headCommit,
      isPublic: cachedIsPublic,
    };
  } catch {
    return null;
  }
}
```

### Remote URL Normalization (Verified Patterns)
```typescript
// Verified against actual project remotes
// Input: "git@github.com:sternryan/mission-control.git"  -> "github.com/sternryan/mission-control"
// Input: "https://github.com/sternryan/mission-control.git" -> "github.com/sternryan/mission-control"
// Input: "git@github.com:quartermint/streamline"           -> "github.com/quartermint/streamline"

export function normalizeRemoteUrl(url: string): string {
  let n = url.trim();
  // SSH format: git@host:owner/repo -> host/owner/repo
  n = n.replace(/^[a-z]+@([^:]+):/, "$1/");
  // HTTPS format: https://host/owner/repo -> host/owner/repo
  n = n.replace(/^https?:\/\//, "");
  // Strip credentials: user:pass@host -> host
  n = n.replace(/^[^@]+@/, "");
  // Strip .git suffix
  n = n.replace(/\.git$/, "");
  // Strip trailing slash
  n = n.replace(/\/$/, "");
  // Lowercase
  return n.toLowerCase();
}
```

### Health Score Computation
```typescript
// Recommended: deduction model
// 100 = perfect, deductions based on worst finding
export function computeHealthScore(findings: HealthFindingInput[]): number {
  if (findings.length === 0) return 100;

  const hasCritical = findings.some(f => f.severity === "critical");
  const hasWarning = findings.some(f => f.severity === "warning");

  if (hasCritical) return 20;
  if (hasWarning) return 60;
  return 100; // info-only findings don't reduce score
}
```

### Copy Divergence Detection
```typescript
// After scanning both hosts, compare HEAD commits
export async function checkDivergence(
  localCopy: { headCommit: string; lastCheckedAt: string },
  remoteCopy: { headCommit: string; lastCheckedAt: string },
  localRepoPath: string,
  slug: string,
  staleCutoffMs: number = 600_000 // 10 minutes = 2 scan cycles
): Promise<HealthFindingInput | null> {
  // Same HEAD = synced
  if (localCopy.headCommit === remoteCopy.headCommit) return null;

  // Check staleness
  const remoteAge = Date.now() - new Date(remoteCopy.lastCheckedAt).getTime();
  const isStale = remoteAge > staleCutoffMs;

  // Ancestry check (can only run from local repo that has the history)
  try {
    const { stdout } = await execFile(
      "git", ["merge-base", "--is-ancestor", remoteCopy.headCommit, localCopy.headCommit],
      { cwd: localRepoPath, timeout: 5_000 }
    );
    // Exit 0: remote is ancestor of local -> local is ahead (not diverged)
    return null;
  } catch (err) {
    const exitCode = (err as { code?: number }).code;
    if (exitCode === 1) {
      // Remote is NOT ancestor of local -- check reverse
      try {
        await execFile(
          "git", ["merge-base", "--is-ancestor", localCopy.headCommit, remoteCopy.headCommit],
          { cwd: localRepoPath, timeout: 5_000 }
        );
        // Local is ancestor of remote -> remote is ahead (not diverged, just behind)
        return null;
      } catch {
        // Neither is ancestor -> truly diverged
        return {
          projectSlug: slug,
          checkType: "diverged_copies",
          severity: isStale ? "warning" : "critical",
          detail: `Copies diverged between local and mac-mini${isStale ? " (mac-mini data stale)" : ""}`,
          metadata: {
            localHead: localCopy.headCommit,
            remoteHead: remoteCopy.headCommit,
            stale: isStale,
          },
        };
      }
    }
    if (exitCode === 128) {
      // Unknown commit -- remote HEAD not in local history (shallow clone or force-push)
      return {
        projectSlug: slug,
        checkType: "diverged_copies",
        severity: isStale ? "warning" : "critical",
        detail: `Cannot verify copy ancestry (commit ${remoteCopy.headCommit.slice(0, 7)} unknown locally)${isStale ? " (mac-mini data stale)" : ""}`,
        metadata: {
          localHead: localCopy.headCommit,
          remoteHead: remoteCopy.headCommit,
          stale: isStale,
          unknownCommit: true,
        },
      };
    }
    return null;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `git status --porcelain` only | Full remote-aware health checks | Phase 7 (now) | Detects 6 new problem types beyond dirty files |
| Single-host scanning | Multi-host with copy discovery | Phase 7 (now) | Catches divergence between MacBook and Mac Mini |
| No health persistence | Upsert with detectedAt preservation | Phase 6 (done) | Enables age-based severity escalation |
| `Promise.allSettled` unlimited | `p-limit(10)` bounded concurrency | Phase 7 (now) | Prevents EMFILE on large project counts |

**Deprecated/outdated:**
- Existing `scanAllProjects()` skip guard for multi-copy entries must be replaced with flat normalization

## Git Command Reference (Verified on macOS)

| Command | Success Output | Failure Output | Exit Code |
|---------|---------------|----------------|-----------|
| `git remote get-url origin` | `git@github.com:owner/repo.git` | `fatal: No such remote 'origin'` | 0 / 2 |
| `git remote -v` | `origin\turl (fetch)\n...` | empty string | 0 |
| `git symbolic-ref --short HEAD` | `main` | `fatal: ref HEAD is not a symbolic ref` | 0 / 128 |
| `git config branch.main.remote` | `origin` | empty | 0 / 1 |
| `git rev-parse --abbrev-ref @{u}` | `origin/main` | `fatal: no upstream configured...` | 0 / 128 |
| `git status -sb \| head -1` | `## main...origin/main` | `## main...origin/main [gone]` | 0 |
| `git status -sb \| head -1` (detached) | `## HEAD (no branch)` | N/A | 0 |
| `git rev-list @{u}..HEAD --count` | `3` (number) | `fatal: ...` | 0 / 128 |
| `git rev-list HEAD..@{u} --count` | `1` (number) | `fatal: ...` | 0 / 128 |
| `git rev-parse HEAD` | `abc1234...` (40 chars) | empty | 0 |
| `git merge-base --is-ancestor A B` | empty (is ancestor) | empty (not ancestor) | 0 / 1 / 128 |
| `gh api repos/owner/repo --jq .private` | `true` or `false` | error message | 0 / 1 |

## Open Questions

1. **Health score granularity**
   - What we know: Worst-severity mapping is straightforward (critical=20, warning=60, healthy=100). The spec says 0-100 but doesn't define the formula.
   - What's unclear: Should multiple findings of the same severity reduce the score further? (e.g., 2 warnings = 50 vs 1 warning = 60?)
   - Recommendation: Start with worst-severity-only (simpler, matches `getProjectRiskLevel()` behavior from Phase 6). Can add granularity later if needed.

2. **No-upstream vs broken-tracking distinction**
   - What we know: `git config branch.<name>.remote` empty = no upstream configured. `git rev-parse --abbrev-ref @{u}` fails with config present = broken tracking.
   - What's unclear: Should "no upstream configured" be a finding at all? Many repos are intentionally local-only.
   - Recommendation: Make it a separate check type or sub-case. If `hasRemote` is true but `hasUpstream` is false, emit an "info" finding (not critical). Only "broken tracking" (config exists but ref fails) should be "critical".

3. **Concurrency on Mac Mini SSH**
   - What we know: SSH batch already serializes commands into one connection per repo. Cross-repo SSH calls use `Promise.allSettled`.
   - What's unclear: Does Mac Mini have enough CPU to handle 5+ concurrent SSH git sessions?
   - Recommendation: `p-limit` applies to ALL repos (local + SSH). With limit of 10, at most 5 might be SSH repos at once, which is reasonable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1+ |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HLTH-01 | Unpushed commit detection with severity thresholds | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "unpushed"` | Wave 0 |
| HLTH-02 | No remote detection (critical) | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "no remote"` | Wave 0 |
| HLTH-03 | Broken upstream tracking detection | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "broken tracking"` | Wave 0 |
| HLTH-04 | Deleted remote branch detection | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "remote branch gone"` | Wave 0 |
| HLTH-05 | Unpulled commits detection | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "unpulled"` | Wave 0 |
| HLTH-06 | Dirty working tree age escalation | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "dirty"` | Wave 0 |
| HLTH-07 | Public repo unpushed severity escalation | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "public"` | Wave 0 |
| HLTH-08 | Health score and risk level computation | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "score"` | Wave 0 |
| COPY-01 | Multi-copy auto-discovery by normalized URL | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "normalize"` | Wave 0 |
| COPY-03 | Diverged copies detection via ancestry | integration | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "diverge"` | Wave 0 |
| COPY-04 | Stale SSH data graceful degradation | unit | `pnpm --filter @mission-control/api exec vitest run src/__tests__/services/git-health.test.ts -t "stale"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/services/git-health.test.ts` -- covers HLTH-01 through HLTH-08, COPY-01, COPY-03, COPY-04 (all pure function tests with mocked HealthScanData)
- [ ] No new shared fixtures needed -- existing `createTestDb()` helper works for integration tests
- [ ] `p-limit` install: `pnpm --filter @mission-control/api add p-limit`

## Sources

### Primary (HIGH confidence)
- Mission Control codebase -- direct examination of `project-scanner.ts`, `health.ts`, `copies.ts`, `event-bus.ts`, `config.ts`, `schema.ts`, all test files
- Git command behavior -- verified on macOS with test repos for detached HEAD, no upstream, gone tracking, no remote, ancestry check exit codes
- Design spec `docs/superpowers/specs/2026-03-14-git-health-intelligence-design.md` -- check types, severity logic, data model, scanner integration
- Phase 6 deliverables -- `0005_git_health.sql` migration, `upsertHealthFinding()`, `resolveFindings()`, `upsertCopy()`, Zod schemas
- `mc.config.json` -- 33 projects (15 local, 5 Mac Mini, 13 GitHub-only), verified project count for concurrency analysis

### Secondary (MEDIUM confidence)
- `p-limit` npm registry -- version 7.3.0, ESM-only, zero dependencies
- `gh api` command -- verified on real repos (`sternryan/mission-control` private, `sternryan/msgvault` public)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- almost zero new dependencies; everything extends existing codebase
- Architecture: HIGH -- pure function pattern verified against existing scanner code; Phase 6 data layer complete
- Pitfalls: HIGH -- every `@{u}` edge case verified with actual git commands on macOS; exit codes confirmed
- Git command behavior: HIGH -- all 12 commands tested on real and synthetic repos with verified output formats

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable domain, git CLI unlikely to change)
