# Stack Research: v1.2 Auto-Discovery + Star Intelligence

**Domain:** Auto-discovery engine (directory scanning, SSH batch scanning, GitHub API, config file mutation) + GitHub star intelligence (star fetching, intent categorization, star list management)
**Researched:** 2026-03-15
**Confidence:** HIGH

## What Already Exists (DO NOT Add)

v1.2 builds on top of a mature codebase. Almost every capability needed is already proven in production.

| Capability | Existing Tech | How v1.2 Uses It |
|-----------|---------------|-----------------|
| Shell command execution | `node:child_process` `execFile` (promisified) | `find` commands for directory scanning, `git log -1`, metadata git commands |
| SSH to Mac Mini | `execFile("ssh", [...])` with batched scripts + `===SECTION===` delimiters | Discovery scan on Mac Mini -- same batch pattern, new `find` commands |
| `gh` CLI via execFile | `execFile("gh", ["api", ...])` in `fetchIsPublic()` + `scanGithubProject()` | GitHub org repos, starred repos, star list management |
| SQLite + Drizzle ORM | `better-sqlite3` 11.10 + `drizzle-orm` 0.38.4 | New `discovered_projects` table, standard migration |
| SSE real-time | `MCEventBus` + Hono streaming | New `discovery:new` event type |
| AI enrichment (Gemini) | `ai` 6.0 SDK + `@ai-sdk/google` 3.0 + `Output.object()` structured output | Tagline generation from README content, same `generateText` pattern |
| Zod schemas | `zod` 3.25.76 | New discovery API request/response schemas |
| React 19 + TanStack Query | Already installed | New hooks for discoveries, discovery cards component |
| Tailwind v4 | Already installed | Discovery card styling |
| `p-limit` | 7.3.0 | Concurrency control for parallel scan sources |
| `nanoid` | 5.1.6 | ID generation if needed for discovery records |
| Config loading | `loadConfig()` with Zod validation in `config.ts` | Read-modify-write for promote flow |
| File I/O | `node:fs` `readFileSync` / `writeFileSync` | Config file mutation on promote |
| Background polling | `setInterval` + `startBackgroundPoll()` pattern | New 30-minute discovery timer alongside 5-minute health timer |
| TTLCache | Custom `TTLCache<T>` class | Can cache discovery scan results between cycles |

**Key insight: v1.2 requires ZERO new npm dependencies.** Every capability needed -- shell execution, SSH, GitHub API via `gh`, file mutation, AI enrichment, database, SSE -- is already in the codebase with proven patterns. The work is entirely new service code using existing infrastructure.

## New Dependencies Required

**None.**

This is a significant finding. The design spec's four major capabilities map entirely to existing patterns:

| v1.2 Capability | Implementation Using | New Dependency? |
|----------------|---------------------|-----------------|
| Local directory scanning | `execFile("find", [...])` | No -- `node:child_process` |
| SSH directory scanning | `execFile("ssh", [host, script])` | No -- same as `scanRemoteProject()` |
| GitHub org repo listing | `execFile("gh", ["api", "/orgs/{org}/repos", ...])` | No -- same as `scanGithubProject()` |
| GitHub star fetching | `execFile("gh", ["api", "/user/starred", ...])` | No -- same `gh api` pattern |
| Config file mutation | `readFileSync` + `writeFileSync` from `node:fs` | No -- stdlib |
| In-process mutex | Promise-chain lock (pure JS) | No -- ~15 lines of code |
| Metadata inference | `readFileSync` for package.json, `execFile("git", ...)` for commit date | No -- stdlib |
| AI tagline generation | `generateText()` + `Output.object()` from `ai` SDK | No -- already installed |
| Star intent categorization | Drizzle ORM insert/update | No -- already installed |
| GitHub star list management | `execFile("gh", ["api", ...])` | No -- same `gh api` pattern |
| Discovery SSE events | `eventBus.emit("mc:event", ...)` | No -- existing `MCEventBus` |

## New Patterns (Not Dependencies)

### 1. Promise-Chain Mutex for Config Writes

The promote flow needs serialized writes to `mc.config.json`. No library needed -- this is a standard JS pattern:

```typescript
// discovery-scanner.ts (module-level)
let configWriteLock = Promise.resolve();

export function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = configWriteLock.then(fn, fn); // run even if previous failed
  configWriteLock = next.then(() => {}, () => {}); // swallow for chain
  return next;
}

// Usage in promote handler:
await withConfigLock(async () => {
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);
  config.projects.push(newEntry);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
});
```

**Why not `async-mutex` or `p-mutex`?** The mutex pattern is 8 lines. Adding a dependency for 8 lines of straightforward code is not justified. The only contention scenario is two simultaneous promote clicks, which the Promise chain handles perfectly.

### 2. Directory Scan via `find` Command

```typescript
// Local scan
const { stdout } = await execFile("sh", ["-c",
  `find ~/ -maxdepth 2 -name .git -type d -not -path '*/node_modules/*' -not -path '*/Library/*' -not -path '*/.Trash/*' 2>/dev/null`
], { timeout: 30_000 });

// SSH scan (batched with other commands)
const sshScript = `find ~/ -maxdepth 2 -name .git -type d -not -path '*/node_modules/*' -not -path '*/Library/*' -not -path '*/.Trash/*' 2>/dev/null`;
```

**Timeout consideration:** `find` on `~/` with `maxdepth 2` completes in <1s on a typical dev machine. The 30s timeout is generous. SSH adds network latency but the command itself is fast.

### 3. GitHub Starred Repos with Timestamps

Verified working on this machine (gh 2.88.0):

```bash
# Fetch 10 most recent stars with timestamps
gh api "/user/starred?sort=created&per_page=10" \
  -H "Accept: application/vnd.github.star+json" \
  --jq '.[] | {full_name: .repo.full_name, description: .repo.description, language: .repo.language, stargazers_count: .repo.stargazers_count, starred_at: .starred_at}'
```

The `application/vnd.github.star+json` media type returns `{starred_at, repo: {...}}` instead of flat repo objects. This is critical for ordering stars by when they were starred.

**In Node.js:**
```typescript
const { stdout } = await execFile("gh", [
  "api", "/user/starred?sort=created&per_page=10",
  "-H", "Accept: application/vnd.github.star+json",
  "--jq", '.[] | {full_name: .repo.full_name, description: .repo.description, language: .repo.language, stargazers_count: .repo.stargazers_count, starred_at: .starred_at}'
], { timeout: GH_TIMEOUT });
```

### 4. GitHub Star Lists API Status

**CRITICAL FINDING: No official GitHub REST API for star lists exists.**

Verified 2026-03-15:
- `gh api /user/lists` returns 404
- GitHub community discussion [#8293](https://github.com/orgs/community/discussions/8293) confirms no API
- Lists are in "public beta" on the web UI but have no REST/GraphQL endpoints
- An [unofficial tool](https://github.com/haile01/github-starred-list) uses undocumented internal APIs

**Impact on v1.2:** The design spec already anticipated this with a fallback strategy:
> "If the Lists API is not available, MC falls back to local-only categorization -- the `starIntent`/`starProject` columns become the primary storage"

**Recommendation:** Build local-only categorization as the primary path. The `starIntent` and `starProject` columns in `discovered_projects` are the source of truth. If GitHub adds a public Lists API in the future, add sync as an enhancement. Do NOT use undocumented internal APIs -- they will break.

### 5. Config Schema Extension

The `mc.config.json` gets a `discovery` section. The Zod schema in `config.ts` extends:

```typescript
const discoveryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  scanDirs: z.array(z.string()).default(["~/"]),
  githubOrgs: z.array(z.string()).default([]),
  scanStars: z.boolean().default(true),
  intervalMinutes: z.number().default(30),
  ignorePaths: z.array(z.string()).default([]),
});

export const mcConfigSchema = z.object({
  projects: z.array(projectConfigEntrySchema),
  dataDir: z.string().default("./data"),
  services: z.array(serviceEntrySchema).default([]),
  macMiniSshHost: z.string().default("ryans-mac-mini"),
  discovery: discoveryConfigSchema.default({}), // NEW
});
```

The `.default({})` ensures backward compatibility -- existing `mc.config.json` files without a `discovery` section get sensible defaults.

### 6. AI Tagline Generation

Reuses the exact same pattern as `ai-categorizer.ts`:

```typescript
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const taglineSchema = z.object({
  tagline: z.string().describe("One-sentence project description, max 80 chars"),
});

export async function generateTagline(readmeContent: string): Promise<string | null> {
  if (!isAIAvailable()) return null;

  const { output } = await generateText({
    model: google(process.env["AI_MODEL"] ?? "gemini-3-flash-preview"),
    output: Output.object({ schema: taglineSchema }),
    prompt: `Generate a concise tagline (max 80 characters) for this project based on its README:\n\n${readmeContent.slice(0, 2000)}`,
  });

  return output?.tagline ?? null;
}
```

Same `generateText` + `Output.object` pattern, same Gemini model, same error handling. No new AI dependencies.

### 7. Metadata Inference Chain

Reading `package.json`, `Cargo.toml`, `go.mod` for project name inference:

```typescript
// Local repos: use readFileSync
function inferNameFromPackageJson(repoPath: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(repoPath, "package.json"), "utf-8"));
    return pkg.name ?? null;
  } catch { return null; }
}

// SSH repos: batch read in the same SSH call
const sshScript = `
  echo "===PKG_JSON==="
  cat package.json 2>/dev/null | head -5
  echo "===CARGO_TOML==="
  head -5 Cargo.toml 2>/dev/null
  echo "===GO_MOD==="
  head -1 go.mod 2>/dev/null
`;
```

**TOML parsing:** For `Cargo.toml`, we only need the `[package] name` field. A regex (`/name\s*=\s*"([^"]+)"/`) is sufficient -- no TOML parser library needed for one field extraction.

## Database Schema Addition

New table using existing Drizzle patterns:

```typescript
export const discoveredProjects = sqliteTable(
  "discovered_projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    host: text("host", { enum: ["local", "mac-mini", "github"] }).notNull(),
    source: text("source", {
      enum: ["directory-scan", "github-org", "github-star"],
    }).notNull(),
    tagline: text("tagline"),
    remoteUrl: text("remote_url"),
    language: text("language"),
    lastActivityAt: text("last_activity_at"),
    status: text("status", {
      enum: ["new", "dismissed", "promoted"],
    }).notNull().default("new"),
    discoveredAt: text("discovered_at").notNull(),
    dismissedAt: text("dismissed_at"),
    previouslyDismissedAt: text("previously_dismissed_at"),
    dismissCount: integer("dismiss_count").notNull().default(0),
    promotedAt: text("promoted_at"),
    starIntent: text("star_intent", {
      enum: ["reference", "try", "tool", "inspiration"],
    }),
    starProject: text("star_project"),
    metadata: text("metadata"), // JSON string
  },
  (table) => [
    index("discovered_status_idx").on(table.status),
    uniqueIndex("discovered_source_host_path_uniq").on(
      table.source, table.host, table.path
    ),
  ]
);
```

Migration file: `0006_discovered_projects.sql`. Standard Drizzle migration.

## Integration Points with Existing Stack

### New Event Types

```typescript
// event-bus.ts -- add to MCEventType union
export type MCEventType =
  | "capture:created"
  | "capture:enriched"
  | "capture:archived"
  | "scan:complete"
  | "health:changed"
  | "copy:diverged"
  | "discovery:new"      // NEW: discoveries found
  | "config:changed";    // NEW: mc.config.json updated via promote
```

### New Background Timer

```typescript
// index.ts -- add alongside existing health scan timer
let discoveryTimer: ReturnType<typeof setInterval> | null = null;

if (config?.discovery?.enabled !== false) {
  const intervalMs = (config?.discovery?.intervalMinutes ?? 30) * 60_000;

  // Initial discovery scan (delayed 30s after startup to let health scan complete first)
  setTimeout(() => {
    runDiscoveryScan(config, db, sqlite).catch(console.error);
  }, 30_000);

  discoveryTimer = setInterval(() => {
    runDiscoveryScan(config, db, sqlite).catch(console.error);
  }, intervalMs);

  console.log(`Discovery scanning started (${config?.discovery?.intervalMinutes ?? 30}-minute interval)`);
}
```

### Config Hot-Reload on Promote

```typescript
// Module-level mutable config reference
let currentConfig: MCConfig = loadConfig();

// After promote writes to mc.config.json:
currentConfig = loadConfig(); // Re-read from disk
eventBus.emit("mc:event", { type: "config:changed", id: "all" });

// Health scan reads currentConfig at cycle start:
scanAllProjects(currentConfig, db, sqlite);
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|------------------------|
| `execFile("find", ...)` | `fast-glob` or `globby` npm packages | If you need complex glob patterns or cross-platform portability. Not needed here -- `find` with `-maxdepth 2 -name .git` is simple, fast, and works on both macOS hosts. |
| Promise-chain mutex | `async-mutex` npm package | If you have complex lock patterns (read-write locks, named locks, tryLock). Overkill for serializing config writes. |
| Regex for Cargo.toml | `@iarna/toml` or `smol-toml` npm packages | If you need to parse full TOML documents. We only extract one field (`name`), making regex adequate. |
| `execFile("gh", ...)` | `@octokit/rest` npm package | If you need fine-grained GitHub API control, automatic pagination, or rate limit handling. The `gh` CLI handles auth, pagination (`--paginate`), and rate limiting transparently. Adding Octokit would duplicate `gh`'s auth management and add ~200KB of dependencies. |
| Local `starIntent` column | Undocumented GitHub internal Lists API | Never. Internal APIs break without notice. When GitHub ships a public Lists API, add sync at that point. |
| `writeFileSync` for config | `atomically` npm package (atomic file writes) | If config corruption from crashes were a real risk. On a single-user system with infrequent writes (promote clicks), the risk is negligible. The mutex ensures no concurrent writes. |

## What NOT to Add

| Temptation | Why Not | Use Instead |
|------------|---------|-------------|
| `@octokit/rest` | `gh` CLI already handles auth, pagination, rate limiting. Adding Octokit duplicates that infrastructure and adds ~200KB. | `execFile("gh", ["api", ...])` -- same pattern already used in `fetchIsPublic()` and `scanGithubProject()` |
| `fast-glob` / `globby` | The directory scan is literally one `find` command with 3 exclusions. A glob library adds complexity for zero benefit. | `execFile("find", [...])` or `execFile("sh", ["-c", "find ..."])` |
| `async-mutex` | The config write mutex is 8 lines of Promise chaining. The npm package is 3KB but adds a dependency for trivial code. | Promise-chain lock pattern (shown above) |
| `@iarna/toml` / `smol-toml` | Only need `name` from `Cargo.toml`. A regex handles this in one line. Full TOML parsing is unnecessary. | `/name\s*=\s*"([^"]+)"/` regex |
| `chokidar` (file watcher) | Discovery runs on a 30-minute timer, not real-time file watching. File watching would detect new repos faster but adds complexity, CPU overhead, and false positives from node_modules churn. | `setInterval` with 30-minute cycle |
| GitHub undocumented Lists API | Internal APIs break without warning. No official endpoints exist for `/user/lists`. | Local `starIntent`/`starProject` columns in `discovered_projects` table |
| `simple-git` | Adds abstraction over 5 lines of `execFile`. Discovery needs specific commands (`find`, `git log -1`, `git remote get-url origin`) that are simpler to call directly. | Direct `execFile("git", [...])` calls |
| `node-cron` | The discovery timer is a simple `setInterval`. `node-cron` adds cron expression parsing for no benefit -- the interval is fixed at 30 minutes. | `setInterval(fn, 30 * 60 * 1000)` |

## Version Compatibility

| Package | Installed Version | Required For v1.2 | Compatible? | Notes |
|---------|-------------------|-------------------|-------------|-------|
| `better-sqlite3` | 11.10.0 | New `discovered_projects` table | Yes | Standard CREATE TABLE, no new SQLite features needed |
| `drizzle-orm` | 0.38.4 | New table definition + queries | Yes | Same `sqliteTable`, `text`, `integer` patterns as existing tables |
| `drizzle-kit` | 0.30.0 | Migration generation | Yes | `drizzle-kit generate` for 0006 migration |
| `ai` (Vercel AI SDK) | 6.0.116 | Tagline generation | Yes | Same `generateText` + `Output.object` pattern as `ai-categorizer.ts` |
| `@ai-sdk/google` | 3.0.43 | Gemini model provider | Yes | Same `google()` model constructor |
| `hono` | 4.12.5 | 5 new API routes | Yes | Same `.get()` / `.post()` route patterns |
| `zod` | 3.25.76 | New schemas for discovery API | Yes | Same `z.object()`, `z.enum()` patterns |
| `p-limit` | 7.3.0 | Parallel scan source execution | Yes | Same `pLimit(10)` pattern |
| `gh` CLI | 2.88.0 | Org repos + starred repos + star lists | Yes | Verified: `gh api /user/starred?sort=created&per_page=10` works with star+json media type |
| Node.js | 22.x | `find` via child_process, fs read/write | Yes | All stdlib APIs used are stable |

## Installation (v1.2 additions)

```bash
# No packages to install. Zero new dependencies.
# All work uses existing packages.

# Generate new migration:
cd packages/api
npx drizzle-kit generate

# The migration file (0006_discovered_projects.sql) will be auto-applied on startup
# via the existing migration runner in db/index.ts
```

## Verified Capabilities (Tested on This Machine)

| Capability | Command Tested | Result | Date |
|-----------|---------------|--------|------|
| `gh` starred with timestamps | `gh api "/user/starred?sort=created&per_page=3" -H "Accept: application/vnd.github.star+json"` | Returns `{starred_at, repo: {...}}` objects | 2026-03-15 |
| `gh` star lists API | `gh api /user/lists` | **404 Not Found** -- no public API exists | 2026-03-15 |
| `gh` version | `gh --version` | 2.88.0 (2026-03-10) | 2026-03-15 |
| Starred repos count | `gh api /user/starred --jq 'length'` | 30 (confirmed access) | 2026-03-15 |

## Sources

- [GitHub REST API - Starring](https://docs.github.com/en/rest/activity/starring) -- Verified `/user/starred` endpoint parameters and star+json media type
- [GitHub Community Discussion #8293](https://github.com/orgs/community/discussions/8293) -- Confirms no public API for star lists
- [GitHub Community Discussion #8618](https://github.com/orgs/community/discussions/8618) -- Lists are public beta, no API
- [GitHub Community Discussion #38693](https://github.com/orgs/community/discussions/38693) -- Additional confirmation of no lists API
- [GitHub Saving with Stars Docs](https://docs.github.com/en/get-started/exploring-projects-on-github/saving-repositories-with-stars) -- Lists feature documentation (web UI only)
- Existing codebase: `project-scanner.ts`, `ai-categorizer.ts`, `enrichment.ts`, `config.ts`, `event-bus.ts`, `cache.ts` -- All patterns verified in production code
- `mc.config.json` -- Current 33-project config structure verified
- `packages/api/package.json` -- Confirmed installed versions of all dependencies

---
*Stack research for: Mission Control v1.2 Auto-Discovery + Star Intelligence*
*Researched: 2026-03-15*
