# Project Research Summary

**Project:** Mission Control v1.2 — Auto-Discovery + Star Intelligence
**Domain:** Developer personal operating environment — project auto-discovery and GitHub star triage
**Researched:** 2026-03-15
**Confidence:** HIGH

## Executive Summary

Mission Control v1.2 adds two capabilities to an already-mature codebase: automatic discovery of git repositories across MacBook, Mac Mini, and GitHub, and GitHub star intelligence with intent categorization. The defining research finding for this milestone is that **zero new npm dependencies are required**. Every capability needed — shell execution, SSH batching, GitHub API via `gh` CLI, file mutation, AI enrichment, SQLite, and SSE — already exists in the v1.1 codebase with proven production patterns. v1.2 is entirely new service code built on existing infrastructure, not a new technology stack.

The recommended approach is a strict layered build order: data foundation first (schema, migration, config extension, shared types), then the discovery engine service, then API routes, then dashboard UI, and finally star intelligence UX. This order is non-negotiable because every layer depends on the one below it. The discovery engine is the core value — without scanning and dedup, nothing else is useful. The star categorization UX is the differentiator, but it comes last because it depends on star data existing in the database.

The top risks are not technical unknowns — they are known failure modes with specific mitigations. The most critical: the GitHub Star Lists REST API **does not exist** (verified 2026-03-15 via live API call returning 404), so star categorization must be local-only storage from day one. Config file mutation in the promote flow is the first write ever made to `mc.config.json` at runtime, and it requires atomic writes with a Promise-chain mutex to prevent corruption. The macOS `find` command on `~/` has significant edge cases (TCC permission errors, iCloud symlinks, stderr floods) that require `prune`-before-descend semantics rather than post-filter exclusions. These three pitfalls, if not addressed at implementation time, trigger rewrites.

## Key Findings

### Recommended Stack

v1.2 requires no new dependencies. The existing stack handles all new capabilities:

**Core technologies (all existing):**
- `node:child_process` + `execFile` — directory scanning, SSH batch commands, `gh` CLI calls — already proven in production for health scanning
- `better-sqlite3` 11.10 + `drizzle-orm` 0.38.4 — new `discovered_projects` table via standard Drizzle migration (0006)
- `ai` 6.0 + `@ai-sdk/google` 3.0 — AI tagline generation using identical `generateText` + `Output.object` pattern as capture enrichment
- `p-limit` 7.3.0 — parallel scan source execution, already installed
- `hono` 4.12.5 + `zod` 3.25.76 — 5 new API routes following established patterns
- `gh` CLI 2.88.0 — GitHub org repos + starred repos; star lists (`/user/lists`) returns 404 — local-only categorization is the only path

**New patterns (no new dependencies):**
- Promise-chain mutex for config writes (~8 lines of JS, no `async-mutex` package needed)
- `find` with `-prune` (prune-before-descend) for macOS filesystem compatibility
- `application/vnd.github.star+json` media type for star timestamp access

**Explicitly rejected:**
- `@octokit/rest` — `gh` CLI already handles auth, pagination, rate limiting; Octokit duplicates that and adds ~200KB
- `fast-glob` / `globby` — one `find` command with 3 exclusions does not justify a glob library
- `async-mutex` — the config write mutex is 8 lines of Promise chaining; the package adds a dependency for trivial code
- `@iarna/toml` / `smol-toml` — only need `name` from `Cargo.toml`; regex handles this in one line
- `chokidar` — discovery runs on a 30-minute timer, not real-time file watching; `setInterval` is sufficient
- `node-cron` — the discovery timer is a simple `setInterval`; cron expression parsing adds no value

See STACK.md for full version compatibility table and verified `gh` API capabilities.

### Expected Features

**Must have (table stakes):**
- Local MacBook directory scan for `.git` dirs — the core discovery promise; without this, discovery doesn't exist
- Mac Mini SSH directory scan — discovery that only sees one machine is half-blind (5+ repos on Mac Mini)
- GitHub org repo discovery (`quartermint`, `vanboompow`) — catches repos created by teammates or not cloned locally
- Three-way dedup: path match + normalized remoteUrl + repo field — without this, every project shows as "new" every cycle
- Status lifecycle: `new` / `dismissed` / `promoted` — three states; more creates friction the user historically abandons
- Promote-to-tracked flow — writes to `mc.config.json` with Promise-chain mutex + atomic write
- Metadata inference chain (package.json → Cargo.toml → go.mod → directory name Title Case)
- Dashboard discoveries section — compact cards between Risk Feed and Sprint Timeline, conditional on `status: new` existence
- Manual scan trigger — eliminates "wait 30 minutes after setup" friction
- 5 API routes: `GET /api/discoveries`, `POST .../promote`, `POST .../dismiss`, `POST .../categorize`, `POST /api/discover`

**Should have (differentiators):**
- GitHub star intent categorization (reference / try / tool / inspiration) — captures intent that evaporates; local-only storage; no other tool does this
- Re-surface rules for dismissed discoveries — activity since dismissal OR 30-day decay; exponential backoff on repeat dismissals
- AI tagline generation from README content — async, fire-and-forget, rate-limited to 3 concurrent Gemini calls; GitHub `description` is the free fallback for github-sourced repos
- SSE `discovery:new` event — live dashboard updates without page refresh
- ETag conditional requests for GitHub org API calls — ~80% reduction in API calls when org repos haven't changed
- `discovery` config section in `mc.config.json` — `scanDirs`, `githubOrgs`, `scanStars`, `intervalMinutes`, `ignorePaths`; backward-compatible via `.default({})`
- `lastActivityAt` tracking — most recent commit date per discovery; powers re-surface rules and sort order

**Defer (v2+):**
- GitHub Star Lists API sync — **API does not exist**; local `starIntent`/`starProject` columns are the primary store; revisit if GitHub ships a public Lists API
- Language detection for local/mac-mini repos — low value, adds complexity; use GitHub API `language` field for github-sourced only (free in response)
- Full star history backfill watermark — 50 per cycle with watermark covers all realistic volume; full history sync is over-engineering
- Automatic AI star categorization — defeats the purpose; intent is personal and not inferrable; human choice is the feature

See FEATURES.md for the complete feature dependency graph and complexity/risk assessment table.

### Architecture Approach

v1.2 is a pure additive extension — no existing components are modified in breaking ways. The discovery engine is a new service (`discovery-scanner.ts`) running on a 30-minute timer in `index.ts` alongside the existing 5-minute health scanner. It scans 4 sources in parallel (`Promise.allSettled`), deduplicates against both `projects` and `discovered_projects` tables, and emits `discovery:new` SSE events when new repos are found. A separate `config-writer.ts` service provides the only config mutation path in the system, with a Promise-chain mutex, re-read-before-write, Zod validation, and atomic temp-file rename.

**Major components:**
1. `discovery-scanner.ts` — 30-min background service; 4 parallel scan sources; three-way dedup; metadata inference; AI tagline queue
2. `config-writer.ts` — Mutex-protected config file writes; the only filesystem mutation in Mission Control
3. `queries/discoveries.ts` — CRUD on `discovered_projects`; raw SQL prepared statements (Drizzle for schema, raw `better-sqlite3` for queries — same pattern as all existing query files)
4. `routes/discoveries.ts` — 5 API endpoints; promote is the only route that writes to filesystem
5. `discovery-section.tsx` + `discovery-card.tsx` — Dashboard UI; conditional render; compact card pattern matching Risk Feed density
6. `star-categorize.tsx` — Inline intent panel; local DB write only; no GitHub API calls
7. `discovered_projects` table — New SQLite table; `(source, host, path)` unique index for dedup; status lifecycle; star intent columns

**Key patterns:**
- Background timer: identical lifecycle to `project-scanner.ts` (initial delay, recurring `setInterval`, graceful shutdown in `index.ts`)
- SSH batching: single connection with `===SECTION===` delimiters; batch metadata reads for all new Mac Mini repos into one SSH connection
- Async enrichment: `queueMicrotask` fire-and-forget for AI taglines, rate-limited with `pLimit(3)` — same as capture enrichment
- Query layer: Drizzle for schema/migration, raw `better-sqlite3` prepared statements for queries
- Promote flow: config-first (write to `mc.config.json` → scanner upserts DB on next cycle); avoids two-system consistency problem
- Dashboard discovery count: added to `GET /api/projects` response as a global count (single `SELECT COUNT(*)`), not a per-project subquery

**What does NOT change:**
- `project-scanner.ts` — untouched; runs on its own 5-min cycle
- `git-health.ts` — receives promoted projects automatically via next scan cycle
- Existing API routes — additive only, no breaking changes
- MCP server — no v1.2 changes; could add discovery tools in a future milestone

See ARCHITECTURE.md for the complete dependency graph, all data flows, and anti-patterns to avoid.

### Critical Pitfalls

1. **`find` command on macOS misses repos and floods logs** — TCC-protected directories (`~/Desktop`, `~/Documents`) produce permission errors, iCloud symlinks eat maxdepth levels, stderr floods slow scans to 5-10s. Use `-prune` (not `-not -path`) to prevent directory entry rather than filter after access. Use `-print0` / null-byte splitting. Set 10s timeout. Test on the actual Mac Mini — TCC and filesystem state differ between machines.

2. **GitHub Star Lists API does not exist** — `/user/lists` returns 404. Verified 2026-03-15. GitHub community discussions #8293 and #54240 confirm no public API (4+ years unresolved, GitHub staff: "no immediate plans"). Design `starIntent`/`starProject` columns as primary storage with no GitHub sync. Remove all spec references to list creation via API. Build star categorization as local-only from day one.

3. **Config file mutation creates race conditions and crash corruption** — First time `mc.config.json` is ever mutated at runtime. `writeFileSync` required (not `writeFile`) for synchronous flush before mutex release. Atomic write via temp file + `renameSync` (POSIX atomic) prevents crash corruption. Backup before write. Config-first promote order (scanner upserts DB on next cycle) eliminates the two-system consistency problem entirely.

4. **Dedup fails for repos without remote URLs** — Same directory name on MacBook and Mac Mini with no remotes breaks all three dedup strategies. Enforce slug uniqueness at promote time (not discovery time): check against existing config entries, return 409 Conflict with suggested alternative slug on collision. Cross-host matching for same-remote-URL repos should auto-group into a single "Found on both machines" card.

5. **`gh api --paginate` silently truncates on rate limit hits** — Pagination terminates on 403/429 with no retry. Use `per_page=100` single-page fetch instead of `--paginate`. Discovery adds ~5 GitHub API calls per 30-min cycle (well within 5,000/hr limit at current scale), but `--paginate` is still fragile. Schedule discovery timer with 150s offset from health scan timer to prevent simultaneous GitHub API bursts.

6. **Re-surface logic creates "whack-a-mole" for infrastructure repos** — Repos with automated commits (Docker configs, training scripts) always satisfy `lastActivityAt > dismissedAt`, causing them to resurface every cycle. Use exponential backoff based on `dismissCount`: 30/90/365 days. Add "Ignore forever" as a third action alongside Track/Dismiss.

7. **AI tagline generation burst on first discovery run** — 10-20 repos discovered simultaneously creates 10-20 parallel Gemini calls. Rate-limit with `pLimit(3)`. Use GitHub `description` field for github-sourced repos (free from API response — no Gemini call needed). Defer tagline generation to second cycle for first-run repos to prevent initial burst.

## Implications for Roadmap

The dependency graph dictates a clear 5-phase build order. The architecture research provides this order explicitly based on what each layer needs from the one below it.

### Phase 1: Data Foundation
**Rationale:** Everything in v1.2 reads from or writes to these foundational layers. Config extension must come before the discovery engine (it reads `scanDirs`, `githubOrgs`). Schema must come before queries. Shared types must come before routes and UI can be typed. Upsert semantics cannot be retrofitted after data starts flowing.
**Delivers:** `discovered_projects` table + Drizzle migration (0006), `discovery` config section with backward-compatible Zod schema (`.optional().default({})`), `config-writer.ts` with Promise-chain mutex and atomic `writeFileSync` + rename, shared Zod schemas in `packages/shared`
**Addresses:** Persistence layer for all features
**Avoids:** Pitfall 3 (config write race/corruption — designed here, not retrofitted), Pitfall 18 (config schema backward compat — optional with defaults)
**Research needed:** No — all patterns from existing codebase

### Phase 2: Discovery Engine
**Rationale:** Core value of the milestone. All API routes, dashboard UI, and star intelligence depend on data existing in `discovered_projects`. Can be validated end-to-end with manual invocation before API routes exist — testing the hard logic (scanning, dedup, metadata inference) before UI complexity is introduced.
**Delivers:** `discovery-scanner.ts` with 4 parallel sources (local `find`, SSH, GitHub org repos, GitHub stars), three-way dedup logic, metadata inference chain, `index.ts` timer integration with 150s offset from health scan, re-surface rules with exponential backoff
**Addresses:** All table-stakes scanning features; re-surface rules; ETag conditional requests; `lastActivityAt`
**Avoids:** Pitfall 1 (`find` macOS edge cases — prune semantics, `-print0`, 10s timeout), Pitfall 4 (dedup for no-remote repos), Pitfall 5 (`--paginate` rate limit truncation — `per_page=100` single page), Pitfall 6 (re-surface whack-a-mole — exponential backoff), Pitfall 7 (SSH blocking health scan — cache results, schedule offset), Pitfall 12 (star per_page too small — increase to 50), Pitfall 13 (AI tagline burst — `pLimit(3)`, defer first cycle), Pitfall 14 (bare repos in find results), Pitfall 15 (`gh` auth scope check at startup)
**Research needed:** No — patterns verified; GitHub Lists API risk already resolved as local-only

### Phase 3: API Routes + Promote Flow
**Rationale:** UI cannot be built without API contracts. The promote flow is the riskiest feature (only route that writes to filesystem) and must be tested with curl/httpie before building UI — catching edge cases without React complexity in the loop.
**Delivers:** 5 Hono routes in a single route group, `discoveryCount` added to `GET /api/projects` as global count, Hono RPC type chain verified after addition (`pnpm typecheck` + explicit type assertion test)
**Addresses:** All CRUD operations; config-first promote flow; manual scan trigger
**Avoids:** Pitfall 3 (config write — via `config-writer.ts` from Phase 1), Pitfall 9 (DB/config inconsistency — config-first promote; scanner handles DB upsert on next cycle), Pitfall 11 (Hono RPC type chain — single route group, explicit type check after each addition), Pitfall 16 (N+1 discoveryCount — global count, not per-project subquery)
**Research needed:** No — standard Hono patterns

### Phase 4: Dashboard Integration
**Rationale:** UI is last among the core features because it depends on all three prior phases. Build in sub-order: hook + data layer first, then card components, then section container with conditional render, then SSE integration.
**Delivers:** `use-discoveries.ts` TanStack Query hook, `discovery-section.tsx` with conditional render and reserved `min-height`, `discovery-card.tsx` with Track/Dismiss actions, `promote-form.tsx` inline edit (pre-filled defaults, one-click path), `use-sse.ts` extensions for `discovery:new` and `config:changed`
**Addresses:** Dashboard discoveries section; SSE live updates; layout position (between Risk Feed and Sprint Timeline)
**Avoids:** Pitfall 10 (layout shift — `min-height` reservation + animated `max-height` transitions), Pitfall 17 (SSE event wiring — checklist: union type → emitter → handler → query invalidation across all 3 packages)
**Research needed:** No — component patterns well-established from v1.1

### Phase 5: Star Intelligence UX
**Rationale:** Depends on star data appearing in the UI from Phase 4. The most differentiated feature but also the most unique UX (categorization panel is a new interaction pattern). Intentionally last so it can be built and tested against real discovered star data rather than mocks.
**Delivers:** `star-categorize.tsx` inline intent panel (reference/try/tool/inspiration), project picker for reference/try intents (links stars to tracked projects), categorized star moving to promoted state, local DB write only — no GitHub API calls
**Addresses:** Star intent categorization differentiator; `starProject` linkage to tracked projects
**Avoids:** Pitfall 2 (GitHub Lists API — confirmed local-only; no API calls in implementation)
**Research needed:** No — UX pattern is custom but implementation is standard React + API mutation

### Phase Ordering Rationale

- Phases 1 → 2 → 3 are strictly sequential: config schema before engine (engine reads config), engine before routes (routes are thin wrappers over engine data), routes before UI (UI types come from RPC graph)
- Phases 4 and 5 are parallelizable after Phase 3 completes, but Phase 4 should be completed first to validate the end-to-end pipeline before star intelligence UX is built against it
- Star intelligence (Phase 5) is isolated enough that it could be deferred to a follow-up session without blocking v1.2 delivery — the first four phases already deliver full auto-discovery

### Research Flags

All critical risks are resolved at the research level. No phases require additional research-phase investigation.

Implementation-level validation required (not research, but testing):
- **Phase 2 (Discovery Engine):** Test on actual Mac Mini before declaring Phase 2 complete. TCC and filesystem state differ between MacBook and Mac Mini. Log discovery scan duration — if `find` takes >3s, path pruning is wrong. Run `gh api /user/starred?per_page=1` to verify auth scope before building star scan.
- **Phase 3 (Promote Flow):** Integration test: promote two projects in rapid succession, verify both appear in config. Crash test: SIGKILL during write, verify config recoverable from backup.
- **Phase 3 (API Routes):** After adding routes, run `pnpm typecheck` and explicitly test `client.api.discoveries.$get()` type — if `any` is returned, the Hono RPC type chain is broken and route groups need consolidation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies verified against installed `package.json`. `gh` API capabilities tested live on 2026-03-15 — `/user/starred` with star+json media type confirmed; `/user/lists` confirmed 404. All implementation patterns from production v1.1 code. |
| Features | HIGH | Feature set derived from design spec + anti-feature analysis with specific rejection rationale. GitHub Lists API non-existence confirmed via live API call + 4 GitHub community discussions spanning 4+ years. |
| Architecture | HIGH | Integration research into known codebase with detailed design spec (rev 2). Dependency graph derived from direct code examination of `project-scanner.ts`, `config.ts`, `event-bus.ts`, `index.ts`, `app.ts`, `db/schema.ts`. Build order matches actual dependency flow. |
| Pitfalls | HIGH | 18 pitfalls with specific mitigations. macOS `find` edge cases, config mutation race conditions, and GitHub API constraints verified against official docs and live testing. Phase-specific warning summary and integration risk matrix provided. |

**Overall confidence:** HIGH

### Gaps to Address

- **Star watermark persistence:** Research recommends persisting a watermark (the `starred_at` timestamp of the last processed star) to handle burst-starring sessions. Where this watermark is stored (a metadata row in `discovered_projects`, a separate key-value table, or a JSON sidecar file) is an implementation decision for Phase 2. The `discovered_projects` table's `metadata` JSON column is the simplest option.

- **Mac Mini TCC state:** Whether the Mac Mini's Node.js process (running as a Tailscale-accessible service) has Full Disk Access for `~/Desktop` and `~/Documents` is unknown without live testing. Discovery Phase 2 must be tested on the actual Mac Mini. If TCC is restricted, `ignorePaths` defaults should include these directories and the scan should focus on `~/` at maxdepth 2 with explicit pruning.

- **Hono RPC type chain cumulative load:** v1.1 identified TypeScript instantiation depth as a risk for the Hono RPC graph. v1.2 adds 2 more route groups. The mitigation (single route group for all discovery endpoints, explicit type check after addition) is specified in Phase 3, but actual outcome requires confirmation at implementation time.

## Sources

### Primary (HIGH confidence)
- GitHub REST API — Starring: `https://docs.github.com/en/rest/activity/starring` — Verified `application/vnd.github.star+json` media type, `starred_at` field availability
- GitHub Community Discussion #8293 — "No immediate plans" for Lists API (GitHub staff response); 241 upvotes, 4+ years unresolved
- GitHub Community Discussion #54240 — Additional confirmation no public REST/GraphQL endpoints for star list management
- `gh` CLI 2.88.0 — Live tested 2026-03-15: `/user/starred` with star+json returns `{starred_at, repo}` objects; `/user/lists` returns 404
- `gh` CLI issue #4443 — `--paginate` terminates on 403/429 without retry or partial result handling
- GitHub REST API Rate Limits — `https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api` — authenticated 5,000/hr confirmed
- Mission Control v1.1 codebase — direct examination: `project-scanner.ts`, `ai-categorizer.ts`, `enrichment.ts`, `config.ts`, `event-bus.ts`, `index.ts`, `app.ts`, `db/schema.ts`, `mc.config.json`
- macOS `find` command reference — `-prune` vs `-not -path` behavior; symlink handling; TCC protection scope
- Node.js `child_process` documentation — `execFile` behavior, stdio handling, timeout options
- POSIX rename atomicity — temp file + rename pattern for crash-safe file writes

### Secondary (MEDIUM confidence)
- Backstage GitHub Discovery — comparable auto-discovery pattern in developer portals; confirms `maxdepth 2` as standard scope for project discovery
- Atomic file write pattern (temp + rename) — race condition mitigations for single-process Node.js config writes
- GitHub REST API Best Practices — ETag / `If-None-Match` conditional request documentation; 304 responses and rate limit budget

### Tertiary (LOW confidence)
- GitHub Repository Dashboard (GA Feb 2026) — GitHub's own discovery UI; confirms problem space but not directly comparable
- `find-git-repositories` npm package — evaluated as alternative to raw `find`; not needed given existing `execFile` pattern

---
*Research completed: 2026-03-15*
*Ready for roadmap: yes*
