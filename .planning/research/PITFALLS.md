# Domain Pitfalls

**Domain:** Auto-discovery engine, GitHub star management, session convergence, CLI client
**Researched:** 2026-03-16
**Context:** Adding these features to existing MC (32K LOC, 462 tests, Drizzle ORM + SQLite, Hono API)

## Critical Pitfalls

Mistakes that cause rewrites, broken user experience, or fundamentally undermine the feature's value.

### Pitfall 1: Discovery Noise Overwhelms the Dashboard

**What goes wrong:** The auto-discovery engine finds every `.git` directory on disk and surfaces them all. The user's home directory has 80+ directories, many containing git repos that are cloned experiments, one-off forks, `npm init` throwaway tests, Homebrew taps, dotfile repos, language tool caches (`~/.cargo`, `~/.rustup`, `go/pkg`), and other repos you never want to see in MC. The discoveries section becomes a graveyard of noise. The user stops looking at it -- the exact "every capture system becomes a graveyard" pattern MC was designed to avoid.

**Why it happens:** The discovery engine is told to "find all git repos in ~/". It does exactly that. Without opinionated filtering, the signal-to-noise ratio is terrible. On this machine, at least 30 of 80+ home directories contain git repos that aren't meaningful projects.

**Consequences:** User dismisses the feature entirely. The "discoveries" section is never used. Dashboard feels cluttered. Defeats the core value ("smarter in 3 seconds").

**Prevention:**
- **Allowlist-based scanning, not full crawl.** Scan `~/` at depth 1 only (immediate children), not recursive. Each child that has `.git/` is a candidate. Do NOT descend into `~/Library`, `~/go`, `~/node_modules`, `~/.cargo`, `~/.local`, `~/Applications`, etc.
- **Hard-coded exclusion list:** `Library`, `node_modules`, `.npm`, `.pnpm-store`, `.cargo`, `.rustup`, `go/pkg`, `.local`, `.cache`, `Applications`, `Movies`, `Music`, `Pictures`, `Documents`, `Downloads`, `Desktop` -- these never contain intentional projects.
- **Known-project dedup:** Skip directories already in `mc.config.json`. Discovery surfaces net-new repos only.
- **Minimum viable signal:** Require at least 1 commit to surface. Bare repos, empty inits, and submodules get filtered.
- **Dismiss is permanent:** Once a user dismisses a discovered repo, it stays dismissed forever (persisted in DB). Never re-surface it.
- **Track/promote is simple:** One click to add to `mc.config.json` projects list. Not just "acknowledge" -- the action produces a real outcome.

**Detection:** Discoveries section shows > 20 items on first scan. User never interacts with it. Items reappear after being dismissed.

### Pitfall 2: GitHub Stars API Rate Limit Exhaustion

**What goes wrong:** The authenticated GitHub API allows 5,000 requests per hour across ALL endpoints. MC's project scanner already uses `gh api` for GitHub-hosted repos (scanGithubProject) and isPublic checks (fetchIsPublic). Each scan cycle hits GitHub for every github-hosted project. Adding star fetching on top -- potentially paginating through hundreds of stars at 100/page -- quickly eats into the budget. When the rate limit is hit, health checks for existing projects start failing, the gh CLI returns errors, and the entire scan cycle degrades.

**Why it happens:** Stars API uses REST pagination (max 100 per page). A user with 500 stars needs 5 pages. With the `starred_at` timestamp header (`application/vnd.github.v3.star+json`), each request is heavier. MC's scan cycle runs every 5 minutes. If star sync is coupled to the scan cycle, that's 60 star API calls per hour just for stars, plus 30+ for existing project/copy scanning.

**Consequences:** `gh api repos/owner/repo --jq ".private"` calls in fetchIsPublic start returning 403. GitHub-hosted project scans fail silently. Health findings go stale. The user may not notice because failures are swallowed with `catch(() => null)`.

**Prevention:**
- **Decouple star sync from scan cycle.** Stars don't change every 5 minutes. Sync stars on a separate timer: once per hour, or once per day.
- **Incremental sync with `since` parameter.** After first full fetch, only request stars added since last sync timestamp. The REST API supports `?sort=created&direction=desc` -- stop paginating when you hit a star you already have.
- **Cache ETag headers per page.** Conditional requests (`If-None-Match`) that return 304 do not count against rate limit. Store ETags in SQLite per endpoint.
- **Rate limit budget tracking.** Before star sync, call `gh api rate_limit` to check remaining. If < 500 remaining, defer star sync to next window.
- **Surface rate limit status.** Add a health finding if rate limit is low. Don't silently degrade.
- **Use GraphQL for bulk queries.** GraphQL API has a separate 5,000-point budget and can fetch star data more efficiently in one query than multiple REST pagination calls.

**Detection:** Health findings stop updating for github-hosted projects. `gh api rate_limit` shows 0 remaining. Stars last synced timestamp stops advancing.

### Pitfall 3: SSH Scanning Timeouts Cascade into Discovery Failures

**What goes wrong:** The auto-discovery engine needs to find repos on Mac Mini via SSH. This means running `find` or `ls` commands over SSH to discover directories. The existing scanner already uses SSH for known paths (20-second timeout). Discovery requires scanning unknown paths, which may include large directories (`/opt/homebrew`, Go module caches, Docker volumes). A single slow SSH command blocks the scan pipeline and can cause the entire discovery cycle to timeout or hang.

**Why it happens:** Existing SSH scanning runs targeted `git` commands on known paths. Discovery needs to walk unknown directory trees remotely. If Mac Mini is sleeping, on slow WiFi, or under load (training job, Docker Crawl4AI), SSH latency spikes. The `find` command in large directory trees can take minutes.

**Consequences:** Discovery scan blocks the main project scan cycle. All project data goes stale while waiting for SSH. Dashboard stops updating. If SSH command hangs, Node.js child_process timeout fires and scan results are partial.

**Prevention:**
- **Never discover during the main scan cycle.** Discovery runs on its own timer (e.g., every 30 minutes or on-demand trigger). The 5-minute project scan is sacred -- it must never be blocked by discovery.
- **SSH discovery uses aggressive timeouts.** `ConnectTimeout=3` and command timeout of 10 seconds. Better to miss repos than block the pipeline.
- **Pre-defined scan roots for Mac Mini.** Don't `find / -name .git`. Scan `~/` at depth 1 only, same as local. The Mac Mini home directory is where projects live.
- **SSH failure is non-fatal with stale marker.** If SSH discovery fails, show "Mac Mini: last scanned 2 hours ago" rather than hiding the section or showing errors.
- **Separate SSH connection for discovery.** Don't reuse the batch SSH connection that the main scanner uses. A hanging discovery SSH should not affect project scanning.

**Detection:** Project cards show stale data (last scanned > 10 minutes ago). Discovery section says "Mac Mini: scanning..." indefinitely.

### Pitfall 4: Session Convergence False Positives Cause Alert Fatigue

**What goes wrong:** Convergence detection watches for parallel sessions on the same project that are "ready to merge." But it fires too aggressively. Two Claude Code sessions editing the same project in different directories (e.g., one in `packages/api`, another in `packages/web`) triggers a convergence alert even though there's zero actual conflict. Or a session completes and git shows diverged branches, but the divergence is intentional (feature branch vs main). Users start ignoring convergence alerts entirely.

**Why it happens:** Convergence is harder than conflict detection. The existing conflict detector works on file overlap -- a concrete, verifiable signal. Convergence is about "these sessions should probably be merged now" -- a judgment call. Simple heuristics (same project, both completed, different commits) produce too many false positives.

**Consequences:** Alert fatigue. User disables convergence notifications. The feature becomes noise rather than signal, violating "smarter in 3 seconds."

**Prevention:**
- **Only fire on actual file overlap.** Don't flag convergence just because two sessions exist on the same project. Require: (a) both sessions touched files, (b) the touched file sets overlap, (c) at least one session has committed.
- **Respect the file conflict detector.** Convergence is the "now what?" after conflict detection. Only surface convergence for sessions that had active file conflicts during their lifetime.
- **Never auto-alert. Surface in the UI passively.** Show a "merge candidate" badge on the project card, not a toast notification or risk feed card. The user looks when they're ready.
- **Time-window requirement.** Only flag convergence if both sessions were active within the same 30-minute window. Two sessions 8 hours apart on the same project are serial work, not parallel convergence.
- **Test against real session data from v1.2.** Run the convergence algorithm against existing session records before shipping. How many false positives does it produce?

**Detection:** More than 2 convergence alerts per day with no user action on any of them. User dismisses all convergence alerts without looking.

## Moderate Pitfalls

### Pitfall 5: CLI Package Distribution Complexity in Monorepo

**What goes wrong:** The CLI is built as `packages/cli` in the monorepo but needs to be invocable as `mc` from any terminal. The bin field in package.json points to a compiled `.js` file that doesn't exist until `pnpm build`. The shebang line (`#!/usr/bin/env node`) is missing or gets stripped. The CLI imports from `@mission-control/shared` but the workspace link breaks when installed globally. The user runs `pnpm install` in the monorepo, expects `mc` to be on their PATH, and it isn't.

**Why it happens:** TypeScript + ESM + pnpm workspaces + global CLI usage is a notoriously tricky combination. The MCP package already solved this for `mc-mcp` (using tsup bundling), but the CLI has additional complexity: it needs to be symlinked to PATH, it imports shared schemas, and it needs to work outside the monorepo context.

**Consequences:** User can't type `mc capture "thought"` from terminal. Falls back to curl commands. CLI is abandoned before it's adopted.

**Prevention:**
- **Follow the MCP package pattern exactly.** tsup builds a standalone bundle (no workspace imports at runtime). The `bin` field points to `./dist/index.js`. This pattern is proven in this codebase.
- **Bundle shared schemas into CLI dist.** Use tsup's `noExternal` option to inline `@mission-control/shared` into the CLI bundle. Zero runtime dependency on workspace structure.
- **Add shebang via tsup banner option.** `banner: { js: '#!/usr/bin/env node' }` ensures the compiled output is directly executable.
- **Provide a simple install script.** `ln -sf $(pwd)/packages/cli/dist/index.js /usr/local/bin/mc` in the project root. Don't rely on `pnpm install -g`.
- **Test from outside the monorepo.** CI should verify `mc capture "test"` works from `/tmp/`, not just from the monorepo root.
- **Offline queuing from day 1.** The CLI must work when the API is unreachable (Mac Mini sleeping, off Tailscale). Queue captures to a local file (`~/.mc/queue.jsonl`) and flush when API responds.

**Detection:** `which mc` returns nothing after monorepo install. `mc capture "test"` fails with "Cannot find module @mission-control/shared."

### Pitfall 6: Discovery Database Schema Conflicts with Existing Projects Table

**What goes wrong:** Discovered repos need somewhere to live before the user decides to track them. If they go into the existing `projects` table, they pollute the departure board, health findings, and every query that touches projects. If they go into a separate `discoveries` table, you end up with duplicated schema and queries, and promoting a discovery to a tracked project requires moving data between tables.

**Why it happens:** The projects table is the core entity. Every feature depends on it (captures, health, sessions, copies, commits). Discovered repos are speculative -- they haven't been vetted. Mixing speculative and vetted data in the same table creates confusion everywhere.

**Consequences:** If shared table: unvetted repos appear in departure board, health checks run on repos you don't care about, session resolution matches against stale experiments. If separate table: code duplication, promotion logic is complex, and you need to handle "what if the user already has this repo in projects?"

**Prevention:**
- **Separate `discoveries` table.** Lightweight schema: slug, name, path, host, remote_url, discovered_at, status (pending/tracked/dismissed), star_count, last_commit_date. This is NOT a project -- it's a candidate.
- **Promotion copies data, not moves.** When user clicks "Track," create a new entry in `mc.config.json` and the `projects` table. The discovery record status changes to `tracked`. No data migration.
- **Dedup on remote URL.** Normalize remote URLs (existing `normalizeRemoteUrl` function) and check against both existing projects and discoveries before inserting. A discovery for `github.com/user/repo` should not appear if that repo is already tracked.
- **Discovery does NOT trigger health checks, session resolution, or scan cache.** Keep discovery reads completely isolated from the main project pipeline.

**Detection:** Departure board suddenly has 30 repos. Health findings fire for repos the user never configured.

### Pitfall 7: GitHub Star Categorization AI Costs and Latency

**What goes wrong:** Every starred repo gets sent to Gemini for AI categorization (reference/try/tool/inspiration). With 500+ stars, that's 500 AI calls. Each call costs ~$0.001 with Gemini Flash and takes 200-500ms. Total: ~$0.50 and 2-4 minutes of serial processing. If done in the scan cycle, everything blocks. If done in bulk on first sync, the user waits minutes for the dashboard to populate.

**Why it happens:** The existing capture categorization is one-at-a-time (user creates a capture, AI categorizes it). Stars are different -- they come in bulk (hundreds on first sync). The same "fire-and-forget" pattern doesn't scale.

**Consequences:** Dashboard shows "categorizing..." for minutes. AI quota is burned on old stars the user doesn't care about. First-run experience is slow.

**Prevention:**
- **Categorize on-demand, not in bulk.** Show stars uncategorized by default with a "categorize" button per star or batch. Let the user decide what's worth AI analysis.
- **Batch categorization with rate limiting.** If auto-categorizing, process 10 stars per minute max. Use the enrichment queue pattern from captures (persist first, enrich later).
- **Local heuristics first, AI second.** Infer intent from repo metadata: README keywords, topics/tags, language, star count, last update date. "reference" = star count > 10K. "tool" = has `bin` in package.json. "try" = recently created. Only send ambiguous cases to AI.
- **Cache categorization permanently.** A star's category doesn't change. Store the intent once, never re-categorize.
- **Paginate the dashboard.** Don't render 500 stars at once. Show top 20 with "load more."

**Detection:** First star sync takes > 1 minute. Gemini rate limit errors appear in logs. Dashboard shows loading spinner for star section indefinitely.

### Pitfall 8: Filesystem Walking Hits Symlinks and Loops

**What goes wrong:** The discovery engine walks `~/` looking for `.git` directories and follows a symlink that points to `/`, creating an infinite loop. Or it follows `node_modules/.cache` symlinks that point to deeply nested structures. Node.js `fs.readdirSync({ recursive: true })` follows symlinks by default and doesn't detect cycles.

**Why it happens:** macOS home directories are full of symlinks. Homebrew creates them in `~/.local`. Go modules create them. Docker Desktop creates them in `~/Library/Containers`. `node_modules` at `~/node_modules` (yes, this exists on this machine) contains tens of thousands of entries.

**Consequences:** Discovery scan hangs. Memory usage spikes as the directory walker enqueues hundreds of thousands of paths. Node.js OOM crash. The entire API process dies.

**Prevention:**
- **Depth-1 scan only for home directory.** `fs.readdirSync('~/', { withFileTypes: true })` and check each immediate child for `.git/`. Never recurse into children. This is fast (microseconds for 80 entries) and safe.
- **Explicit `!entry.isSymbolicLink()` check.** Skip all symlinks during discovery. Real projects are real directories, not symlinks.
- **Timeout per directory.** If `readdirSync` on any single directory takes > 1 second (e.g., network mount), skip it.
- **Separate timer from API event loop.** Run discovery in a worker thread or with `setImmediate` breaks to avoid blocking the Hono request handler.
- **For Mac Mini SSH discovery:** `ls -1d ~/*/` with timeout, not `find`. List immediate children only.

**Detection:** Discovery scan takes > 5 seconds. API stops responding during discovery. Node.js memory usage spikes above 500MB.

### Pitfall 9: CLI Authentication and API URL Configuration

**What goes wrong:** The CLI is installed on the MacBook but the API runs on Mac Mini (100.123.8.125:3000). The user types `mc capture "thought"` and it tries to connect to `localhost:3000`, which either fails or hits a different service. There's no obvious way to configure the API URL. The user has to set an environment variable or create a config file before the CLI works at all.

**Why it happens:** The dashboard's API URL is set at build time in Vite config. The MCP server reads from stdin (no HTTP needed). The CLI is the first client that needs runtime API URL configuration from outside the monorepo.

**Consequences:** First-use experience is broken. User types `mc capture "idea"` and gets "Connection refused." Gives up immediately.

**Prevention:**
- **Config file at `~/.mc/config.json`** with `{ "apiUrl": "http://100.123.8.125:3000" }`. Created by `mc init` command.
- **Environment variable override:** `MC_API_URL=http://100.123.8.125:3000 mc capture "thought"`.
- **Smart default:** Try Tailscale IP first (check if `100.123.8.125:3000` responds), fall back to `localhost:3000`. This handles both on-Tailscale and local-dev scenarios.
- **`mc init` interactive setup.** Ask for API URL, test connectivity, write config file. One-time setup, zero friction after.
- **Offline queue with deferred delivery.** If API is unreachable, save to `~/.mc/queue.jsonl`. On next successful `mc` command, flush the queue. Captures are never lost.

**Detection:** `mc capture "test"` returns error on fresh install. No `~/.mc/config.json` exists.

## Minor Pitfalls

### Pitfall 10: Discovery Scan Timing vs. Project Scan Race Condition

**What goes wrong:** A discovery scan finds a repo. The user promotes it to tracked. The next project scan hasn't run yet, so the project has no scan data, no commits, no health. The project card shows empty for up to 5 minutes.

**Prevention:**
- Trigger an immediate single-project scan when a discovery is promoted to tracked.
- Return the new project record immediately from the promote endpoint, even without scan data.
- Dashboard shows "Scanning..." state for new projects, not empty/error.

### Pitfall 11: Star Intent Categories Don't Match User's Mental Model

**What goes wrong:** The AI categorizes a repo as "reference" but the user starred it to "try later." The categorization feels wrong, and incorrect categories are worse than no categories. The user stops trusting the feature.

**Prevention:**
- Let the user override AI categories with one click. The override is permanent.
- Start with simple categories: "reference" (read the code), "try" (use it), "tool" (daily use), "inspiration" (design/UX). Keep it to 4-5 max.
- Show confidence score. Low-confidence categorizations should be visually flagged as "suggested."
- Pre-populate from repo topics/tags when available, reducing reliance on AI.

### Pitfall 12: Session Replay Timeline Overscopes the Feature

**What goes wrong:** "Session replay" sounds cool but is actually showing a timeline of what files a session touched and when. The implementation spirals into building a full audit trail: storing every file mutation timestamp, rendering a Gantt-chart-like visualization, linking to git diffs per file per session. This is a major feature that delays the entire milestone.

**Prevention:**
- Define "replay" minimally: a list of files touched, in chronological order, with the session's start/end time. That's it.
- Use existing data: `filesJson` array from sessions table + `startedAt` / `endedAt`. No new data collection needed.
- Render as a simple vertical timeline (like "Previously on..."), not a complex visualization.
- Defer interactive replay (click to see diff) to a future milestone.

### Pitfall 13: Piped Input Edge Cases in CLI

**What goes wrong:** `echo "thought" | mc capture` seems simple but has edge cases. What about `cat file.md | mc capture`? What about stdin from a heredoc? What about binary input? What about empty stdin (the user just types `mc capture` without arguments or pipe)?

**Prevention:**
- Check `process.stdin.isTTY` to detect piped input vs. interactive terminal.
- If TTY (no pipe) and no positional argument: show help, don't hang waiting for stdin.
- If piped: read stdin with a size limit (64KB max). Reject binary input (check for null bytes).
- If both pipe and argument: argument wins, ignore stdin. Don't try to concatenate.
- Timeout on stdin read: 5 seconds max. If no data arrives, abort cleanly.

### Pitfall 14: Discovery Promotion Doesn't Update mc.config.json

**What goes wrong:** User promotes a discovered repo to "tracked." The database is updated, the project appears in the dashboard. But `mc.config.json` isn't updated. On next API restart, the project disappears because `mc.config.json` is the source of truth for the scan cycle.

**Prevention:**
- Promotion MUST write to `mc.config.json`. The config file is the canonical project registry.
- Use `JSON.stringify(config, null, 2)` with proper formatting.
- Read-modify-write with a file lock or atomic write (write to tmp file, then rename).
- Emit `scan:configChanged` event after config write to trigger an immediate scan.
- Test: promote a repo, restart the API, verify the project persists.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Discovery engine | Noise overwhelms dashboard (Pitfall 1) | Depth-1 scan, hard-coded exclusions, dedup against config |
| Discovery engine | Symlink loops crash process (Pitfall 8) | Skip symlinks, depth-1 only, timeout per directory |
| Discovery engine | SSH blocks main scan (Pitfall 3) | Separate timer, aggressive SSH timeout, non-fatal failure |
| Discovery schema | Pollutes projects table (Pitfall 6) | Separate discoveries table, promotion copies data |
| Discovery promotion | Config not updated (Pitfall 14) | Write to mc.config.json on promote, atomic write |
| GitHub stars | Rate limit exhaustion (Pitfall 2) | Separate sync timer, incremental sync, ETag caching |
| GitHub stars | AI categorization cost/latency (Pitfall 7) | On-demand categorization, local heuristics first |
| Star categories | Don't match mental model (Pitfall 11) | User override, confidence scores, limit to 4-5 categories |
| Session convergence | False positives (Pitfall 4) | Require file overlap, time window, passive display |
| Session replay | Feature overscope (Pitfall 12) | Define minimally: file list + timestamps, use existing data |
| CLI distribution | Monorepo bin issues (Pitfall 5) | Follow MCP pattern: tsup bundle, shebang, symlink |
| CLI configuration | API URL not configured (Pitfall 9) | `~/.mc/config.json`, `mc init`, smart default, offline queue |
| CLI input | Piped edge cases (Pitfall 13) | TTY detection, size limits, timeout on stdin |
| Scan timing | Discovery-to-track race (Pitfall 10) | Immediate single-project scan on promotion |

## Integration Pitfalls (Cross-Feature)

### GitHub Stars + Discovery Overlap
Stars from GitHub and discovered local repos may represent the same project (you starred a repo and also cloned it). Dedup on remote URL normalization -- the existing `normalizeRemoteUrl` function handles this.

### CLI + Session Tracking
The CLI should NOT create sessions. It's a capture/query tool, not a coding session. If the CLI hits the `/hook/start` endpoint by mistake, it pollutes session data. Keep CLI routes separate from hook routes.

### Discovery + Health Engine
Discovered-but-not-tracked repos must NOT trigger health checks. The health engine iterates `mc.config.json` projects. As long as discovery stays in its own table and doesn't touch the config until promotion, this is fine. But if someone adds a shortcut that auto-promotes discoveries, health checks start running on unwanted repos.

### Star Sync + Existing GitHub Project Scans
Both use the `gh api` command and share the same 5,000/hour rate limit. Track cumulative API usage across all features in a single counter. Don't let star sync and project scan run concurrently.

## Sources

- [GitHub REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) -- 5,000 requests/hour authenticated, conditional requests free
- [GitHub REST API Best Practices](https://docs.github.com/rest/guides/best-practices-for-using-the-rest-api) -- ETags, pagination, conditional requests
- [GitHub Starring Endpoints](https://docs.github.com/en/rest/activity/starring) -- /user/starred, per_page max 100, starred_at header
- [GitHub API Pagination Guide (2026)](https://copyprogramming.com/howto/github-search-api-with-pagination) -- 400 page limit (40K stars max), cursor migration
- [gh api --paginate](https://cli.github.com/manual/gh_api) -- Built-in pagination for REST endpoints
- [SSH Timeout Troubleshooting](https://labex.io/tutorials/shell-troubleshooting-ssh-connection-timeouts-tips-and-strategies-400141) -- ConnectTimeout, ServerAliveInterval
- [Fastest Directory Crawler](https://dev.to/thecodrr/how-i-wrote-the-fastest-directory-crawler-ever-3p9c) -- Symlink handling, performance patterns
- [TypeScript CLI in pnpm Monorepo](https://webpro.nl/scraps/compiled-bin-in-typescript-monorepo) -- bin field, tsup, shebang issues
- [GitLive Real-time Conflict Detection](https://blog.git.live/gitlive-11.0-Real-time-merge-conflict-detection) -- Parallel session merge detection patterns
- [Claude Code Worktrees Guide](https://claudefa.st/blog/guide/development/worktree-guide) -- Parallel session isolation patterns
- Existing MC codebase: project-scanner.ts (SSH patterns, scan cycle), session-service.ts (convergence baseline), conflict-detector.ts (file overlap logic), config.ts (mc.config.json schema)
- Local filesystem analysis: 80+ directories in ~/, node_modules at ~/node_modules, symlinks throughout

---
*Researched: 2026-03-16*
