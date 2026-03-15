# Domain Pitfalls: v1.2 Auto-Discovery + Star Intelligence

**Domain:** Adding directory-based auto-discovery (MacBook + Mac Mini + GitHub orgs), GitHub star intelligence with intent categorization, config file mutation, and dashboard triage to an existing Node.js + SQLite + React monitoring dashboard
**Researched:** 2026-03-15
**Milestone context:** Subsequent milestone on Mission Control v1.1 (25K LOC, 356 tests, production on Mac Mini)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or silent feature failure.

---

### Pitfall 1: `find` Command on macOS Home Directory Produces Hundreds of Permission Errors and Scans Wrong Paths

**What goes wrong:** The spec uses `find ~/ -maxdepth 2 -name .git -type d` on macOS. This command hits multiple macOS-specific edge cases simultaneously:

1. **TCC (Transparency, Consent, and Control) protected directories:** macOS Catalina+ restricts terminal access to `~/Desktop`, `~/Documents`, `~/Downloads` without explicit Full Disk Access granted to the terminal app. Node.js `execFile("find", ...)` inherits the parent process's TCC entitlements. If the API server runs via `ssh` or `launchd` (Mac Mini), TCC permissions may not be granted, producing `Operation not permitted` errors for every protected subdirectory.

2. **iCloud Drive symlinks:** `~/Desktop` and `~/Documents` can be iCloud Drive symlinks pointing to `~/Library/Mobile Documents/com~apple~CloudDocs/`. By default, `find` does NOT follow symlinks (`-type d` only matches real directories). The `.git` directory inside an iCloud-synced project lives behind a symlink chain. With `-maxdepth 2`, the symlink eats one level, so repos inside `~/Desktop/myproject/.git` may not be found if `~/Desktop` is a symlink.

3. **stderr flood:** Even with `2>/dev/null` in the shell command, the `find` process still traverses and attempts access for every directory, including `~/Library/` (hundreds of subdirectories), `~/.Trash`, `~/.docker`, `~/Applications`. The spec's `-not -path` exclusions help but run AFTER the directory access attempt. With hundreds of permission errors, the command takes 5-10 seconds instead of <1s.

4. **Mac Mini `~/` scan via SSH:** The SSH-executed `find` command inherits the remote shell's TCC context, which may differ from the interactive terminal's. If the Mac Mini has never had Terminal granted Full Disk Access, the `find` command fails silently for protected directories.

**Why it happens:** The `find` command is designed for Linux-style filesystems where home directories are flat. macOS home directories are byzantine: iCloud symlinks, TCC protection, SIP-protected paths, Spotlight metadata directories, Time Machine snapshots.

**Consequences:** Discovery misses repos in `~/Desktop/` and `~/Documents/` (common for casual projects). Logs fill with permission denied noise every 30 minutes. Scan takes 5-10 seconds on Mac Mini, blocking the SSH connection for other uses. The user thinks discovery works but never sees repos they expect to find.

**Prevention:**
1. **Prune before descend, not filter after access.** Use `find ~/ -maxdepth 2 -name .git -type d -prune` with explicit path pruning that prevents directory entry (not `-not -path`):
   ```bash
   find ~/ -maxdepth 2 \
     \( -name node_modules -o -name Library -o -name .Trash -o -name .cache \
        -o -name .npm -o -name .nvm -o -name .cargo -o -name .rustup \
        -o -name Applications -o -name .docker -o -name .local \
        -o -name "Music" -o -name "Movies" -o -name "Pictures" \) -prune \
     -o -name .git -type d -print \
     2>/dev/null
   ```
   The `-prune` action prevents `find` from descending into the pruned directories at all, avoiding both TCC errors and wasted traversal time.

2. **Follow symlinks explicitly for known paths.** Add `-L` flag OR scan `~/Desktop` and `~/Documents` separately if they are symlinks: `readlink ~/Desktop` to detect iCloud redirection, then scan the real path.

3. **Parse results defensively.** The `find` output can contain paths with spaces, newlines in filenames (rare but possible), and partial output if the process is killed. Use `-print0` and split on null bytes:
   ```bash
   find ~/ -maxdepth 2 -name .git -type d -print0 2>/dev/null
   ```
   Then split on `\0` in Node.js instead of `\n`.

4. **Timeout the `find` command aggressively.** Set a 10-second timeout. If `find` hangs (e.g., on a network volume mount in `~/`), it should not block the entire discovery cycle.

5. **Test on the actual Mac Mini**, not just the MacBook. The TCC and filesystem state differ between machines.

**Detection:** Monitor discovery scan duration. If `find` takes >3 seconds on the Mac Mini, investigate path exclusions. Log the count of discovered repos per source -- if local scan consistently finds fewer repos than expected, symlink or TCC issues are likely.

**Phase:** Discovery Engine (Phase 1). Address at directory scanning implementation.

---

### Pitfall 2: GitHub Lists API Does Not Exist -- Star Categorization Design Is Built on a Non-Existent API

**What goes wrong:** The spec calls for categorizing stars into GitHub star lists via `gh api --method POST /user/lists`. This API endpoint does not exist. GitHub has no public REST API or GraphQL API for managing star lists. This has been requested since 2021 (community discussion #8293) and GitHub has stated they have "no immediate plans" to release it.

The spec acknowledges this risk ("exact endpoints to be verified... the Lists API is relatively new and endpoint paths may differ") and includes a local fallback. But the design treats GitHub list sync as the primary storage and local DB as fallback. If the Lists API is completely unavailable (not just "different endpoints"), the entire categorization UX flow needs redesign.

**Why it happens:** The GitHub web UI has star lists (you can create "My Tools", "Reference" lists and add starred repos to them). This suggests an API exists because the frontend must call something. But the internal API endpoints used by the GitHub web app are not exposed publicly, not documented, and could change without notice. Building on undocumented internal endpoints is building on sand.

**Consequences:** If built assuming the API exists: categorization silently fails on first use, error handling catches it, falls back to local storage, and the user sees no difference. The real damage is wasted development time building the sync layer, retry logic, and list management code. If an undocumented internal API is reverse-engineered and used: it works for weeks, then breaks when GitHub changes their internal API, causing silent data loss (categorizations sent to a 404 endpoint).

**Prevention:**
1. **Design for local-first from the start.** The `starIntent` and `starProject` columns in `discovered_projects` ARE the primary storage. There is no GitHub list sync in v1.2. Period. Remove all spec references to `gh api --method POST /user/lists` and list creation.
2. **If GitHub releases a Lists API in the future**, add sync as a separate feature. The local categorization data is the source of truth; GitHub lists are a read-through cache, not the other way around.
3. **The UI flow stays the same.** The user clicks "Reference for open-ez" and it writes to `starIntent = 'reference'` and `starProject = 'open-ez'` in the DB. No GitHub API call. The categorized star moves from the discoveries section to a "Categorized Stars" view or disappears (promoted state).
4. **Document this decision** in the phase plan: "GitHub star lists API does not exist (verified 2026-03-15). Categorization is local-only. Revisit if GitHub ships a public Lists API."

**Detection:** If someone adds GitHub list API calls: the calls fail with 404. Catch this in code review, not production.

**Phase:** Star Intelligence (Phase 3). Must be resolved BEFORE implementation begins -- affects the data flow design.

---

### Pitfall 3: Config File Mutation Creates a Read-After-Write Race Between the Discovery Service and the Health Scanner

**What goes wrong:** The promote flow writes to `mc.config.json` and updates an in-memory `currentConfig` reference. The health scanner reads config at cycle start. Two race conditions emerge:

1. **Write-write race:** Two promote clicks within milliseconds. The spec calls for a Promise-chain mutex, which correctly serializes writes. But the second promote re-reads `mc.config.json` from disk, which was written by the first promote. If the first write hasn't flushed to disk yet (Node.js `writeFileSync` is synchronous, but `writeFile` is not), the second read gets stale data and overwrites the first promote.

2. **Read-write race:** The health scanner calls `scanAllProjects(currentConfig, ...)` at the start of a 5-minute cycle. Midway through the cycle (e.g., at the 2-minute mark), a promote updates `currentConfig`. The NEXT scan cycle picks up the new project. But the CURRENT cycle already snapshotted `currentConfig` at cycle start -- it won't scan the new project until the next cycle. This is the spec's intended behavior. The problem is if the promote also triggers an immediate re-scan (e.g., via SSE event or refetch): the scan runs with the OLD config snapshot, not the new one.

3. **Write corruption on crash:** If the process crashes between truncating `mc.config.json` (opening for write) and completing the write, the config file is empty or partially written. Next restart: `loadConfig()` throws, the entire API fails to start. No recovery path.

**Why it happens:** The existing codebase loads config once at startup (`loadConfig()` in `index.ts`) and passes it as an immutable parameter. The discovery engine introduces config MUTATION for the first time. The patterns designed for read-only config do not handle writes.

**Consequences:** Lost promotes (two quick promotes, first one lost). Config file corruption (power loss or OOM kill). API fails to start after crash (empty config file).

**Prevention:**
1. **Use `writeFileSync` (not `writeFile`)** for the config write. The spec's Promise-chain mutex handles in-process serialization. `writeFileSync` ensures the write is flushed to disk before the mutex is released. In a single-process Node.js app, `writeFileSync` is safe because no other code runs during the sync write.
2. **Write to temp file, then rename.** The atomic write pattern: `writeFileSync('mc.config.json.tmp', data)` then `renameSync('mc.config.json.tmp', 'mc.config.json')`. Rename is atomic on POSIX. This prevents corruption from crashes mid-write.
3. **Backup before write.** Copy `mc.config.json` to `mc.config.json.bak` before any write. If the main file is corrupt on startup, `loadConfig()` can fall back to the backup. Log a warning.
4. **Snapshot config at cycle start.** The scanner already does this implicitly (config is a function parameter). Formalize it: `const snapshot = structuredClone(currentConfig)` at cycle start. Mutations to `currentConfig` during the cycle do not affect the running scan.
5. **Do NOT trigger immediate re-scan on promote.** The new project appears in the next 5-minute scan cycle. This is fast enough. Triggering immediate scans on promote creates timing complexity for zero UX benefit (the user promoted it and knows it exists).

**Detection:** Integration test: promote two projects in rapid succession, verify both appear in the config file. Crash test: kill the process mid-write (SIGKILL during writeFileSync), verify config is recoverable.

**Phase:** Promote Flow (Phase 3). Address at config write implementation.

---

### Pitfall 4: Discovery Dedup Fails for Multi-Host Repos Without Remote URLs

**What goes wrong:** The spec's dedup logic checks three conditions: (a) `path` exact match for local/mac-mini, (b) `remoteUrl` normalized match, (c) `repo` field match. A common scenario breaks all three:

A user has `~/experiment/` on MacBook (no remote, just `git init`) and `~/experiment/` on Mac Mini (also no remote, same manual setup). These are two different repos that happen to share a directory name. Discovery finds both, creates two entries with `slug: "experiment"`. Neither has a `remoteUrl`. The slug is NOT unique in `discovered_projects` (by design -- the spec says so). But when the user promotes one, MC tries to write to `mc.config.json` with `slug: "experiment"`. If they promote the second, a SECOND entry with `slug: "experiment"` appears in config. The scanner now has two projects with the same slug, and `upsertProject` (which keys on slug) picks one arbitrarily.

The reverse case is also broken: `~/open-ez` on MacBook and `~/open-ez` on Mac Mini are the SAME project (same remote URL). They should be auto-matched and presented as a multi-copy entry. But the discovery scan runs local and SSH in parallel, producing two separate discovered_projects entries. If the user promotes one as a single-host entry before the other is matched, they end up with a single-host config instead of a multi-copy config.

**Why it happens:** The dedup logic is designed for the happy path (repos with remote URLs). Repos without remotes are common in the user's workflow ("a Claude Code session in ~/ spawns a new directory" -- per the spec). These repos have no remoteUrl for matching.

**Consequences:** Duplicate slugs in config cause project data overwrites. Same project discovered twice (local + mac-mini) without auto-matching means manual multi-copy setup. Promoted repos without remotes get health checks that immediately flag "no remote" -- correct but annoying if the user just created it.

**Prevention:**
1. **Require slug uniqueness at promote time, not at discovery time.** When promoting, check `projects` table for existing slug. If collision: auto-append host suffix (`experiment-local`, `experiment-mac-mini`) or prompt user to change slug.
2. **Cross-host matching for remote-less repos:** When both MacBook and Mac Mini have `~/experiment/` with no remote, present as "possible same project" in the discovery UI with a "Link as copies" action instead of auto-matching.
3. **For repos WITH remotes:** Auto-group by normalized remoteUrl at discovery time. Present as a single card: "Found on MacBook + Mac Mini" with a "Track as multi-copy" promote action that writes the multi-copy config format.
4. **Add a uniqueness check in the promote flow:** Before writing to `mc.config.json`, validate that no existing project has the same slug. If collision, return a 409 Conflict with the suggested alternative slug.

**Detection:** Unit test: discover `~/experiment` on both hosts (no remote), promote both, verify config integrity. Integration test: discover a repo with remotes on both hosts, verify single multi-copy card in UI.

**Phase:** Discovery Engine (Phase 1) for dedup logic, Promote Flow (Phase 3) for slug collision handling.

---

### Pitfall 5: `gh api --paginate` for Org Repos Silently Hits Secondary Rate Limits on Large Orgs

**What goes wrong:** The spec uses `gh api /orgs/{org}/repos --paginate` for two orgs (quartermint, vanboompow). GitHub's `--paginate` flag does NOT handle rate limits. When pagination encounters a 403 (secondary rate limit) or 429 (primary rate limit), it terminates abruptly -- no retry, no partial result handling. The user gets whatever pages completed before the limit was hit.

For the current orgs, this is unlikely (small orgs, few repos). But the pattern is fragile. Each `--paginate` call makes N API requests (1 per page of 30 repos). Two orgs + starred repos = 3+ API calls per discovery cycle. The health scanner already makes 35 `gh api repos/{owner}/{repo}` calls per 5-minute cycle to check `isPublic`. Total: ~38 API calls per 5 minutes = ~456/hour. Authenticated limit is 5,000/hour, so this is fine at current scale.

The danger: if `githubOrgs` grows (e.g., adding 3-4 more orgs) or the health scanner's isPublic checks lose caching, the combined API call volume can approach secondary rate limits (undocumented, but roughly 100 requests per minute for REST API).

**Why it happens:** The spec treats `gh api` as a simple command without considering that `--paginate` has no built-in rate limit awareness. The v1.1 `fetchIsPublic` already caches results per copy record, preventing repeated calls for the same repo. But discovery adds NEW API calls that compound.

**Consequences:** Partial org discovery -- some repos in the org are never discovered. No error visible to the user unless they check API server logs. The discovery engine thinks the org has 30 repos when it actually has 90.

**Prevention:**
1. **Do NOT use `--paginate`.** Instead, fetch a single page with a reasonable limit: `gh api /orgs/{org}/repos?per_page=100&sort=updated`. 100 repos per page covers most personal orgs. If the user has an org with 100+ repos, add pagination manually with rate limit awareness.
2. **Consolidate GitHub API calls.** Use a single GraphQL query instead of multiple REST calls:
   ```graphql
   query {
     organization(login: "quartermint") {
       repositories(first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) {
         nodes { name, url, description, primaryLanguage { name } }
       }
     }
   }
   ```
   One GraphQL call replaces N paginated REST calls. GraphQL rate limits are separate (5,000 points/hour).
3. **Add rate limit check before GitHub API calls.** Call `gh api rate_limit --jq '.rate.remaining'` at the start of the discovery cycle. If remaining < 100, skip GitHub sources for this cycle.
4. **Space discovery cycle away from health scan cycle.** The discovery timer (30 min) should NOT align with the health scan timer (5 min). Start the discovery timer with a 2-minute offset so they never fire simultaneously.

**Detection:** Log the `X-RateLimit-Remaining` header from GitHub API responses. Alert if remaining drops below 500. Monitor org repo counts: if discovery consistently finds fewer repos than `gh repo list --limit 1000 -L` shows, pagination is being truncated.

**Phase:** Discovery Engine (Phase 1) for GitHub scanning, health scanner integration for API call budgeting.

---

## Moderate Pitfalls

Mistakes that cause poor UX, rework, or subtle bugs.

---

### Pitfall 6: Re-Surface Logic Creates "Whack-a-Mole" Annoyance for Intentionally Ignored Repos

**What goes wrong:** The spec's re-surface rules bring back dismissed discoveries under two conditions: (1) new activity since dismissal, (2) 30 days since dismissal. For repos the user intentionally ignores (forks, templates, archived-but-not-deleted, boilerplate), these keep coming back. Every 30 days, `experiment-xyz` reappears. The user dismisses it. 30 days later, it's back.

Some repos on the Mac Mini are infrastructure (Docker configs, training scripts) that the user will never track in MC. They have git activity (cron jobs, automated commits) but are not "projects." Each discovery cycle resurfaces them because `lastActivityAt > dismissedAt` is always true.

**Why it happens:** The re-surface rules are designed for the case where the user dismissed something hastily and later works on it. They don't account for repos that have legitimate activity but are intentionally excluded from MC.

**Consequences:** Discovery section always has 5-10 "zombie" discoveries the user has dismissed multiple times. The section becomes noise. The user stops looking at discoveries, defeating the feature's purpose. Same alert fatigue pattern as v1.1 Pitfall 6 (over-sensitive health thresholds).

**Prevention:**
1. **Exponential backoff on re-surface.** First dismissal: 30-day re-surface. Second dismissal: 90 days. Third dismissal: 365 days. Use the `dismissCount` column (already in the spec) to compute: `resurface_delay = 30 * 3^(dismissCount - 1)` capped at 365 days.
2. **"Permanently ignore" action.** A third action beyond Track/Dismiss: "Ignore forever." Sets a `permanentlyIgnored` flag. These repos never re-surface. Show a "Manage ignored repos" link in discovery settings for reversal.
3. **Add `ignorePaths` match.** If the repo path matches an `ignorePaths` pattern, skip it during discovery. Users can add `~/docker-configs/` or `~/.infrastructure/` to prevent discovery of non-project repos.
4. **Suppress re-surface for repos with only automated activity.** If the commits since dismissal are all from the same author AND have similar commit messages (regex pattern like `^(chore|auto|cron|update):`), the activity is likely automated. Don't re-surface for automated activity.

**Detection:** Track `dismissCount` distribution after 2 months. If many discoveries have `dismissCount >= 3`, the re-surface rules are too aggressive. Dashboard metric: ratio of (discoveries dismissed) / (discoveries promoted). If >80% are dismissed, the signal-to-noise ratio is bad.

**Phase:** Discovery Engine (Phase 1) for re-surface logic, Dashboard (Phase 4) for "Ignore forever" action.

---

### Pitfall 7: SSH Discovery Scan Blocks the SSH Connection for 10+ Seconds, Interfering with Health Scans

**What goes wrong:** The discovery scan runs `find ~/ -maxdepth 2 -name .git -type d` on the Mac Mini via SSH. On a Mac Mini with many directories (Go projects, Docker volumes, training data, npm caches), this `find` command can take 5-15 seconds. During this time, the SSH connection is occupied. If a health scan cycle fires while the discovery SSH is running, the health scan's SSH connections (one per Mac Mini project, via `p-limit(10)`) queue behind the discovery SSH, delaying health data by 10+ seconds.

The spec says discovery and health scans run on independent timers (30 min vs 5 min). But they can overlap: health scan at t=300s, discovery scan also at t=300s (if they started together). Even if offset, the discovery SSH can take long enough to collide with the next health scan.

**Why it happens:** Both scanners use `execFile("ssh", ...)` which creates separate SSH connections. The Mac Mini's SSH server handles concurrent connections (default `MaxSessions 10` in sshd_config). But the `find` command doing disk I/O on the Mac Mini competes with the health scan's git commands for disk bandwidth. On a Mac Mini that also runs Docker and training jobs, I/O contention is real.

**Consequences:** Health scan data is stale by 10-15 seconds. Divergence detection gets delayed. Not critical, but noticeable when monitoring scan cycle duration.

**Prevention:**
1. **Run `find` results caching.** The directory structure changes rarely. Run `find` only on the FIRST discovery cycle, then cache the results for 6 hours. Subsequent cycles check only the cached paths for new `.git` directories (using `ls` or `test -d`, which is instant). Full re-scan every 6 hours.
2. **Use a timeout on the SSH find command.** The SSH connection has a 20-second timeout, but the `find` command inside it can take longer without the connection timing out. Add `timeout 10` to the `find` command: `ssh mac-mini 'timeout 10 find ~/ -maxdepth 2 -name .git -type d ...'`.
3. **Schedule discovery to avoid health scan overlap.** Start discovery timer with a 150-second offset from the health scan timer: `setTimeout(() => setInterval(discover, 1800000), 150000)`. This ensures discovery always runs mid-cycle between health scans.
4. **Batch the find + metadata commands.** Run `find` + per-repo metadata (git log -1, git remote get-url) in a single SSH session. The existing SSH batch pattern works: find repos, then for each, collect metadata. One SSH connection, not one per repo.

**Detection:** Log timestamps for SSH commands. If discovery SSH duration exceeds 10 seconds, caching is needed. Compare health scan start times with discovery scan start times -- if they overlap, add offset.

**Phase:** Discovery Engine (Phase 1). Address at SSH scanning implementation.

---

### Pitfall 8: Metadata Inference from `package.json` / `Cargo.toml` / `go.mod` Fails Silently for Non-Standard Project Layouts

**What goes wrong:** The spec infers project `name` from `package.json#name`, then `Cargo.toml#[package].name`, then `go.mod` module path, then directory name. For local repos, this requires reading files from the repo. For Mac Mini repos, this requires SSH file reads. Several failure modes:

1. **Monorepo root has no `package.json`.** The root of a pnpm/npm/yarn monorepo might have a `package.json` with `"name": "root"` or `"private": true` and a useless name. The actual project name is in `packages/app/package.json`.
2. **`Cargo.toml` in a Cargo workspace.** The root `Cargo.toml` has `[workspace]` but no `[package]` section. The project name is in `members/*/Cargo.toml`.
3. **File reading via SSH adds per-repo overhead.** For each new discovery on Mac Mini, reading `package.json` via SSH adds an SSH round-trip. With 10 new discoveries, that's 10 extra SSH connections (unless batched).
4. **`go.mod` module path includes the full URL.** A `go.mod` with `module github.com/user/project` should produce name "project", not "github.com/user/project".
5. **TOML parsing.** Node.js has no built-in TOML parser. Parsing `Cargo.toml` requires either a dependency (`@iarna/toml`, `smol-toml`) or regex extraction. Regex is fragile for nested TOML structures.

**Why it happens:** The inference chain assumes standard project layouts. Real-world repos are messy: monorepos, polyglot projects, repos with multiple build systems, repos with no manifest files at all.

**Consequences:** Misleading names in the discovery UI. The user sees "root" instead of "my-project" for monorepos. Extra SSH round-trips slow down discovery. TOML parse errors crash the inference chain and produce no name at all.

**Prevention:**
1. **Directory name is the best default.** Use it as the primary name. Manifest file inference is a nice-to-have enhancement, not a critical path. Title-case the directory name: `open-ez` -> `Open Ez`.
2. **Batch metadata reads into the SSH find command.** After `find`, for each new repo, read `package.json` in the same SSH session:
   ```bash
   for dir in $(find ~/ -maxdepth 2 -name .git -type d); do
     repo=$(dirname "$dir")
     echo "===REPO=== $repo"
     cat "$repo/package.json" 2>/dev/null | head -5
     echo "===END==="
   done
   ```
   But this is complex and fragile. Better: just use directory name for Mac Mini repos, read manifests only for local repos.
3. **For monorepos:** If `package.json` exists and has `"workspaces"` or `"private": true`, fall back to directory name instead of `package.json#name`.
4. **For `go.mod`:** Extract the last path segment: `module github.com/user/project` -> `project`. Use `path.split('/').pop()`.
5. **Skip TOML parsing entirely.** Use regex for the simple case: `/\[package\]\s*\nname\s*=\s*"([^"]+)"/`. If it doesn't match, fall back to directory name. Don't add a TOML dependency for one field extraction.
6. **All inference is best-effort.** If anything fails, the directory name is the name. Never throw from metadata inference.

**Detection:** Log inferred names during discovery. If names are frequently "root", "app", or module URLs, the inference chain is matching wrong files.

**Phase:** Discovery Engine (Phase 1). Address at metadata inference implementation.

---

### Pitfall 9: Promote Flow Creates Inconsistency Between `discovered_projects` and `projects` Table

**What goes wrong:** When a discovery is promoted, the spec says: (1) write to `mc.config.json`, (2) upsert into `projects` table, (3) set status to `promoted` in `discovered_projects`. If step 2 fails (e.g., slug collision in projects table) but step 1 succeeded, the config file has the project but the database doesn't. The next scan reads the config, tries to upsert, and might succeed (creating the project) or fail again (if the collision is with a different host entry for the same slug).

The reverse is also problematic: if step 1 fails (config write error) but step 2 has already been attempted (it hasn't in the spec's order, but a developer might reorder), the database has the project but config doesn't. The next scan reads config, doesn't find the project, and doesn't scan it.

**Why it happens:** The promote flow spans two storage systems (JSON file + SQLite) without a unified transaction. JSON file writes cannot participate in SQLite transactions. There's no two-phase commit.

**Consequences:** Ghost projects in config that never get scanned (missing from DB). Projects in DB that disappear on restart (missing from config). User promotes, sees the project briefly, then it vanishes.

**Prevention:**
1. **Order matters: DB first, config second.** Validate and write to `projects` table first (inside a SQLite transaction). If that succeeds, write to `mc.config.json`. If config write fails, roll back the DB transaction. Since the scanner reads config to know what to scan, the config file is the source of truth for "what projects exist."
2. **Actually: config first, DB will catch up.** The scanner reads config and upserts into `projects` on every cycle. So the correct order is: (1) write to config, (2) the next scan cycle upserts into projects automatically. Skip the explicit `projects` table upsert in the promote flow entirely. The scanner handles it within 5 minutes. This removes the two-system consistency problem.
3. **Validate before writing.** Before config write: check slug uniqueness against existing config entries (not just DB). Validate the entry against `projectConfigEntrySchema`. Return errors to the user before any mutation.
4. **The only thing the promote API does:** validate input, acquire mutex, re-read config, append entry, write config (atomic via temp file + rename), release mutex, update `discovered_projects` status. Let the scanner handle `projects` table upsert.

**Detection:** After promote, verify the project appears in the next `GET /api/projects` response (may take up to 5 minutes). If it doesn't, config write succeeded but scanner didn't pick it up.

**Phase:** Promote Flow (Phase 3). Address at API route implementation.

---

### Pitfall 10: Discovery Section Layout Shift When Discoveries Appear and Disappear

**What goes wrong:** The spec places the discoveries section between Risk Feed and Sprint Timeline. It only renders when `status: new` discoveries exist. When the user promotes or dismisses all discoveries, the section disappears, causing the Sprint Timeline, Hero, and Departure Board to shift upward. The next discovery cycle may find new repos, causing the section to appear and shift everything down. This jitter is disorienting, especially for a home screen the user opens every morning.

The same problem exists on initial load: if discoveries data loads after the sprint timeline (different API endpoints, different response times), the section inserts itself after the page has already rendered, causing a visible layout shift.

**Why it happens:** Conditional rendering (`{discoveries.length > 0 && <Discoveries />}`) creates zero-height space when hidden and full-height when shown. The user's eye anchor (sprint timeline position) moves.

**Consequences:** Content Layout Shift (CLS) on the primary daily view. User loses visual orientation when discoveries appear/disappear between visits.

**Prevention:**
1. **Reserve minimum height when discoveries exist.** Use `min-height` instead of conditional rendering. When empty, show a collapsed bar: "No new discoveries" (one line). When discoveries exist, expand. This prevents layout shift.
2. **Alternatively: fixed-position section that scrolls.** The discoveries section is always at the same position. When empty, it shows a thin divider. When populated, it expands in place. The content below does not shift because discoveries expand INTO scroll space, not pushing content down.
3. **Load discovery count with the initial project fetch.** Add `discoveryCount` to the `GET /api/projects` response (the spec already calls for this). Use it to pre-allocate layout space before the full discoveries data loads.
4. **Animate transitions.** When discoveries appear/disappear, use `max-height` CSS transitions (300ms) instead of abrupt mount/unmount. This gives the user visual continuity.

**Phase:** Dashboard (Phase 4). Address at layout component design.

---

### Pitfall 11: Hono RPC Type Chain Breaks with 5th New Route Group

**What goes wrong:** v1.1 Pitfall 8 identified that adding route groups can push TypeScript's type inference past its instantiation depth limit. v1.2 adds 2 new route groups (`/api/discoveries`, `/api/discover`). Combined with v1.1's additions, the total route groups in `app.ts` may approach or exceed the limit where `hc<AppType>` returns `any` for some routes.

This is the same pitfall as v1.1 but with higher probability because each milestone adds more routes. The cumulative effect is what breaks things.

**Prevention:** Same as v1.1 Pitfall 8:
1. Minimize `.route()` calls -- combine discovery endpoints into a single route group.
2. After adding routes, test RPC types explicitly: `const res = await client.api.discoveries.$get(); type Check = typeof res;` -- if `any`, chain is broken.
3. Run `pnpm typecheck` and verify with explicit type assertions.

**Phase:** API Routes (Phase 2). Test after each route addition.

---

### Pitfall 12: GitHub Star Scan Missing Stars When More Than 10 Are Starred in 30 Minutes

**What goes wrong:** The spec fetches `per_page=10` most recent stars. It acknowledges this limitation: "if >10 repos are starred in a single 30-minute window, older stars in that batch are silently missed." The spec accepts this risk, but in practice, the user stars repos in bursts -- during a research session, 10-20 repos might be starred in quick succession (browsing awesome lists, exploring a topic).

**Why it happens:** No watermark or cursor-based pagination for star scanning. Each cycle fetches the same window: "most recent 10."

**Consequences:** Stars from a research session are partially captured. The user starred 15 repos during a Friday evening research binge. MC discovers 10 of them. The other 5 are lost unless they happen to still be in the top 10 on the next cycle (unlikely if new stars are added).

**Prevention:**
1. **Increase `per_page` to 50.** The API call cost is the same (one request). 50 stars in 30 minutes is extremely unlikely.
2. **Persist a watermark.** Store the `starred_at` timestamp of the most recent processed star. On the next cycle, fetch stars newer than the watermark. If the watermark is missing (first run), fetch 50 and process all.
3. **On first discovery cycle, backfill.** Fetch the last 100 stars (2 pages) to capture the user's recent starring history. Subsequent cycles fetch only new stars (per_page=10 with watermark is fine).

**Detection:** Compare MC's star discovery count with `gh api /user/starred --jq 'length'`. If MC consistently shows fewer, the window is too small.

**Phase:** Discovery Engine (Phase 1) for star scanning configuration.

---

### Pitfall 13: AI Tagline Generation for Discovered Repos Compounds Gemini API Costs and Failures

**What goes wrong:** The spec generates AI taglines from README.md for each new discovery. Discovery finds 10+ new repos on first run. Each triggers an async Gemini API call. With 10-20 new repos, this creates 10-20 API calls in quick succession, potentially hitting Gemini's rate limits (especially the free tier). If the Gemini API key is not set (warning already shown at startup for capture enrichment), tagline generation silently fails for ALL discoveries, leaving every discovery with `tagline: null`.

The async pattern (`queueMicrotask`) means tagline generation fires immediately after discovery insertion. If the discovery scan finds 20 repos, 20 microtasks queue up, all calling Gemini in parallel.

**Why it happens:** The existing capture enrichment pipeline handles low volume (user captures one thought at a time). Discovery generates bursts of 10-20 items simultaneously.

**Consequences:** Gemini rate limit errors. All taglines fail for the batch. API cost spike on first run. The discovery section shows 20 repos with no taglines -- less useful but not broken.

**Prevention:**
1. **Rate limit AI calls.** Use the same `p-limit` pattern: `const aiLimit = pLimit(3)`. At most 3 concurrent Gemini calls.
2. **Tagline generation is deferred, not synchronous with discovery.** Insert discoveries with `tagline: null`. Run tagline generation as a separate background pass (like capture enrichment). Use a queue, not microtasks.
3. **GitHub description is the fallback.** For GitHub org repos and starred repos, the API response includes `description`. Use it as the tagline. Only call Gemini for local/Mac Mini repos with a README.
4. **Skip tagline generation on first run.** The first discovery cycle may find 20+ repos. Generate taglines only for repos that have been in `discovered_projects` for >1 cycle (still `status: new` after 30 minutes). This prevents the initial burst.
5. **Graceful degradation.** If GEMINI_API_KEY is not set, don't queue tagline generation at all. Use directory name or GitHub description only.

**Phase:** Discovery Engine (Phase 1). Address alongside AI enrichment integration.

---

## Minor Pitfalls

---

### Pitfall 14: `find` Discovers `.git` Inside Bare Repos and Submodules

**What goes wrong:** `find ~/ -maxdepth 2 -name .git -type d` finds `.git` directories in bare repositories (which have no working tree) and in git submodules (where `.git` is a file, not a directory -- though `-type d` filters these out). Bare repos produce a discovery card, but scanning them for branch/commits fails because bare repos have different git commands (`git --bare ...`).

**Prevention:** After discovering a path, verify it's a working tree: check for `HEAD` file and no `--bare` flag. `git -C "$path/.." rev-parse --is-inside-work-tree` returns `true` for working trees, `false` for bare repos. Skip bare repos in discovery.

**Phase:** Discovery Engine (Phase 1).

---

### Pitfall 15: `gh api /user/starred` Requires `read:user` Scope That May Not Be in Current gh Auth

**What goes wrong:** The `gh` CLI authenticates with specific OAuth scopes. The default `gh auth login` grants `repo` and `read:org` scopes. Fetching starred repos (`/user/starred`) may require additional scopes. If the scope is missing, the API call returns an empty array or 403 -- silently producing zero star discoveries.

**Prevention:** Test `gh api /user/starred?per_page=1` during development. If it returns an error, run `gh auth refresh -s read:user`. Document the required scopes. Add a startup check: if `scanStars: true` in config, verify the scope with `gh auth status`.

**Phase:** Discovery Engine (Phase 1).

---

### Pitfall 16: Discovery Count in Project List Response Creates N+1 Query Pattern

**What goes wrong:** The spec adds `discoveryCount` to `GET /api/projects` response. If implemented as a subquery (`SELECT COUNT(*) FROM discovered_projects WHERE status = 'new'`), it runs once per project list request -- fine. But if a developer adds per-project discovery linkage later (e.g., "2 starred repos reference this project"), the query becomes N+1: one subquery per project row.

**Prevention:** `discoveryCount` is a global count (total new discoveries), not per-project. Compute it as a single query, not inline with the project list query. Return it as a top-level field in the response, not per-project.

**Phase:** API Routes (Phase 2).

---

### Pitfall 17: Event Bus Needs New Event Types Without Bloating the SSE Protocol

**What goes wrong:** Adding `discovery:new` to the SSE event types. The existing event bus has 6 event types. Adding discovery events brings it to 7+. Each new event type means: update `MCEventType` union, update SSE handler, update frontend hook. Not complex, but easy to forget one step and have the event fire on the server but never reach the frontend.

**Prevention:** Follow the exact pattern from v1.1: (1) add to `MCEventType` union in `event-bus.ts`, (2) emit in the discovery service, (3) add handler in `use-sse.ts`, (4) invalidate TanStack Query in the handler. Checklist this across all three packages.

**Phase:** Discovery Engine (Phase 1) for emission, Dashboard (Phase 4) for handling.

---

### Pitfall 18: Config Schema Extension Breaks Backward Compatibility

**What goes wrong:** Adding a `discovery` section to `mc.config.json` and parsing it with Zod. If the schema requires `discovery` to be present, existing config files (without the section) fail validation on startup. The API doesn't start.

**Prevention:** Make the `discovery` section optional with sensible defaults:
```typescript
const discoveryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  scanDirs: z.array(z.string()).default(["~/"]),
  githubOrgs: z.array(z.string()).default([]),
  scanStars: z.boolean().default(true),
  intervalMinutes: z.number().default(30),
  ignorePaths: z.array(z.string()).default([]),
}).optional().default({});
```
Existing configs work without modification. Discovery starts with defaults.

**Phase:** Data Foundation (Phase 1).

---

## Phase-Specific Warning Summary

| Phase | Likely Pitfall | Mitigation | Severity |
|-------|---------------|------------|----------|
| Discovery Engine | `find` macOS edge cases: TCC, symlinks, stderr flood (P1) | Prune-before-descend, `-print0`, explicit timeout | Critical |
| Discovery Engine | SSH `find` blocks connection, interferes with health scan (P7) | Cache results, timeout command, schedule offset | Moderate |
| Discovery Engine | Dedup fails for repos without remotes (P4) | Slug uniqueness at promote time, cross-host matching | Critical |
| Discovery Engine | Re-surface whack-a-mole annoyance (P6) | Exponential backoff, "Ignore forever" action | Moderate |
| Discovery Engine | `gh api --paginate` rate limit truncation (P5) | Single page per_page=100, GraphQL batch, rate check | Critical |
| Discovery Engine | Star scan misses burst-starred repos (P12) | Increase per_page to 50, watermark persistence | Moderate |
| Discovery Engine | AI tagline generation burst overloads Gemini (P13) | Rate limit with p-limit, defer to second cycle | Moderate |
| Discovery Engine | `gh` auth scope missing for stars (P15) | Startup scope check, document requirements | Minor |
| Discovery Engine | Bare repos and submodules in find results (P14) | Verify working tree before creating discovery | Minor |
| Star Intelligence | GitHub Lists API does not exist (P2) | Local-first design, no API calls for categorization | Critical |
| Promote Flow | Config write race conditions and crash corruption (P3) | writeFileSync, temp+rename atomic write, backup | Critical |
| Promote Flow | Promote creates DB/config inconsistency (P9) | Config-first, let scanner upsert DB on next cycle | Moderate |
| Promote Flow | Slug collision on promote (P4 related) | Validate uniqueness before write, suggest alternatives | Critical |
| API Routes | Hono RPC type chain stress from new routes (P11) | Combine into single route group, type-level tests | Moderate |
| API Routes | discoveryCount N+1 query risk (P16) | Global count, not per-project subquery | Minor |
| Dashboard | Layout shift when discoveries appear/disappear (P10) | Reserve min-height, animate transitions | Moderate |
| Dashboard | New SSE event type wiring incomplete (P17) | Checklist: union type, emitter, handler, query invalidation | Minor |
| Config Schema | New `discovery` section breaks existing configs (P18) | Optional with defaults, backward compatible | Minor |
| Metadata Inference | Name inference fails for monorepos, Cargo workspaces (P8) | Directory name as primary, manifests as enhancement | Moderate |

---

## Integration Risk Matrix

| Feature Interaction | Risk | Why |
|---------------------|------|-----|
| Discovery SSH + Health SSH | **HIGH** | Two independent SSH consumers competing for Mac Mini I/O and connection slots. P1, P7 compound. Discovery `find` can take 10+ seconds, stalling health scan's git commands. |
| Config Mutation + Scanner Config Read | **HIGH** | First time config is mutated at runtime. No existing patterns for config reload. Write-write race, crash corruption, stale snapshot. P3, P9 form a chain. |
| GitHub API Budget: Discovery + Health | **HIGH** | Discovery adds org repo scans + star scans + isPublic checks to the existing health scanner's GitHub API calls. Combined volume can hit secondary rate limits. P5, v1.1 P13 compound. |
| Discovery Dedup + Promote + Multi-Copy | **MEDIUM** | Same repo discovered on two hosts must be correctly matched, presented, and promoted as multi-copy OR two separate entries. P4 affects the entire promote flow. |
| Star Categorization + Non-Existent API | **MEDIUM** | The entire GitHub list sync design is based on an API that doesn't exist. P2 requires a design pivot before implementation. |
| Re-Surface Logic + Dashboard UX | **MEDIUM** | Aggressive re-surfacing combined with layout shift creates a noisy, jittery dashboard. P6 + P10 compound. |
| AI Tagline + Gemini Rate Limits | **LOW** | Taglines are nice-to-have. Failure mode is acceptable (null tagline). P13 is annoying but not breaking. |
| Event Bus + Discovery SSE | **LOW** | One new event type following established patterns. P17 is a checklist item, not a design risk. |

---

## Sources

- [GitHub REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) -- Authenticated: 5,000/hr, Unauthenticated: 60/hr (HIGH confidence)
- [Updated rate limits for unauthenticated requests (2025)](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/) -- Recent tightening of unauthenticated limits (HIGH confidence)
- [GitHub community discussion #8293: Star lists API request](https://github.com/orgs/community/discussions/8293) -- "No immediate plans" for Lists API, confirmed by GitHub staff (HIGH confidence)
- [GitHub community discussion #54240: Star lists REST API](https://github.com/orgs/community/discussions/54240) -- No public endpoints exist for star list management (HIGH confidence)
- [gh CLI issue #4443: --paginate does not handle rate limits](https://github.com/cli/cli/issues/4443) -- Pagination terminates on 403, no retry (HIGH confidence)
- [REST API endpoints for starring](https://docs.github.com/en/rest/activity/starring) -- Only basic star/unstar endpoints, no list management (HIGH confidence)
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) -- execFile behavior, spawn limitations (HIGH confidence)
- [macOS TCC (Transparency, Consent, and Control)](https://support.apple.com/guide/mac-help/change-permissions-for-files-folders-or-disks-mchlp1203/mac) -- Protected directory access restrictions (HIGH confidence)
- [Node.js race conditions in file operations](https://medium.com/@ak.akki907/understanding-and-avoiding-race-conditions-in-node-js-applications-fb80ba79d793) -- JSON file concurrent write patterns (MEDIUM confidence)
- [Concurrent JSON file writes with lockfile](https://gist.github.com/stekhn/d3170b5a4b0d8b02f2d4805b24d98281) -- Temp file + rename atomic write pattern (MEDIUM confidence)
- [macOS find command reference](https://ss64.com/mac/find.html) -- -prune vs -not -path behavior, symlink handling (HIGH confidence)
- Mission Control v1.1 codebase: `project-scanner.ts`, `event-bus.ts`, `config.ts`, `index.ts` -- Direct code examination (HIGH confidence)
- Mission Control v1.2 design spec: `docs/superpowers/specs/2026-03-15-auto-discovery-star-intelligence-design.md` (HIGH confidence)
- Mission Control v1.1 PITFALLS.md -- Previous pitfall research for cross-reference (HIGH confidence)
