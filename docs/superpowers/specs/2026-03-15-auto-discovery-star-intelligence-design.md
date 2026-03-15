# Mission Control v1.2 — Project Auto-Discovery + GitHub Star Intelligence

**Date:** 2026-03-15
**Status:** Draft (rev 1)
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
| GitHub orgs | `gh api /orgs/{org}/repos` for quartermint + vanboompow | Org repos not in config |
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
| language | text | Primary language (from GitHub API or file extension heuristic, nullable) |
| lastActivityAt | text | ISO timestamp of most recent commit |
| status | text | `new` / `dismissed` / `promoted` |
| discoveredAt | text | ISO timestamp when first seen |
| dismissedAt | text | ISO timestamp when dismissed (nullable) |
| previouslyDismissedAt | text | Previous dismissal timestamp if re-surfaced (nullable) |
| promotedAt | text | ISO timestamp when promoted to tracked (nullable) |
| starIntent | text | For stars: `reference` / `try` / `tool` / `inspiration` (nullable) |
| starProject | text | For stars with project context: which project it relates to (nullable) |
| metadata | text (JSON) | Additional data: star count, fork status, topics, etc. |

Indexed on `(status)` for "show me all new discoveries" and `(host, path)` unique for dedup.

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
- Lists created on-demand via `gh api --method POST /user/{username}/lists -f name="{list-name}"` if they don't exist
- Starred repo added to list via `gh api --method PUT /user/{username}/lists/{list_id}/repos/{repo_id}`
- MC doesn't store the categorization — GitHub star lists ARE the storage. MC is the triage interface.

If the GitHub API calls fail (rate limiting, auth), categorization is saved locally in `starIntent`/`starProject` columns and retried on next cycle.

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
- `GET /api/projects` — add `discoveryCount` to response for section visibility

### 6. Config Changes

`mc.config.json` gets a `discovery` section:

```json
{
  "discovery": {
    "enabled": true,
    "scanDirs": ["~/"],
    "githubOrgs": ["quartermint", "vanboompow"],
    "scanStars": true,
    "intervalMinutes": 30,
    "ignorePaths": ["~/node_modules", "~/Library", "~/.Trash"]
  },
  "projects": [...],
  "macMiniSshHost": "ryans-mac-mini"
}
```

**`scanDirs`**: Directories to scan for `.git` repos (1-2 levels deep). Applied to both local and Mac Mini.

**`ignorePaths`**: Glob patterns to skip. Prevents scanning inside Library, Trash, node_modules, etc. Sensible defaults are hardcoded (these are additions).

**`githubOrgs`**: GitHub organizations to scan for repos.

**`scanStars`**: Whether to include recent star activity in discovery.

### 7. Scanner Integration

The discovery engine is a new service (`discovery-scanner.ts`) that:
1. Shares the SSH connection pattern from `project-scanner.ts` (batched commands)
2. Uses the same `p-limit(10)` concurrency pattern
3. Runs on its own timer (30 minutes) started alongside the health scan timer in `index.ts`
4. Writes to `discovered_projects` table (not `projects` — only promote does that)
5. Emits `discovery:new` SSE event when new discoveries are found

**Local directory scan:**
```bash
find ~/ -maxdepth 2 -name .git -type d -not -path '*/node_modules/*' -not -path '*/Library/*' -not -path '*/.Trash/*' 2>/dev/null
```

**SSH directory scan (Mac Mini):**
Same command batched into the SSH connection. Uses the `===SECTION===` delimiter pattern from the health scanner.

**GitHub org scan:**
```bash
gh api /orgs/quartermint/repos --paginate --jq '.[].full_name'
gh api /orgs/vanboompow/repos --paginate --jq '.[].full_name'
```

**GitHub star scan:**
```bash
gh api /user/starred?sort=created&per_page=10 --jq '.[] | {full_name: .full_name, description: .description, language: .language, stargazers_count: .stargazers_count}'
```

### 8. Promote Flow (Config Write)

When a user promotes a discovery, MC needs to write to `mc.config.json`. This is the only feature in MC that modifies the config file.

**Write strategy:**
1. Read current `mc.config.json`
2. Parse with Zod (validate current state)
3. Append new project entry to `projects` array
4. Write back with `JSON.stringify(config, null, 2)` (preserve formatting)
5. Emit `config:changed` event so the scanner picks up the new project on next cycle

**Concurrency safety:** Config writes are serialized through a mutex (single writer at a time). The 5-minute scan reads config at cycle start and holds a snapshot — no mid-scan config changes affect the current cycle.

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
