# Mission Control v1.2 — Project Auto-Discovery + GitHub Star Intelligence

**Date:** 2026-03-15
**Status:** Reviewed (rev 2)
**Scope:** Directory-based git repo discovery (MacBook + Mac Mini), GitHub org repo discovery, GitHub star triage with intent categorization, dashboard triage section, manual scan trigger

## Problem

Mission Control v1.1 tracks 33 projects but requires manual `mc.config.json` edits to add new ones. Projects appear organically — a Claude Code session in `~/` spawns a new directory, or a fork gets cloned for reference — and MC has no idea until someone edits the config. Meanwhile, GitHub stars accumulate with no record of WHY something was starred, and the intent behind the star evaporates.

The user's workflow: start a conversation in `~/`, a new project directory materializes mid-session, and it should just appear on the dashboard. Repos might start messy — no remote, no package.json, uncommitted work. MC should handle that gracefully. The health engine (v1.1) already knows how to flag these issues; it just needs to know the repos exist.

For stars: the user encounters interesting repos on GitHub, stars them, and the intent ("reference for open-ez", "tool to try", "just inspiring") is lost. GitHub has star lists for organization, but nobody uses them because categorizing at star-time is too much friction. MC can be the triage layer that asks "what's this for?" after the fact.

## Solution

### 1. Discovery Engine

A 30-minute scan cycle (separate from the 5-minute health scan) that discovers new git repos and GitHub activity across three machines + GitHub.

#### Sources

| Source | Method | What It Finds |
|--------|--------|---------------|
| MacBook `~/` | `find ~/ -maxdepth 2 -name .git -type d` | Local git repos not in config |
| Mac Mini `~/` | Same command via SSH batch | Remote git repos not in config |
| GitHub orgs | `gh api /orgs/{org}/repos` for quartermint + sternryan | Org repos not in config |
| GitHub stars | `gh api /user/starred?sort=created&per_page=10` | Recently starred repos |

#### Scan Behavior

1. Run all four sources in parallel (local + SSH + GitHub org + GitHub stars)
2. For each discovered repo, check against `projects` table (already tracked) and `discovered_projects` table (already seen)
3. New repos → insert into `discovered_projects` with inferred metadata
4. Already-dismissed repos → check re-surface rules (see section 1.3)
5. Emit SSE event `discovery:new` when new discoveries are found

Discovery runs on a separate `setInterval` (30 minutes) from the health scan (5 minutes). Both timers start in `index.ts`. The discovery timer is the same `startBackgroundPoll` pattern but with a longer interval.

#### Metadata Inference

When a new repo is discovered, MC infers metadata with zero human input:

| Field | Inference Chain | Fallback |
|-------|----------------|----------|
| slug | Directory name, lowercased, kebab-cased | — |
| name | `package.json#name` → `Cargo.toml#[package].name` → `go.mod` module path → directory name Title Case | Directory name |
| tagline | AI-generate from README.md first paragraph (async Gemini, same pipeline as capture enrichment) | GitHub repo description (if available) → null |
| remoteUrl | `git remote get-url origin` | null (flagged as "no remote" by health engine on promote) |
| host | `local` / `mac-mini` / `github` based on scan source | — |
| lastActivityAt | Most recent commit date (`git log -1 --format=%aI`) | Discovery timestamp |

For GitHub org repos, `name` and `tagline` come from the GitHub API response (`repo.name`, `repo.description`). For starred repos, same plus `repo.stargazers_count` and `repo.language`.

Metadata inference for local/SSH repos runs the git commands within the same scan — adds ~1 second per new repo (only new repos, not every scan). README-based tagline generation is async (same `queueMicrotask` pattern as capture enrichment).

#### Re-Surface Rules

Dismissed discoveries re-appear under two conditions:

1. **New activity:** `lastActivityAt` in the repo is newer than `dismissedAt`. The user dismissed it when it was dormant, but now someone (possibly them) is working on it.
2. **Time decay:** 30 days since `dismissedAt` with no activity check. A gentle "remember this?" for repos that might have been dismissed hastily.

When re-surfaced, `status` changes from `dismissed` back to `new` and `dismissedAt` is preserved as `previouslyDismissedAt` for context ("dismissed 3 weeks ago").

### 2. Data Model

**`discovered_projects` table (new):**

| Column | Type | Purpose |
|--------|------|---------|
| id | integer PK | Auto-increment |
| slug | text | Inferred from directory/repo name |
| name | text | Inferred from package metadata or directory name |
| path | text | Filesystem path or GitHub `owner/repo` |
| host | text | `local` / `mac-mini` / `github` |
| source | text | `directory-scan` / `github-org` / `github-star` |
| tagline | text | AI-inferred or GitHub description (nullable) |
| remoteUrl | text | Origin remote URL (nullable — messy repos may not have one) |
| language | text | Primary language — GitHub API for github sources, null for local/mac-mini (no heuristic in v1.2) |
| lastActivityAt | text | ISO timestamp of most recent commit |
| status | text | `new` / `dismissed` / `promoted` |
| discoveredAt | text | ISO timestamp when first seen |
| dismissedAt | text | ISO timestamp when dismissed (nullable) |
| previouslyDismissedAt | text | Previous dismissal timestamp if re-surfaced (nullable) |
| dismissCount | integer | Number of times dismissed (default 0) |
| promotedAt | text | ISO timestamp when promoted to tracked (nullable) |
| starIntent | text | For stars: `reference` / `try` / `tool` / `inspiration` (nullable) |
| starProject | text | For stars with project context: which project it relates to (nullable) |
| metadata | text (JSON) | Additional data: star count, fork status, topics, etc. |

Indexed on `(status)` for "show me all new discoveries" and `(source, host, path)` unique for dedup. This allows the same `owner/repo` to appear as both a `github-org` discovery and a `github-star` discovery — they are semantically different (you own it vs. you starred it). The `slug` column is NOT unique in this table — the same directory name can exist on both MacBook and Mac Mini.

**Cross-table identity resolution:** When checking if a discovered repo is already tracked, the diff compares against the `projects` table using: (a) `path` exact match for local/mac-mini, (b) `remoteUrl` normalized match for repos with remotes, (c) `repo` field match for GitHub org repos. A repo matching ANY of these is considered "already tracked" and skipped.

**Dismissal tracking:** Only the most recent prior dismissal is tracked (`previouslyDismissedAt`). A `dismissCount` integer column tracks how many times the user has dismissed this repo — persistent dismissers (3+ dismissals) could be auto-suppressed in future iterations, but for now all re-surface rules apply equally regardless of count.

**Re-surface query predicate:**
```sql
WHERE status = 'dismissed'
  AND (lastActivityAt > dismissedAt OR dismissedAt < datetime('now', '-30 days'))
```

### 3. GitHub Star Intelligence

Stars get the same discovery flow but with a different triage action.

#### Star Scanning

Part of the 30-minute discovery cycle:
1. Fetch 10 most recent stars via `gh api /user/starred?sort=created&per_page=10`
2. Compare against `discovered_projects` where `source = 'github-star'`
3. New stars → insert with `status: new`, `source: github-star`
4. Include repo metadata: description, language, star count, topics

#### Star Triage (Intent Categorization)

When the user clicks "Categorize" on a star discovery card, an inline panel expands:

**Intent options:**
- **Reference for [project]** → select from tracked projects → GitHub star list `reference-{project}`
- **Try in [project]** → select from tracked projects → GitHub star list `try-in-{project}`
- **Tool to use** → GitHub star list `tools`
- **Just cool** → GitHub star list `inspiration`
- **Dismiss** → standard dismiss with re-surface rules

**GitHub star list management:**
- Lists created on-demand via `gh api --method POST /user/lists -f name="{list-name}"` if they don't exist
- Starred repo added to list via GitHub Lists API (exact endpoints to be verified against current GitHub REST API docs during Phase implementation — the Lists for Stars API is relatively new and endpoint paths may differ from standard REST conventions)
- MC doesn't store the categorization — GitHub star lists ARE the storage. MC is the triage interface.

If the GitHub API calls fail (rate limiting, auth, or Lists API unavailable), categorization is saved locally in `starIntent`/`starProject` columns and retried on next cycle. If the Lists API is not available (requires beta access), MC falls back to local-only categorization — the `starIntent`/`starProject` columns become the primary storage and the dashboard still shows categorized stars, just without syncing to GitHub.

**Star scan watermark:** The scan fetches 10 most recent stars every cycle. There is no persisted watermark — all 10 are compared against the DB each time. Known limitation: if >10 repos are starred in a single 30-minute window, older stars in that batch are silently missed. This is acceptable for the expected volume.

### 4. Dashboard Changes

#### Discoveries Section

New section in `App.tsx` layout: Capture → Risk Feed → **Discoveries** → Sprint Timeline → Hero → Departure Board.

**Visibility:** Only appears when there are `status: new` discoveries. Disappears when all are promoted or dismissed.

**Section header:** "Discoveries" with a manual scan button (refresh icon). Clicking triggers `POST /api/discover` for immediate scan.

**Card format (compact single-line, matching risk feed density):**

Repo discoveries:
```
🆕 open-ez-backup   ~/open-ez-backup   local   3 commits · no remote   [Track] [Dismiss]
🆕 quartermint/new-api   GitHub org   created 2d ago   [Track] [Dismiss]
```

Star discoveries:
```
⭐ vasturiano/timelines-chart   TS · 4.2k stars   starred 4h ago   [Categorize] [Dismiss]
```

Re-surfaced discoveries (previously dismissed):
```
🔄 experiment-xyz   ~/experiment-xyz   local   new commits since dismissed 3w ago   [Track] [Dismiss]
```

**Track action (promote):**
1. MC shows inferred name, slug, tagline in a compact inline form (pre-filled, editable)
2. User clicks "Confirm" (or just "Track" if defaults are fine — single click path)
3. MC writes entry to `mc.config.json` projects array
4. MC upserts into `projects` table
5. Discovery status changes to `promoted`
6. Next health scan picks it up — health dots, findings, the full treatment

**Categorize action (stars):**
1. Inline panel expands below the card
2. Shows intent options with project selector for reference/try intents
3. Single click categorizes: writes to GitHub star list, marks discovery as `promoted`

### 5. API Routes (New)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/discoveries` | All discoveries, filterable by `status` and `source` |
| POST | `/api/discoveries/:id/promote` | Promote to tracked project. Body: optional `{ name, slug, tagline }` overrides |
| POST | `/api/discoveries/:id/dismiss` | Dismiss with re-surface rules |
| POST | `/api/discoveries/:id/categorize` | Star intent categorization. Body: `{ intent, project? }` |
| POST | `/api/discover` | Trigger immediate discovery scan (manual button) |

**Modified routes:**
- `GET /api/projects` — add `discoveryCount` integer to response for section visibility. Requires updating `projectSchema` in `packages/shared/src/schemas/project.ts` to include `discoveryCount: z.number().optional()` for Hono RPC type safety.

### 6. Config Changes

`mc.config.json` gets a `discovery` section:

```json
{
  "discovery": {
    "enabled": true,
    "scanDirs": ["~/"],
    "githubOrgs": ["quartermint", "sternryan"],
    "scanStars": true,
    "intervalMinutes": 30,
    "ignorePaths": ["~/node_modules", "~/Library", "~/.Trash"]
  },
  "projects": [...],
  "macMiniSshHost": "mac-mini-host"
}
```

**`scanDirs`**: Directories to scan for `.git` repos (1-2 levels deep). Applied to both local and Mac Mini.

**`ignorePaths`**: Glob patterns to skip (user additions). Combined with hardcoded defaults that are always excluded:
- `*/node_modules/*`, `*/Library/*`, `*/.Trash/*`, `*/.git/*` (inside git dirs), `*/.cache/*`, `*/.npm/*`, `*/.nvm/*`, `*/.cargo/*`, `*/.rustup/*`, `*/Applications/*`, `*/.docker/*`
User `ignorePaths` entries are merged with these — they cannot override the hardcoded list.

**`githubOrgs`**: GitHub organizations to scan for repos.

**`scanStars`**: Whether to include recent star activity in discovery.

### 7. Scanner Integration

The discovery engine is a new service (`discovery-scanner.ts`) that:
1. Shares the SSH connection pattern from `project-scanner.ts` (batched commands)
2. Uses the same `p-limit(10)` concurrency pattern
3. Runs on its own timer (30 minutes) started alongside the health scan timer in `index.ts`
4. Writes to `discovered_projects` table (not `projects` — only promote does that)
5. Emits `discovery:new` SSE event when new discoveries are found (notification-only, no payload — same pattern as `health:changed`)

**SSE is supplementary, not primary:** The dashboard polls `GET /api/discoveries` on mount and on SSE reconnect. The `discovery:new` event triggers TanStack Query invalidation for live updates, but the dashboard does not depend on receiving the event to show discoveries.

**Local directory scan:**
```bash
find ~/ -maxdepth 2 -name .git -type d -not -path '*/node_modules/*' -not -path '*/Library/*' -not -path '*/.Trash/*' 2>/dev/null
```

**SSH directory scan (Mac Mini):**
A single SSH connection runs all `scanDirs` find commands in one batched script (NOT one connection per directory). Uses the `===SECTION===` delimiter pattern from the health scanner. If Mac Mini is unreachable (SSH timeout), the discovery cycle silently skips the Mac Mini source for that cycle — no staleness indicator needed since discovery is best-effort, not health-critical.

**GitHub org scan:**
```bash
gh api /orgs/quartermint/repos --paginate --jq '.[].full_name'
gh api /orgs/sternryan/repos --paginate --jq '.[].full_name'
```

**GitHub star scan:**
```bash
gh api /user/starred?sort=created&per_page=10 --jq '.[] | {full_name: .full_name, description: .description, language: .language, stargazers_count: .stargazers_count}'
```

### 8. Promote Flow (Config Write)

When a user promotes a discovery, MC needs to write to `mc.config.json`. This is the only feature in MC that modifies the config file.

**Write strategy:**
1. Acquire in-process mutex (module-level `Promise`-chain lock in `discovery-scanner.ts` — NOT a file lock)
2. Re-read `mc.config.json` from disk (not the cached startup value — `loadConfig()` is startup-only)
3. Parse with Zod (validate current state)
4. Append new project entry to `projects` array
5. Write back with `JSON.stringify(config, null, 2)` (preserve formatting)
6. Update the in-memory config reference so the next scan cycle uses the new config without restart
7. Release mutex

**Config reload on promote:** The current architecture passes config as a parameter to `scanAllProjects()`. On promote, the discovery service updates a module-level `currentConfig` variable (same pattern as `scanCache`). The next `setInterval` callback reads `currentConfig` instead of the startup snapshot. This avoids restarting the process. The `eventBus` emits `config:changed` for any listener that needs to react (e.g., the frontend could refresh the project list).

**Concurrency safety:** The Promise-chain mutex serializes all config writes. Two simultaneous promote clicks queue — second waits for first to complete. The 5-minute health scan reads `currentConfig` at cycle start and holds a snapshot — no mid-scan config changes affect the current cycle.

### 9. Non-Goals

- **iOS share sheet / screenshot capture** — Future milestone: Universal Capture. MC v1.2 is project-focused discovery, not general content capture.
- **Tweet/social media integration** — Future milestone: Universal Capture. Same triage pattern but different entry points (webhooks, share sheets, screenshot OCR).
- **Auto-promote without confirmation** — Always human-in-the-loop. MC surfaces, you decide.
- **Deep directory scanning** — `maxdepth 2` prevents scanning inside monorepos, node_modules, or nested project structures.
- **Private GitHub repo discovery** — Org scan covers this (if you have access, you see it). No additional PAT scopes needed beyond what `gh` already has.
- **Capacities migration** — Existing captures in Capacities are not imported. MC is forward-looking.

### 10. Testing Strategy

- Discovery engine: unit tests with mocked `find` / SSH / GitHub API output
- Metadata inference: unit tests for each inference chain (package.json, Cargo.toml, go.mod, fallback)
- Re-surface logic: unit tests for activity-based and time-based re-surface conditions
- Promote flow: integration tests verifying config file write + projects table upsert
- Star categorization: unit tests for intent → GitHub list mapping
- API routes: integration tests with seeded discoveries
- Dashboard: component tests for discovery cards, promote/dismiss/categorize actions

### 11. Migration & Rollout

1. Schema migration: `discovered_projects` table
2. Discovery service with directory + SSH scanning
3. GitHub org + star scanning
4. API routes for discoveries
5. Promote flow with config write
6. Dashboard discoveries section
7. Star categorization with GitHub list management

### 12. Future: Universal Capture (v1.3+)

The auto-discovery pattern established here extends to a broader vision: MC as the universal triage layer for anything interesting you encounter.

**Entry points (by friction, lowest first):**
1. iOS screenshot automation → webhook → MC capture
2. iOS Share Sheet → "Share to MC" → MC capture
3. WhatsApp-style message bot → MC capture
4. MC dashboard capture field (existing)

**Triage pattern (identical to star categorization):**
- Content arrives with no intent
- MC enriches (AI extract: URL → article summary, screenshot → OCR → content, tweet → thread context)
- Dashboard surfaces with "What's this for?" prompt
- User categorizes → MC files appropriately

The v1.2 star intelligence feature is the prototype for this — same triage UX, just scoped to GitHub stars. The Universal Capture milestone extends it to all content types.
