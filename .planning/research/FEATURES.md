# Feature Landscape

**Domain:** Auto-Discovery Engine, GitHub Star Intelligence, Session Enrichment, CLI Client
**Researched:** 2026-03-16
**Confidence:** MEDIUM-HIGH (auto-discovery and CLI are well-understood patterns; GitHub star categorization has clear precedents; session convergence is novel but builds on existing MC infrastructure)

## Table Stakes

Features users expect when these capabilities ship. Missing any and the feature area feels half-baked.

### Auto-Discovery Engine

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Walk local directories for `.git` repos | Without this, auto-discovery is manual. The entire point is "find what I forgot to register." | LOW | Existing `project-scanner.ts` scan loop | Walk `~/` with configurable root dirs and max depth (default 3). Skip `node_modules`, `.Trash`, `Library`. Yield `{ path, remoteUrl, lastCommitDate }`. Use `fs.opendir` with depth tracking, not a recursive library. |
| Diff discovered repos against `mc.config.json` | Must distinguish "new" from "already tracked." If it surfaces repos you already have, it's noise. | LOW | Config loader, discovery walker | Compare by path and normalized remote URL. Emit only repos NOT in config. |
| SSH discovery on Mac Mini | MC already SSH-scans Mac Mini repos. Discovery must cover both machines or it has a blind spot. | MEDIUM | Existing SSH batch script pattern in `project-scanner.ts` | Batch `find` command over SSH: `find /Users/ryanstern -maxdepth 3 -name .git -type d`. Parse results, run `git remote get-url origin` per repo. Batch into single SSH connection. |
| Dashboard discoveries section | Findings without UI are invisible. Must show discovered repos with track/dismiss actions. | MEDIUM | Discovery API endpoint, SSE events | Card per discovered repo: name (from directory), remote URL, last commit age, language guess (from file extensions). Actions: "Track" (adds to config + DB), "Dismiss" (remember to not show again). |
| Track action adds to config and DB | "Track" must persist. If dismissing or tracking doesn't stick, trust is broken immediately. | LOW | Config writer, `upsertProject` | Write to `mc.config.json` (append to projects array). Upsert into projects table. Trigger scan on next cycle. |
| Dismiss action persists | Must remember dismissed repos to avoid re-surfacing every scan. | LOW | New `dismissed_discoveries` table or JSON set | Store dismissed paths. Check on every discovery run. |

### GitHub Star Intelligence

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Fetch starred repos from GitHub API | No stars, no categorization. This is the data source. | LOW | `gh api` CLI (already used in project-scanner) | `gh api --paginate user/starred` returns full repo objects with description, topics, language, stargazers_count. Accept: `application/vnd.github.v3.star+json` header adds `starred_at` timestamp. Rate limit: 5000/hr authenticated, paginate at 100/page. |
| Persist stars in SQLite | Stars must survive restarts. Re-fetching from GitHub every time is wasteful and slow. | LOW | New `github_stars` table | Schema: `id`, `repoFullName`, `description`, `language`, `topics` (JSON), `starredAt`, `intent`, `intentConfidence`, `dismissed`, `trackedAsProject`, `lastSyncedAt`. |
| AI intent categorization | The differentiator. Stars without categories are just a list GitHub already shows. Categories: `reference` (read later), `tool` (use this), `try` (experiment), `inspiration` (design/architecture reference). | MEDIUM | Existing `ai-categorizer.ts` pattern, Gemini API | Batch categorize using repo description + topics + README snippet (first 500 chars via `gh api repos/{owner}/{repo}/readme --jq .content` base64 decode). Same persist-first-enrich-later pattern as captures. 4 categories is enough. More becomes analysis paralysis. |
| Dashboard stars/discoveries section | Must see and act on categorized stars. | MEDIUM | Stars API endpoint, SSE | Grouped by intent category. Each card: repo name, description, language badge, intent badge, starred date. Actions: re-categorize, track as project, dismiss. |
| Periodic sync (not just one-shot) | Stars added after initial sync must appear. | LOW | Background poll timer (existing pattern) | Sync every 6 hours (stars don't change fast). Use `starred_at` header to only fetch new stars since last sync. |

### Session Enrichment

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Convergence detection | v1.2 tracks sessions and detects file conflicts. The natural next question: "are these sessions done and ready to merge?" | HIGH | Existing session lifecycle, conflict detector, git health engine | Watch for: 2+ sessions on same project both reach `completed` status with commits since session start. Check git state: if both sessions committed to same branch, flag convergence. If different branches, suggest merge. Surface as convergence card in risk feed. |
| Session timeline visualization | Session panel shows live sessions but no history view. "What happened today?" needs a timeline. | MEDIUM | Existing sessions table with timestamps, sprint timeline UI pattern | Horizontal timeline (reuse sprint timeline visual language). Each session = colored bar (color by tier). X-axis = time of day. Y-axis = project rows. Show overlapping sessions visually. Click for session details. |
| MCP session tools | Claude Code sessions should be able to ask "what else is running on this project?" via MCP. Self-awareness. | LOW | Existing MCP server (`packages/mcp`), sessions API | Two new MCP tools: `session_status` (list active sessions, optionally filtered by project), `session_conflicts` (list active file conflicts). Thin wrappers around existing API endpoints. |
| Smart routing with historical learning | v1.2 routing is keyword-based. Learning from outcomes ("Opus sessions on refactor tasks complete faster") makes it actually useful. | HIGH | Existing tier routing, session history with outcomes | Track session outcome signals: duration, commit count, files touched count. Build simple heuristics (not ML): "refactor tasks on Opus average 12 min, on Sonnet average 28 min." Weight recent sessions higher. Store routing feedback in session metadata. |

### CLI Client

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| `mc capture "thought"` | The core promise. Capture from terminal without opening a browser or leaving your session. | LOW | Existing `POST /captures` API endpoint | Single HTTP POST to MC API. Auto-detect project from `$PWD` matching against config paths (same logic as session project resolution). Print capture ID on success. |
| Piped input: `echo "idea" \| mc capture` | Unix philosophy. If it doesn't accept stdin, power users will be annoyed. | LOW | stdin detection via `process.stdin.isTTY` | If stdin is not a TTY, read from stdin. If both stdin and arg provided, concatenate (arg is prefix/context). |
| `mc status` / `mc projects` | Quick status check without opening dashboard. "What's active? What's stale?" | LOW | Existing `GET /projects` API endpoint | Tabular output: project name, status (active/idle/stale), last commit age, health dot equivalent (unicode checkmark/warning/x). Color-coded via chalk/picocolors. |
| `mc search "query"` | Search captures and projects from terminal. | LOW | Existing `GET /search` API endpoint | Print results with type badge (capture/project/commit), snippet, and age. |
| Offline queue with sync | MC API might be unreachable (Mac Mini down, network issue). Captures must not be lost. | MEDIUM | Local file queue (`~/.mc/queue.json`), retry logic | Write to local queue file when API returns error or times out. `mc sync` command flushes queue. Auto-flush on next successful `mc capture`. Warn user: "Queued locally (MC unreachable). Run `mc sync` when available." |
| Shell completion | Tab completion for commands and project names. | LOW | Commander.js built-in completion support | Generate completion scripts for bash/zsh/fish. `mc --completion` outputs the script. |

## Differentiators

Features that set MC v1.3 apart. Not expected, but create genuine "wow" moments.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| GitHub org discovery | Discover repos across `quartermint` and `vanboompow` orgs, not just stars. Find repos you forgot about. | LOW | `gh api orgs/{org}/repos --paginate` | Already have org names. Paginate, compare against config, surface untracked repos alongside filesystem discoveries. |
| Star intent as project signal | When you star a tool repo and later `git clone` it locally, MC auto-links the star to the discovered project. "You starred this 3 weeks ago as 'tool' -- now it's cloned locally." | MEDIUM | Discovery engine + star DB + remote URL matching | Match star `repoFullName` against discovered repo remote URLs. Surface connection in discovery cards. |
| `mc capture` with project override | `mc capture -p openefb "MapLibre layer ordering bug"` -- force categorization without waiting for AI. | LOW | CLI flag parsing, `createCaptureSchema.projectId` | Map `-p` slug to project, set `projectId` directly. Skip AI categorization for this capture. |
| Session convergence with merge preview | Beyond "these sessions are done" -- show what would happen if you merged. File overlap count, conflict risk score. | HIGH | Convergence detection + git merge-base analysis | Run `git merge-base` and `git diff --stat` between session endpoints. Show: "3 files changed in both, 2 likely conflicts." |
| CLI capture with context injection | `mc capture` auto-includes git branch, recent commit hash, and active session ID as metadata. When you capture "this approach isn't working," MC knows exactly what "this" means. | LOW | git CLI, session API lookup | Capture metadata: `{ branch, lastCommit, sessionId, cwd }`. Enriches the capture for future context restoration. |
| Discovery watchdog (fsevents) | Instead of periodic scanning, watch filesystem for new `.git` directories in real-time. | MEDIUM | macOS FSEvents API via `chokidar` or native `fs.watch` | Watch root dirs for `.git` creation events. Immediate discovery instead of waiting for next scan cycle. More responsive but adds a persistent watcher process. |

## Anti-Features

Features to explicitly NOT build. Each has been considered and rejected.

| Anti-Feature | Why Someone Might Want It | Why Avoid | What to Do Instead |
|--------------|---------------------------|-----------|-------------------|
| Automatic project tracking from discovery | "Just add every discovered repo to MC" | Noise. 50+ repos in `~/` that are clones, experiments, tutorials. Manual approval preserves signal quality. MC is curated, not a complete index. | Show discoveries, require explicit "Track" action. Dismissed repos stay dismissed. |
| Star rating/scoring system | "Rank my stars by quality or relevance" | Over-engineering. GitHub already shows stargazers_count. Adding a personal scoring layer creates maintenance burden and decision fatigue. | Intent categories (reference/tool/try/inspiration) are sufficient. 4 buckets, not a spectrum. |
| Full README rendering in star cards | "Show me the full README for each star" | READMEs are 1-50KB each. Fetching and rendering 200+ READMEs bloats the dashboard and slows page load. | Show first 2 lines of description. Link to GitHub for full README. Use README snippet only for AI categorization (server-side). |
| CLI interactive mode / REPL | "mc shell" that stays open for multiple commands | Adds complexity for marginal value. Each CLI invocation is fast (<200ms). A REPL implies state management, connection pooling, and prompt rendering. | Keep CLI stateless. Each command is a single HTTP request. Fast startup, fast exit. |
| Auto-merge from convergence detection | "MC should merge the branches for me" | MC observes, it does not act. Auto-merging could destroy work, create merge conflicts silently, or merge incomplete work. The "awareness not action" principle is core to MC's design. | Surface convergence cards with merge preview. User runs `git merge` themselves. |
| CLI dashboard (TUI) | "Terminal UI with real-time updating panels" | Significant engineering effort for a niche use case. The web dashboard already exists and is the primary UI. A TUI duplicates rendering logic in a worse medium. | CLI for quick queries and capture. Dashboard for visual overview. Don't compete with yourself. |
| Star import from other platforms | "Import my Pocket/Raindrop/bookmarks into stars" | Scope creep. MC stars are GitHub-specific with repo metadata. Bookmarks are a different data type with different metadata. Mixing them muddies the intent categorization. | Stars are GitHub stars only. General bookmarks are captures (paste a URL into `mc capture`). |
| Discovery scan of arbitrary remote machines | "Scan my VPS, my work laptop, etc." | Each new machine adds SSH config, auth complexity, and failure modes. Mac Mini is special because it's the hosting machine with Tailscale access. | Discovery scans local machine + Mac Mini only. Other machines are out of scope for v1.3. |
| Smart routing that auto-restricts model choice | "Block Opus when budget is high" | MC informs, it does not restrict. Blocking a model tier removes user agency and creates frustration when the user knows better than the heuristic. | Recommend and display rationale. Never block or restrict. User always has final say. |

## Feature Dependencies

```
[Discovery Engine]
    |-- requires --> [Filesystem walker (local + SSH)]
    |-- requires --> [Config diffing (path + remote URL matching)]
    |-- requires --> [dismissed_discoveries persistence]
    |-- enables  --> [Dashboard discoveries section]
    |                    |-- requires --> [Discovery API endpoints]
    |                    |-- requires --> [SSE discovery events]
    |
    |-- enhances --> [GitHub Star Intelligence]
                         |-- link via remote URL matching

[GitHub Star Intelligence]
    |-- requires --> [gh api user/starred pagination]
    |-- requires --> [github_stars table]
    |-- requires --> [AI intent categorization]
    |                    |-- reuses --> [ai-categorizer.ts pattern]
    |                    |-- reuses --> [Gemini structured output]
    |
    |-- enables  --> [Dashboard stars section]
    |-- enhances --> [Discovery engine] (star -> clone linking)

[Session Enrichment]
    |-- requires --> [Existing session lifecycle (v1.2)] -- ALREADY BUILT
    |-- requires --> [Existing conflict detector (v1.2)] -- ALREADY BUILT
    |
    |-- Convergence Detection
    |       |-- requires --> [Session history with commit tracking]
    |       |-- requires --> [Git health engine post-scan data]
    |       |-- requires --> [project_health table] (reuse for findings)
    |
    |-- Session Timeline
    |       |-- requires --> [Sessions table timestamp data]
    |       |-- reuses  --> [Sprint timeline visual pattern]
    |
    |-- MCP Session Tools
    |       |-- requires --> [MCP server (v1.1)] -- ALREADY BUILT
    |       |-- requires --> [Sessions API] -- ALREADY BUILT
    |
    |-- Smart Routing Learning
            |-- requires --> [Session history with outcomes]
            |-- requires --> [Existing tier routing (v1.2)] -- ALREADY BUILT

[CLI Client]
    |-- requires --> [MC API (all existing endpoints)] -- ALREADY BUILT
    |-- requires --> [Commander.js + fetch/undici]
    |-- requires --> [Offline queue (~/.mc/queue.json)]
    |
    |-- mc capture
    |       |-- calls --> POST /captures
    |       |-- reuses --> project resolution from cwd
    |
    |-- mc status / mc projects
    |       |-- calls --> GET /projects
    |
    |-- mc search
    |       |-- calls --> GET /search
    |
    |-- mc sync
            |-- flushes --> offline queue to API
```

### Key Dependency Insights

- **CLI is fully independent.** It consumes existing API endpoints. Can ship in any phase without blocking or being blocked by other features.
- **Discovery and Stars are loosely coupled.** They can build independently but enhance each other when both exist (remote URL matching links stars to cloned repos).
- **Session enrichment builds on v1.2 foundation.** All four session features require the sessions table and lifecycle tracking already shipped. No new tables needed for MCP tools or timeline -- just new API surface and UI.
- **Convergence detection is the riskiest feature.** It requires reliable "session X produced commits Y" tracking, which means associating commits with sessions by timestamp window. This is heuristic, not deterministic.

## MVP Recommendation

### Phase 1: Build first, ship value immediately

1. **CLI Client** (LOW complexity, immediate value) -- Capture and query from terminal. This is the fastest path to daily habit change. Every `mc capture` from a Claude Code session proves the concept.
2. **Discovery Engine - Local filesystem** (LOW-MEDIUM complexity) -- Walk local dirs, diff against config, surface in dashboard. Skip Mac Mini SSH discovery initially.
3. **MCP Session Tools** (LOW complexity) -- Two new tools wrapping existing endpoints. Smallest delta for meaningful self-awareness in Claude Code sessions.

### Phase 2: Enrich what Phase 1 surfaced

4. **GitHub Star Intelligence** -- Fetch, persist, categorize. Adds a new data stream to the dashboard.
5. **Discovery Engine - SSH + GitHub orgs** -- Extend discovery to Mac Mini and org repos. Complete the picture.
6. **Session Timeline** -- Visual history of sessions alongside sprint timeline.

### Phase 3: Deeper intelligence

7. **Convergence Detection** -- Complex, heuristic, needs real session data to validate. Ship after session tracking has accumulated history.
8. **Smart Routing with Learning** -- Needs months of session outcome data. Defer until there's enough signal.

### Defer Entirely

- **Discovery watchdog (fsevents)** -- Premature optimization. Periodic scanning is fine until discovery volume proves otherwise.
- **Session convergence merge preview** -- Deferred because convergence detection itself is already HIGH complexity.

## Sources

- [GitHub REST API - Starring](https://docs.github.com/en/rest/activity/starring) -- HIGH confidence. Pagination via page/per_page (max 100). Star timestamp via Accept header `application/vnd.github.v3.star+json`.
- [GitHub REST API - Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) -- HIGH confidence. 5000 requests/hr authenticated, 60/hr unauthenticated.
- [gh repo list](https://cli.github.com/manual/gh_repo_list) -- HIGH confidence. Supports `--json` flag with description, languages, topics fields.
- [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) -- MEDIUM confidence. Reference for AI-powered star categorization with semantic search.
- [Astral](https://astralapp.com/) -- MEDIUM confidence. Reference for tag-based star organization. Validates that categorization is the core value.
- [StarDaddy](https://github.com/donanroherty/StarDaddy) -- MEDIUM confidence. Chrome extension for star categorization. Validates user-defined labels approach.
- [Categorize GitHub Stars using OpenAI](https://gist.github.com/webpolis/e9be80fd68b1754d5869a1a71d48056b) -- MEDIUM confidence. Validates using LLM with repo description + topics for categorization.
- [node-git-repos](https://github.com/IonicaBizau/node-git-repos) -- LOW confidence. Reference for recursive .git directory finding. MC should implement its own walker for control over depth/exclusions.
- [Snip CLI notes](https://snip-notes.vercel.app/) -- LOW confidence. Reference for fast CLI capture tool design.
- [nb (command line notes)](https://xwmx.github.io/nb/) -- MEDIUM confidence. Reference for CLI note-taking with sync capabilities. Validates offline queue pattern.
- [Commander.js](https://www.npmjs.com/package/commander) -- HIGH confidence. ~35M weekly downloads, minimal API, good TypeScript support. Recommended for CLI framework.
- [Building CLI apps with TypeScript in 2026](https://hackers.pub/@hongminhee/2026/typescript-cli-2026) -- MEDIUM confidence. Validates Commander.js + esbuild approach for TypeScript CLIs.
- MC codebase analysis (project-scanner.ts, session-service.ts, conflict-detector.ts, schema.ts) -- HIGH confidence. Direct code review of existing infrastructure.

---
*Feature research for: v1.3 Auto-Discovery + Session Enrichment + CLI*
*Researched: 2026-03-16*
