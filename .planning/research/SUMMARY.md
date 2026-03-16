# Project Research Summary

**Project:** Mission Control v1.3 — Auto-Discovery + GitHub Star Intelligence + Session Enrichment + CLI
**Domain:** Personal operating environment extensions — repo discovery, curated star management, session intelligence, terminal client
**Researched:** 2026-03-16
**Confidence:** HIGH

## Executive Summary

Mission Control v1.3 extends an already mature stack (32K LOC, 462 tests, Hono/SQLite/React) with four orthogonal capability areas that all share a single integration strategy: extend existing patterns rather than introduce new ones. The codebase has proven primitives for everything needed — the `project-scanner.ts` SSH pattern, `ai-categorizer.ts` structured output, `event-bus.ts` SSE pipeline, and persist-first-enrich-later capture flow — and v1.3 reuses all of them. The only net-new npm dependency is `commander` for the CLI package. Everything else builds on what exists.

The recommended approach is to layer in capabilities sequentially, starting with a data foundation (new DB tables + config schema), then backend services in dependency order (discovery engine, star service, session enrichment), then dashboard UI, with the CLI in parallel with the UI since it has no frontend dependencies. The architecture researcher's 6-phase build order maps directly onto a v1.3 milestone structure and should be adopted as-is. The CLI is the fastest path to daily habit change and could be parallelized with the dashboard phase — it only calls existing API endpoints, so there are zero backend changes needed.

The dominant risks are operational rather than technical. Discovery noise (surfacing 80+ repos when only 5 are signal) can kill the feature on day one. GitHub API rate limit exhaustion can degrade existing project health checks, not just new star sync. SSH-based Mac Mini discovery must run on a completely separate timer from the 5-minute project scan or the dashboard goes stale. Convergence detection needs a high false-positive bar — a passive "merge candidate badge" rather than an alert card. All four risks are well-understood and have concrete mitigations documented in PITFALLS.md.

## Key Findings

### Recommended Stack

The stack is essentially frozen from v1.0-v1.2. Only one new production dependency is needed: `commander@^13.1.0` for the CLI package. All other capabilities — filesystem walking, SSH discovery, GitHub API calls, AI categorization, offline queue — use Node.js built-ins, the existing `gh` CLI via `execFile`, and the existing Vercel AI SDK. The CLI ships as `packages/cli` using the same `tsup` bundling pattern as the existing MCP package, which is proven to work for bin-field CLIs in this monorepo.

**Core technologies:**
- `commander@^13.1.0`: CLI argument parsing and subcommand routing — de facto Node.js standard, 500M+ weekly downloads, ESM-native, zero setup overhead for a 3-command CLI
- `Node.js fs.opendir` (native, Node 22.22.0 confirmed): Bounded filesystem walk for repo discovery — no fast-glob needed, depth-limited to avoid node_modules/Library noise
- `gh api --paginate` (existing `execFile` pattern): GitHub star fetching — handles auth, pagination, and rate headers natively without Octokit
- `tsup` (existing): CLI bundling — same pattern as MCP package; bundles `@mission-control/shared` via `noExternal`, adds shebang via `banner` option
- `@ai-sdk/google` + Gemini (existing): Star intent categorization — same `generateText + Output.object` pattern as capture categorization

**What NOT to add:** @octokit/rest (15+ transitive deps, `gh` already handles it), fast-glob (wrong tool for depth-limited walks), chokidar (periodic timers are sufficient), chalk (Node.js has `util.styleText` since v21.7+), inquirer (CLI is non-interactive by design).

### Expected Features

**Must have (table stakes):**
- Local filesystem repo discovery with track/dismiss actions — without this, auto-discovery is manual entry with extra steps
- Discovery diff against `mc.config.json` — surfacing already-tracked repos defeats the purpose
- Dismiss is permanent — repos dismissed must never re-surface; trust is broken otherwise
- GitHub star persistence with AI intent categorization (reference/try/tool/inspiration) — stars without categories are a list GitHub already shows
- Periodic star sync — stars added after initial sync must appear automatically
- `mc capture "thought"` from terminal — the core CLI promise; must work offline with local queue
- `mc status` / `mc projects` — quick project status without opening browser
- MCP session tools (session_status, session_conflicts) — self-awareness for active Claude Code sessions

**Should have (differentiators):**
- SSH-based Mac Mini repo discovery — MC spans two machines; blind spots undermine the feature
- GitHub org repo listing (quartermint, vanboompow) — finds repos not on disk at all
- Star-to-project linking via remote URL matching — connects starred repos to locally cloned projects
- `mc capture` auto-injects git branch + commit + session ID as metadata — captures know what "this" means
- Session timeline visualization — "what happened today?" needs a visual history (scoped minimally: file list + timestamps)
- Session convergence detection (passive, badge only) — signals when parallel sessions are done; high false-positive bar required
- Shell completion for `mc` commands — reduces tab friction

**Defer to v2+:**
- Smart routing with historical learning — needs months of session outcome data before signal is meaningful
- Discovery watchdog via fsevents — periodic scanning is fine until discovery volume proves otherwise
- Session convergence merge preview — convergence detection itself is already high complexity
- Full README rendering in star cards — fetching 200+ READMEs bloats dashboard; link to GitHub instead

**Explicit anti-features (never build):**
- Auto-track all discovered repos — noise defeats curation; always require explicit Track action
- Auto-merge from convergence detection — MC observes, it does not act
- CLI REPL / TUI — dashboard already exists; don't compete with yourself
- Star import from non-GitHub platforms — different data type, muddies intent categorization

### Architecture Approach

All four feature areas integrate by extending established MC patterns: new services hook into the scan-persist-emit pipeline, new routes register via factory functions in `app.ts`, and the dashboard consumes everything through the same SSE + fetchCounter mechanism. The data architecture keeps discovered repos strictly separate from tracked projects (separate `discoveries` table; promotion copies to `mc.config.json` + `projects` table), which prevents the departure board from being polluted with speculative repos and keeps health checks isolated from unvetted data.

**Major components:**
1. **Discovery Engine** (`services/discovery-engine.ts`) — depth-1 filesystem walk (local + SSH), GitHub org listing, diff against config, emits `discovery:found` events; runs on its own timer, never inside the 5-minute project scan
2. **Star Service** (`services/star-service.ts`) — `gh api --paginate user/starred`, persist immediately, async Gemini categorization, hourly sync timer; never runs concurrently with project scan
3. **Convergence Detector** (`services/convergence-detector.ts`) — cross-references completed sessions with file overlap and commit windows; surfaces passive badge on project card only
4. **CLI Package** (`packages/cli`) — Commander.js entry, plain `fetch()` to API (no Hono RPC to avoid bundling API deps), offline queue at `~/.mc/queue.jsonl`, `mc init` for first-run setup
5. **Discovery Routes** (`routes/discoveries.ts`) — list/promote/dismiss/scan; atomic `mc.config.json` write on promote (tmp-file + rename)
6. **Star Routes** (`routes/stars.ts`) — list/sync/update endpoints with user intent override
7. **New DB tables** — `discoveries` (path, host, status, remote_url, UNIQUE(path, host)) and `stars` (github_id UNIQUE, full_name, intent, ai_confidence, topics as JSON text)

**What does NOT change:** SSE streaming mechanism, capture pipeline, FTS5 search, health engine, existing session lifecycle, budget tracking, LM Studio probe, Tailwind theme, Hono RPC client pattern.

### Critical Pitfalls

1. **Discovery noise overwhelms the dashboard** — Depth-1 scan only (immediate children of configured roots), hard-coded exclusion list (Library, node_modules, .cargo, .local, Applications, etc.), require minimum 1 commit, permanent dismiss persisted in DB. Detection: >20 items on first scan.

2. **GitHub API rate limit exhaustion degrades existing project scans** — Decouple star sync from the 5-minute project scan cycle (hourly instead), incremental sync using `starred_at` timestamps, check `gh api rate_limit` before sync, never run star sync and project scan concurrently. Detection: health findings go stale for GitHub-hosted projects.

3. **SSH discovery timeouts block the main scan** — Discovery must run on its own separate timer, never within the 5-minute project scan. SSH timeout: 3 seconds connect + 10 seconds command. SSH failure is non-fatal (show "last scanned 2h ago"). Detection: project cards show stale data >10 minutes.

4. **Session convergence false positives cause alert fatigue** — Only fire when: (a) file sets overlap, (b) at least one session committed, (c) both sessions active within same 30-minute window. Surface as passive project card badge, not risk feed alert. Validate against existing v1.2 session records before shipping.

5. **CLI distribution fails in monorepo context** — Follow the MCP package pattern exactly: tsup with `noExternal` to bundle shared schemas, `banner: { js: '#!/usr/bin/env node' }` for shebang, symlink to `/usr/local/bin/mc`. Test from outside the monorepo at `/tmp/`. Provide `mc init` for first-run API URL configuration.

## Implications for Roadmap

The ARCHITECTURE.md build order is the correct phase structure. It respects data dependencies (schema before services), operational safety (discovery decoupled from project scan), and parallelism opportunities (CLI and dashboard UI can build concurrently). Adopt it as the v1.3 milestone structure.

### Phase 1: Data Foundation
**Rationale:** Both discovery engine and star service need schema and config before they can be built. Pure additions with zero risk of breaking existing functionality.
**Delivers:** `discoveries` table, `stars` table, Drizzle migrations, config schema extension (discovery paths, GitHub orgs, star settings), Zod schemas in shared package for new entities
**Addresses:** Pitfall 6 (separate discoveries table keeps projects table clean), Pitfall 2 (star sync interval in config)
**Research flag:** Not needed — pure Drizzle schema additions

### Phase 2: Auto-Discovery Engine (Local)
**Rationale:** Highest-value feature; surfaces unknown repos. Extends `project-scanner.ts` with a post-scan hook — the lightest possible integration point. Scoped to local filesystem only to keep failure modes simple.
**Delivers:** Depth-1 filesystem walker (local MacBook), discovery routes (list/promote/dismiss/trigger scan), event bus extension (`discovery:found`, `discovery:promoted`), atomic `mc.config.json` write on promote, immediate single-project scan on promotion
**Addresses:** Discovery table stakes (walk, diff, track/dismiss), Pitfall 1 (depth-1, exclusion list, permanent dismiss), Pitfall 8 (skip symlinks, no recursion)
**Research flag:** Not needed — patterns are established in `project-scanner.ts`

### Phase 3: Discovery Engine — SSH + GitHub Org Extension
**Rationale:** Extends Phase 2 with Mac Mini and GitHub org sources. Kept as a separate phase because SSH failure modes are distinct from local walking and safer to isolate.
**Delivers:** SSH-based Mac Mini repo discovery (depth-1, 10s timeout), GitHub org listing (`gh api orgs/{org}/repos`), cross-host dedup via `normalizeRemoteUrl`, stale marker for SSH failures
**Addresses:** Full discovery table stakes (multi-host), Pitfall 3 (SSH timeouts — separate timer, non-fatal failure)
**Research flag:** Not needed — reuses exact SSH infrastructure from `project-scanner.ts`

### Phase 4: GitHub Star Intelligence
**Rationale:** Independent of discovery (no code dependency), shares only the schema foundation. Star-to-project linking becomes available immediately since Phase 2-3 built discovery.
**Delivers:** Star service (gh API paginated fetch, persist-first, async Gemini categorization), star routes (list/sync/update), hourly background timer, rate limit guard before sync, user intent override
**Addresses:** Stars table stakes (fetch, persist, categorize, periodic sync), Pitfall 7 (on-demand categorization, local heuristics first), Pitfall 11 (confidence scores, user override, max 4 categories)
**Research flag:** Not needed — AI categorization pattern is identical to `ai-categorizer.ts`

### Phase 5: Session Enrichment
**Rationale:** Builds on the existing v1.2 session infrastructure. No schema changes needed. Convergence detector and MCP tools are the smallest possible delta.
**Delivers:** Convergence detector service (file overlap + time window requirement), convergence API endpoints (`/api/sessions/convergence`), MCP session tools (`session_status`, `session_conflicts`), session timeline data endpoint
**Addresses:** Session enrichment table stakes (convergence detection, MCP self-awareness), Pitfall 4 (false positive prevention — overlap required, passive display only)
**Avoids:** Smart routing with learning (needs months of outcome data — defer entirely), full session replay (scope to file list + timestamps from existing `filesJson` only)
**Research flag:** Convergence detection is novel — validate algorithm against existing v1.2 session records before committing to UI representation

### Phase 6: Dashboard — Discoveries + Stars + Session Timeline
**Rationale:** UI consumes all Phase 2-5 backend APIs. Build after all backend endpoints are stable to avoid building against in-flight interfaces.
**Delivers:** Discoveries section component (card per repo, track/dismiss actions), star browser (grouped by intent category), convergence badge on project cards, session timeline view (file list + timestamps, not Gantt chart), useSSE extensions for new event types
**Addresses:** Dashboard UI for all new features, Pitfall 1 (UI-level dedup + dismiss), Pitfall 12 (session replay scoped minimally)
**Research flag:** Not needed — follows existing component patterns (departure board, sprint timeline, risk feed)

### Phase 7: CLI Client
**Rationale:** Can be parallelized with Phase 6 — zero backend changes needed, fully independent. Listed last in linear view only for clarity.
**Delivers:** `packages/cli` scaffold, `mc capture` (with offline queue), `mc status`, `mc projects`, `mc search`, stdin/pipe support, `mc init` with smart API URL detection, `pnpm link` install script, shell completion
**Addresses:** CLI table stakes (capture, status, offline queue, piped input), Pitfall 5 (tsup bundle + shebang + symlink), Pitfall 9 (`mc init` + `~/.mc/config.json`), Pitfall 13 (TTY detection, size limits)
**Research flag:** Not needed — Commander.js is well-documented; follow MCP package tsup pattern exactly

### Phase Ordering Rationale

- Schema first because discovery engine and star service both write to new tables; shipping services without migrations is a deployment hazard
- Local discovery before SSH/GitHub extension to isolate failure modes — local walk is synchronous and safe; SSH introduces timeout and network failure modes
- Stars after discovery because they share the schema foundation and the star-to-project URL matching becomes immediately useful once discovery is live
- Session enrichment after discovery/stars because convergence detection is novel and benefits from shipping stable features first
- Dashboard after all backend APIs to avoid building against in-flight interfaces
- CLI in parallel with dashboard — zero backend changes needed, fully independent; parallelizing Phase 6 + 7 shortens the milestone

### Research Flags

Phases needing deeper research during planning:
- **Phase 5 (Session Enrichment):** Convergence detection is heuristic and novel. Run the algorithm against existing v1.2 session records before committing to a UI representation. False positive fatigue is the primary risk.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Data Foundation):** Pure Drizzle schema additions, no research needed
- **Phase 2 (Local Discovery):** Extends `project-scanner.ts` patterns directly
- **Phase 3 (SSH/GitHub Discovery):** Reuses existing SSH and `gh api execFile` patterns
- **Phase 4 (Star Intelligence):** Mirrors `ai-categorizer.ts` and capture persist-first flow exactly
- **Phase 6 (Dashboard):** Follows established component and useSSE patterns
- **Phase 7 (CLI):** Follow MCP package tsup pattern; Commander.js is well-documented

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 1 new dependency (commander). All other capabilities proven in existing codebase. Node.js 22.22.0 confirmed, `gh` v2.88.0 confirmed. |
| Features | MEDIUM-HIGH | CLI and discovery are well-understood. Star categorization has clear precedents (Astral, GithubStarsManager). Session convergence is novel but builds on proven session infrastructure. |
| Architecture | HIGH | Integration strategy verified against actual codebase files. No architectural leaps — all patterns have proven equivalents in the codebase. |
| Pitfalls | HIGH | Most pitfalls are operational (noise, rate limits, SSH timeouts) with concrete prevention strategies. Convergence false positives are the only truly novel risk. |

**Overall confidence:** HIGH

### Gaps to Address

- **Convergence detection algorithm accuracy:** Cannot be validated without running against real session data. Implement first, surface in UI only after validating false-positive rate is acceptable (target: <2 false alerts/day).
- **mc.config.json atomic write:** The promote-discovery flow must write to `mc.config.json` without corruption. Use tmp-file + rename (atomic write). Explicit test needed: promote a repo, SIGKILL mid-write, verify config integrity.
- **GitHub rate limit budget across features:** Star sync + project scan + org listing all share the 5,000/hr GitHub API budget. Need shared counter or sequential execution guarantee to prevent starvation of project health checks.
- **CLI first-run experience:** `mc init` should auto-detect the Mac Mini Tailscale IP (100.x.x.x) rather than requiring manual input. Offline queue needs clear user-visible feedback ("Queued locally. MC unreachable.").

## Sources

### Primary (HIGH confidence)
- Existing MC codebase (project-scanner.ts, ai-categorizer.ts, session-service.ts, conflict-detector.ts, schema.ts, mcp/index.ts, event-bus.ts, app.ts) — direct code review, integration patterns verified
- [GitHub REST API — Starring endpoints](https://docs.github.com/en/rest/activity/starring) — `user/starred` with `star+json` media type, `starred_at` timestamp header
- [GitHub REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) — 5,000/hr authenticated, conditional requests (ETag) are free
- [gh api manual](https://cli.github.com/manual/gh_api) — `--paginate`, `--slurp`, `--jq` flags; confirmed v2.88.0 installed
- [Commander.js GitHub](https://github.com/tj/commander.js) — ESM support, TypeScript declarations, ~35M weekly downloads
- [Node.js fs API](https://nodejs.org/api/fs.html) — `readdir({ recursive: true })` stable in Node 22; `opendir` for depth-controlled walking

### Secondary (MEDIUM confidence)
- [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) — AI-powered star categorization with semantic search; validates categorization as core value
- [Astral](https://astralapp.com/) — tag-based star organization; validates 4-category approach
- [nb (command line notes)](https://xwmx.github.io/nb/) — CLI capture with offline sync; validates offline queue pattern
- [Building CLI apps with TypeScript in 2026](https://hackers.pub/@hongminhee/2026/typescript-cli-2026) — Commander.js + tsup approach
- [TypeScript CLI in pnpm Monorepo](https://webpro.nl/scraps/compiled-bin-in-typescript-monorepo) — bin field, tsup, shebang issues
- [GitLive Conflict Detection](https://blog.git.live/gitlive-11.0-Real-time-merge-conflict-detection) — parallel session merge detection patterns
- [Fastest Directory Crawler](https://dev.to/thecodrr/how-i-wrote-the-fastest-directory-crawler-ever-3p9c) — symlink handling; validated depth-1 strategy

### Tertiary (LOW confidence)
- [node-git-repos](https://github.com/IonicaBizau/node-git-repos) — recursive .git finder reference; MC should implement bounded walker, not use this library
- [Categorize GitHub Stars using OpenAI](https://gist.github.com/webpolis/e9be80fd68b1754d5869a1a71d48056b) — validates LLM + repo description + topics for categorization

---
*Research completed: 2026-03-16*
*Ready for roadmap: yes*
