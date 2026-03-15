# Feature Landscape: Auto-Discovery + Star Intelligence

**Domain:** Developer personal dashboard -- auto-discovery of git repositories and GitHub star triage
**Researched:** 2026-03-15
**Milestone:** v1.2

## Table Stakes

Features the user expects from an auto-discovery system. Missing = feature feels broken or incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Local directory scanning for `.git` dirs | The core promise -- "it should just appear on the dashboard." Without this, discovery doesn't exist. | Low | `find` command, existing SSH batch pattern | `find ~/ -maxdepth 2 -name .git -type d` is well-understood, fast (<1s for ~2 levels), and already proven in similar tools (Backstage, Git-Dashboard, GitExtensions). Hardcoded ignore list (`node_modules`, `Library`, `.Trash`, `.cache`, etc.) prevents false positives. |
| Mac Mini SSH directory scanning | User has 5+ repos on Mac Mini. Discovery that only sees one machine is half-blind. | Low | Existing SSH batch pattern from `project-scanner.ts` | Reuse the `===SECTION===` delimiter pattern. Single SSH connection for all `scanDirs`. If SSH times out, skip silently -- discovery is best-effort, not health-critical. |
| GitHub org repo discovery | Org repos created by teammates or forks won't exist locally. `gh api /orgs/{org}/repos` with `--paginate` covers this. | Low | `gh` CLI (already used for health checks) | Rate limit: authenticated requests get 5,000/hr. Org repo list is 1 call per page (30 repos/page). Two orgs with <50 repos each = 2-4 calls per cycle. Negligible. |
| Dedup against already-tracked projects | Without dedup, every tracked project shows as "new" every cycle. This is the #1 thing that would make discovery unusable. | Medium | `projects` table, `discovered_projects` table | Three-way match: (a) path exact match for local/mac-mini, (b) normalized `remoteUrl` match for repos with remotes, (c) `repo` field match for GitHub entries. All three must be checked because the same project can appear via different sources. |
| Dedup against previously-seen discoveries | A dismissed discovery re-appearing every 30 minutes is worse than no discovery at all. | Low | `discovered_projects` table with `(source, host, path)` unique index | Simple DB lookup. The unique index enforces this at the schema level. |
| Status lifecycle: new / dismissed / promoted | Without clear states, the user can't manage discoveries. "New" is inbox, "dismissed" is gone (with re-surface), "promoted" is tracked. | Low | `discovered_projects` table | Three states are sufficient. Adding more (e.g., "reviewing", "maybe-later") creates friction the user has historically abandoned. |
| Promote-to-tracked flow | Discovery without action is just a notification. Promote must write to `mc.config.json` AND upsert into `projects` table so the next health scan picks it up. | Medium | Config file write, `projects` table, in-process mutex | Config mutation is the riskiest part. Promise-chain mutex serializes writes. Re-read config from disk before each write (not cached startup value). `JSON.stringify(config, null, 2)` preserves formatting. |
| Dismiss action with persistence | User must be able to say "not interested" and have it stick. | Low | `discovered_projects` table | Set `status = 'dismissed'`, `dismissedAt = now()`. Increment `dismissCount`. |
| Metadata inference (name, slug) | Showing raw directory names like `rss_rawdata` is confusing. Inferring "RSS RawData" from `package.json#name` or Title Case from dir name makes cards readable. | Low | `package.json`, `Cargo.toml`, `go.mod` parsers | Inference chain: `package.json#name` -> `Cargo.toml [package].name` -> `go.mod` module path -> directory name Title Case. Each is a simple file read + regex parse. Only runs for NEW discoveries, not every cycle. |
| Dashboard discoveries section | Without UI, discovery is invisible. Section appears only when `status: new` discoveries exist. Disappears when all are handled. | Medium | New React component, `GET /api/discoveries` endpoint, TanStack Query | Compact single-line cards matching risk feed density. Position: after Risk Feed, before Sprint Timeline. Conditional rendering keeps dashboard clean when there's nothing new. |
| Manual scan trigger | 30-minute cycle means waiting up to 30 minutes to see results after setup. A "scan now" button eliminates this. | Low | `POST /api/discover` endpoint | Debounce or disable button during active scan to prevent hammering. |
| 5 new API routes | REST endpoints for CRUD on discoveries + manual trigger. | Medium | Hono route definitions, Zod schemas, DB queries | Standard CRUD pattern already established in captures, health, risks routes. Follow same conventions. |

## Differentiators

Features that set this apart from "just scanning directories." Not expected, but high-value.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| GitHub star intent categorization | The core insight: stars accumulate but intent evaporates. Asking "what's this for?" after the fact captures intent that GitHub's UI never does. No other tool does this. | Medium | `GET /user/starred` API, `discovered_projects` table, dashboard inline panel | Four intents: `reference` (for a specific project), `try` (want to use in a project), `tool` (general utility), `inspiration` (just cool). Project selector for reference/try intents links stars to tracked projects. |
| Re-surface rules for dismissed discoveries | Most discovery tools treat dismiss as permanent. Re-surfacing on new activity ("you dismissed this 3 weeks ago, but someone pushed 5 commits since") catches repos that become relevant later. | Low | `discovered_projects` table, re-surface query predicate | Two triggers: (1) `lastActivityAt > dismissedAt` = new activity, (2) 30 days since dismissal = time decay. Both are simple SQL predicates checked during each discovery cycle. |
| AI tagline generation | Inferring a one-line description from README.md content makes discovery cards immediately useful. "What is this?" is answered without clicking. | Low | Existing Gemini AI pipeline from capture enrichment, `queueMicrotask` async pattern | Same fire-and-forget pattern as capture AI categorization. Fallback chain: AI from README -> GitHub description -> null. Async -- never blocks discovery scan. |
| SSE live updates for new discoveries | Discoveries appear on dashboard without page refresh. Matches the "smarter than 3 seconds ago" ethos. | Low | Existing SSE + EventSource infrastructure, `discovery:new` event | Same pattern as `health:changed`. TanStack Query invalidation on event receipt. Dashboard polls on mount as fallback. |
| Previously-dismissed context on re-surfaced cards | Showing "dismissed 3 weeks ago" on re-surfaced cards gives the user context for why they're seeing it again. Prevents confusion. | Low | `previouslyDismissedAt` column, `dismissCount` column | Pure UI enhancement. Data is already tracked. Card shows badge like "dismissed 3w ago" with dismiss count if > 1. |
| Config discovery section in `mc.config.json` | Configurable scan directories, GitHub orgs, ignore patterns. Power users can customize; defaults work for everyone. | Low | Zod schema extension, `loadConfig()` update | `scanDirs`, `githubOrgs`, `scanStars`, `intervalMinutes`, `ignorePaths`. Hardcoded ignore list always applies (user additions are merged, not replaced). |
| `lastActivityAt` tracking | Most recent commit date for each discovered repo. Enables sorting by "most recently active" and powers re-surface rules. | Low | `git log -1 --format=%aI` during discovery scan | Single git command per new discovery. For GitHub sources, comes from API response. Stored as ISO timestamp. |
| In-memory config hot-reload on promote | Promoting a discovery updates the in-memory config so the next scan cycle includes the new project without process restart. | Low | Module-level `currentConfig` variable, `config:changed` event | Same pattern as `scanCache`. The 5-minute health scan reads config at cycle start, so new projects appear within 5 minutes of promotion. |
| Conditional requests (ETag) for GitHub API | Using `If-None-Match` headers on org repo calls. 304 responses don't count against rate limits and save bandwidth when org repos haven't changed (which is most cycles). | Low | ETag caching per endpoint | GitHub docs explicitly recommend this. Org repos change rarely; stars change occasionally. Simple header caching saves ~80% of API calls over time. |

## Anti-Features

Features to explicitly NOT build. Each has been considered and rejected for specific reasons.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Auto-promote without confirmation | The user has explicitly said "MC surfaces, you decide." Auto-promoting violates the human-in-the-loop principle and could flood the dashboard with noise (experiment directories, forks, one-off scripts). | Always require explicit Track/Promote click. Pre-fill inferred metadata so it's one-click when defaults are right. |
| Deep directory scanning (maxdepth > 2) | Scanning inside monorepos, `node_modules`, or nested project structures creates false positives and performance problems. A `~/project/packages/subpackage/.git` is part of the parent project, not a separate one. | `maxdepth 2` from `~/` is the right scope. Covers `~/project-name/` and `~/org/project-name/` patterns. |
| GitHub Star Lists API integration | **CRITICAL: The GitHub Star Lists REST API does not exist.** Despite being requested since 2021 (241 upvotes, 55+ comments in community discussion #8293), GitHub has not shipped an official API. The design spec mentions creating star lists programmatically -- this is not possible through official channels. Unofficial web scraping approaches exist but are fragile and violate ToS. | Store star categorization locally in `starIntent`/`starProject` columns. MC becomes the categorization layer, not a sync tool to GitHub Lists. The dashboard shows categorized stars regardless. If GitHub eventually ships a Lists API, add sync as a future enhancement. |
| Language detection for local repos | Detecting primary language for local/mac-mini repos adds complexity (file extension counting, `.gitattributes` parsing) with low value -- the user already knows what language their local projects use. | Use `language` from GitHub API for github-sourced discoveries (it's free in the response). Leave null for local/mac-mini. |
| Notification push for new discoveries | The user explicitly avoids notification fatigue. Discovery is pull-based -- you see it when you open the dashboard. SSE updates the UI if you're already looking, but no toast/badge/sound. | SSE + TanStack Query invalidation for live updates while viewing. No notifications when dashboard is not open. |
| Star scan watermark / full history sync | Tracking a watermark to fetch ALL stars ever added is over-engineering. The user stars <10 repos per week. Fetching 10 most recent per cycle catches everything in practice. | Fetch 10 most recent stars every cycle. Known limitation: >10 stars in a single 30-minute window misses older ones. Acceptable for expected volume. |
| Automatic star categorization via AI | Using AI to guess why something was starred removes the human insight that makes categorization valuable. "Why did I star this?" is a personal question. | Present the 4 intent options and let the user pick. The act of categorizing forces a moment of reflection that preserves intent. |
| File-system watchers (fsnotify/chokidar) | Real-time filesystem monitoring for new repos adds complexity (watcher lifecycle, OS limits, permission issues) for marginal benefit over a 30-minute poll. New repos don't need sub-minute detection. | 30-minute `setInterval` poll is sufficient. Manual scan button covers the "I just created something, show it now" case. |
| Cross-machine dedup by content | Trying to identify that `~/project` on MacBook and `~/project` on Mac Mini are the same repo by content (commit history, file hashes) is complex and already solved by remote URL normalization. | Use existing `normalizeRemoteUrl()` from `git-health.ts` for identity resolution. Repos with the same normalized remote URL on different machines are the same project -- this is already proven in v1.1's copy detection. |
| Editing discovery metadata before promote | Adding a full form for editing name, slug, tagline, path before promoting adds friction. The user wants one-click promote when defaults are right. | Show inferred metadata inline (pre-filled). Allow optional override. Default path: single "Track" click uses all defaults. Power path: click "edit" to modify before confirming. |

## Feature Dependencies

```
Config schema extension (discovery section) -> Discovery engine -> All other features
  |
  +-> Local directory scan ---+
  +-> SSH directory scan -----+-> Dedup logic -> discovered_projects table
  +-> GitHub org scan --------+       |
  +-> GitHub star scan -------+       v
                                Metadata inference (name, slug, tagline)
                                      |
                                      v
                                API routes (5 endpoints)
                                      |
                              +-------+-------+
                              |               |
                              v               v
                     Dashboard section    Promote flow (config write)
                              |               |
                              v               v
                     Star categorization  In-memory config reload
                     (inline panel)
                              |
                              v
                     SSE live updates (discovery:new event)
```

Key ordering constraints:
1. **Config schema** must come first -- discovery engine reads `scanDirs`, `githubOrgs`, etc.
2. **Discovery engine** (scanning + dedup) must exist before API routes can serve data.
3. **API routes** must exist before dashboard can render discoveries.
4. **Promote flow** requires both API route AND config write logic.
5. **Star categorization** depends on star scan data existing in the DB.
6. **SSE** can be added last -- dashboard works with polling alone.

## MVP Recommendation

Prioritize in this order:

1. **Discovery engine + dedup + metadata inference** -- The core value. Without scanning and dedup, nothing else works. Includes config schema extension.
2. **discovered_projects table + DB queries** -- Persistence layer. Simple schema, standard Drizzle patterns.
3. **API routes (5 endpoints)** -- CRUD for discoveries + manual trigger. Standard Hono patterns.
4. **Dashboard discoveries section** -- Makes discovery visible. Compact cards with Track/Dismiss actions.
5. **Promote flow with config write** -- The action that makes discovery useful. Promise-chain mutex, re-read from disk, atomic write.
6. **GitHub star scanning + intent categorization** -- The differentiator. Separate from directory discovery because it's a different source with different UX (categorize vs. track).
7. **Re-surface rules** -- Polish. Runs during discovery cycle, simple SQL predicate.
8. **AI tagline generation** -- Enhancement. Uses existing pipeline, runs async, never blocks.

**Defer:**
- GitHub Star Lists API sync: Does not exist. Local-only categorization is the v1.2 path.
- Language detection for local repos: Low value, adds complexity.
- Full star history import: 10-per-cycle is sufficient for expected volume.

## Complexity Assessment

| Feature Area | Estimated Complexity | Risk Level | Notes |
|-------------|---------------------|------------|-------|
| Local/SSH directory scanning | Low | Low | Well-understood `find` command. Reuses SSH batch pattern. |
| GitHub org/star scanning | Low | Low | Simple `gh api` calls. Rate limits not a concern at this volume. |
| Dedup logic (3-way match) | Medium | Medium | Path match + remote URL normalization + repo field match. Edge cases: repos without remotes, repos moved between directories. |
| discovered_projects table | Low | Low | Standard Drizzle schema + migration. |
| Metadata inference | Low | Low | File read + regex for package.json/Cargo.toml/go.mod. Fallback chain handles missing files. |
| API routes | Low-Medium | Low | 5 endpoints following established patterns. |
| Dashboard discoveries section | Medium | Low | New component, but follows risk feed card pattern. Conditional rendering. |
| Promote flow (config write) | Medium | **High** | **Riskiest feature.** Config mutation is the only write to `mc.config.json`. Promise-chain mutex, re-read from disk, JSON formatting preservation. Must not corrupt config on crash mid-write. Consider `write-file-atomic` for crash safety. |
| Star intent categorization | Medium | Medium | Inline UI panel with project selector. Local-only storage (no GitHub Lists API). |
| Re-surface rules | Low | Low | SQL predicate during discovery cycle. |
| AI tagline generation | Low | Low | Reuses existing Gemini pipeline. Async, non-blocking. |
| SSE discovery events | Low | Low | Reuses existing EventSource infrastructure. |
| Config hot-reload | Low | Low | Module-level variable swap. Same pattern as scan cache. |

## GitHub API Budget (per 30-minute cycle)

| Source | API Calls | Rate Impact |
|--------|-----------|-------------|
| GitHub org repos (quartermint) | 1-2 (paginated) | Negligible |
| GitHub org repos (vanboompow) | 1-2 (paginated) | Negligible |
| GitHub stars (10 most recent) | 1 | Negligible |
| **Total per cycle** | **3-5** | **~240-400/day out of 5,000/hr limit** |

Conditional requests (ETag/If-None-Match) can reduce this further -- 304 responses don't count against rate limits. Worth implementing for the org repo calls since they rarely change.

## Sources

- [GitHub REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) -- HIGH confidence
- [GitHub REST API Best Practices](https://docs.github.com/rest/guides/best-practices-for-using-the-rest-api) -- HIGH confidence (conditional requests, ETag usage)
- [GitHub REST API Starring Endpoints](https://docs.github.com/en/rest/activity/starring) -- HIGH confidence
- [GitHub Community Discussion #8293: Star Lists API](https://github.com/orgs/community/discussions/8293) -- HIGH confidence (NO official Lists API exists, 4+ years unresolved)
- [GitHub Community Discussion #54240: Star Lists REST API](https://github.com/orgs/community/discussions/54240) -- HIGH confidence (confirms no REST API for lists)
- [GitHub REST API Organization Repos](https://docs.github.com/en/rest/repos/repos) -- HIGH confidence
- [GitHub CLI `gh repo list`](https://cli.github.com/manual/gh_repo_list) -- HIGH confidence
- [GitHub REST API Pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api) -- HIGH confidence
- [write-file-atomic npm package](https://www.npmjs.com/package/write-file-atomic) -- MEDIUM confidence (atomic config writes)
- [async-mutex npm package](https://www.npmjs.com/package/async-mutex) -- MEDIUM confidence (Promise-chain mutex pattern)
- [Backstage GitHub Discovery](https://backstage.io/docs/integrations/github/discovery/) -- MEDIUM confidence (comparable auto-discovery pattern in developer portals)
- [GitHub Repository Dashboard (GA Feb 2026)](https://github.blog/changelog/2026-02-24-repository-dashboard-is-now-generally-available/) -- LOW confidence (GitHub's own discovery UI, not directly comparable)
- [find-git-repositories npm](https://www.npmjs.com/package/find-git-repositories) -- LOW confidence (alternative to raw `find` command, likely not needed)
