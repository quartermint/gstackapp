# Technology Stack

**Project:** Mission Control v1.3 — Auto-Discovery + Session Enrichment + CLI
**Researched:** 2026-03-16

## Existing Stack (DO NOT RE-ADD)

Already installed and validated in v1.0/v1.1/v1.2:

| Technology | Version | Purpose |
|------------|---------|---------|
| Hono | ^4.6.0 | API framework |
| better-sqlite3 | ^11.7.0 | SQLite driver |
| Drizzle ORM | ^0.38.0 | Schema + migrations + queries |
| React 19 | ^19.0.0 | Dashboard UI |
| Vite 6 | ^6.0.0 | Build + dev server |
| Tailwind v4 | ^4.0.0 | Styling |
| ai (Vercel AI SDK) | ^6.0.116 | AI model abstraction |
| @ai-sdk/google | ^3.0.43 | Gemini provider for captures |
| @modelcontextprotocol/sdk | ^1.27.1 | MCP server |
| Zod | ^3.24.0 | Schema validation |
| nanoid | ^5.0.0 | ID generation |
| p-limit | ^7.3.0 | Concurrency control |
| open-graph-scraper | ^6.11.0 | Link enrichment |
| Vitest | ^2.1.0 | Testing |
| tsup | ^8.0.0 | MCP bundling |
| Turbo | ^2.3.0 | Monorepo orchestration |
| cmdk | ^1.1.1 | Command palette |
| hono/client (hc) | (bundled) | Typed RPC client |

## New Dependencies

### 1. CLI Framework: Commander.js

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| commander | ^13.1.0 | CLI argument parsing, subcommands | Most mature Node.js CLI framework. 500M+ weekly downloads. ESM-native. TypeScript declarations built in. Simple programmatic API fits MC's small command surface (`capture`, `status`, `projects`). |

**Confidence:** HIGH -- Commander is the de facto standard for Node.js CLIs.

**Why Commander over alternatives:**

| Alternative | Why Not |
|-------------|---------|
| citty (UnJS) | 45KB, elegant API, but only 0.x releases. Not battle-tested enough for a "last environment" tool. |
| yargs | Heavier API surface, chainable builder pattern adds complexity for a 3-command CLI. |
| oclif (Heroku) | Enterprise-grade plugin architecture -- overkill for a personal CLI with 3 commands. |
| cac | Lighter than Commander, but far smaller community. |
| Raw `node:util.parseArgs` | Sufficient for trivial CLIs but no subcommand routing, no auto-help generation, no typed options. Would require building what Commander already provides. |

**Setup:**

```typescript
// packages/cli/src/index.ts
import { Command } from "commander";
import { hc } from "hono/client";
import type { AppType } from "@mission-control/api";

const program = new Command()
  .name("mc")
  .description("Mission Control CLI")
  .version("0.1.0");

const client = hc<AppType>("http://100.123.8.125:3000");

program
  .command("capture <text>")
  .description("Capture a thought")
  .action(async (text: string) => {
    const res = await client.api.captures.$post({ json: { rawContent: text } });
    const data = await res.json();
    console.log(`Captured: ${data.id}`);
  });
```

**Key integration point:** The CLI reuses the same `hc<AppType>` typed RPC client the dashboard uses. Zero type drift between CLI and API. When new routes are added, the CLI gets type-safe access immediately.

### 2. No Other New npm Dependencies Needed

Everything else builds on existing infrastructure plus Node.js built-ins:

| Capability | Implementation | How |
|------------|---------------|-----|
| **Filesystem repo discovery** | Node.js `fs.readdir` with `{ recursive: true }` | Native in Node 22.x. Walk `~/` to maxDepth 3, filter for `.git` dirs. No `fast-glob` or `globby` needed. |
| **SSH repo discovery** | `child_process.execFile("ssh", ...)` | Already proven in `project-scanner.ts` for Mac Mini scanning. Reuse exact same pattern with `find -maxdepth 3 -name .git -type d`. |
| **GitHub stars API** | `child_process.execFile("gh", ...)` | Already using `gh api` in `fetchIsPublic()` and `scanGithubProject()`. Add `gh api --paginate user/starred --slurp -H "Accept: application/vnd.github.star+json"` for stars with timestamps. |
| **GitHub org repo listing** | `child_process.execFile("gh", ...)` | `gh api --paginate orgs/{org}/repos --jq '.[].full_name'` -- same pattern as existing GitHub scanning. |
| **Star intent categorization** | `ai` SDK + `@ai-sdk/google` | Same `generateText()` + `Output.object()` pattern as capture categorization. Structured output with Zod schema. |
| **Convergence detection** | Git commit comparison in session data | Compare HEAD commits across active sessions on same project. Detect when parallel branches are ready to merge. Uses existing `execFile("git", ...)` pattern. |
| **Session MCP tools** | `@modelcontextprotocol/sdk` | Add `session_status` and `session_conflicts` tools to existing MCP server. |
| **Session replay data** | SQLite queries | Session table already has `startedAt`, `endedAt`, `filesJson`, `taskDescription`. Timeline visualization is a frontend concern. |
| **CLI offline queue** | Node.js `fs.writeFileSync` | Write to `~/.mc/queue.jsonl` when API unreachable. Flush on next successful connection. No database needed for a JSONL append log. |
| **Discovery state storage** | better-sqlite3 + Drizzle | New tables: `discoveries`, `github_stars`. Same patterns as existing tables. |
| **Discovery events** | `MCEventBus` | Add event types: `discovery:found`, `star:synced`. Same SSE pipeline. |

## New Package: `@mission-control/cli`

The CLI ships as a new package in the monorepo:

```
packages/cli/
  package.json
  tsconfig.json
  src/
    index.ts          # Entry point, commander setup
    commands/
      capture.ts      # mc capture "thought"
      status.ts       # mc status [project]
      projects.ts     # mc projects [--format json]
    lib/
      client.ts       # hc<AppType> wrapper with base URL config
      queue.ts        # Offline capture queue (~/.mc/queue.jsonl)
      config.ts       # ~/.mc/config.json (API URL, etc.)
```

**package.json:**

```json
{
  "name": "@mission-control/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "mc": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@mission-control/api": "workspace:^",
    "commander": "^13.1.0",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Bundle with tsup** (same as MCP package) for a single-file executable. The `bin.mc` entry lets `pnpm link --global` install the `mc` command system-wide.

## GitHub Stars API Integration

The `gh` CLI (v2.88.0, confirmed installed) handles authentication and pagination natively. No need for `@octokit/rest` or direct REST calls.

**Verified command** (tested on this machine):

```bash
# Returns starred_at timestamp + full repo metadata
gh api --paginate user/starred \
  --slurp \
  -H "Accept: application/vnd.github.star+json" \
  --jq '.[] | {
    starred_at: .starred_at,
    name: .repo.full_name,
    description: .repo.description,
    language: .repo.language,
    topics: .repo.topics,
    stars: .repo.stargazers_count,
    url: .repo.html_url
  }'
```

**Available fields per star** (verified):
- `starred_at` -- ISO timestamp of when the repo was starred
- `repo.full_name` -- "owner/name"
- `repo.description` -- README-level description
- `repo.language` -- Primary language
- `repo.topics` -- Array of topic tags
- `repo.stargazers_count` -- Star count
- `repo.html_url` -- Web URL
- `repo.license` -- License info

**Intent categorization** reuses the existing AI categorizer pattern:

```typescript
const starIntentSchema = z.object({
  intent: z.enum(["reference", "try", "tool", "inspiration", "archive"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedTags: z.array(z.string()).max(3),
});
```

This uses the same `generateText()` + `Output.object()` pattern as `ai-categorizer.ts`. No new AI dependency.

## Filesystem Discovery Architecture

**Node.js version:** 22.22.0 (confirmed). `fs.readdir({ recursive: true })` is stable.

**Discovery approach:** NOT a full recursive walk. Instead, a bounded search:

```typescript
import { readdir } from "node:fs/promises";
import { join } from "node:path";

async function discoverGitRepos(
  rootDirs: string[],
  maxDepth: number = 3
): Promise<string[]> {
  const repos: string[] = [];

  for (const root of rootDirs) {
    // Use opendir for streaming (memory-efficient)
    // Check each entry at depth <= maxDepth for .git
    await walkForGitDirs(root, maxDepth, repos);
  }

  return repos;
}
```

**Why maxDepth 3:** Tested on this machine -- `find ~ -maxdepth 3 -name .git -type d` finds 57 repos in 1.8 seconds. Deeper walks hit `node_modules`, `.Trash`, and other noise. Depth 3 catches `~/project/.git`, `~/org/project/.git`, and `~/Developer/org/project/.git`.

**Why native readdir over fast-glob:** The search pattern is not a glob -- it's "find directories named .git within N levels." A manual depth-limited walk with `fs.opendir()` is simpler, has zero dependencies, and avoids the known issues with fast-glob's `**` matching semantics differing from bash.

**SSH discovery** uses the existing SSH pattern from `scanRemoteProject()`:

```typescript
const script = `find /Users/ryanstern -maxdepth 3 -name .git -type d 2>/dev/null`;
const result = await execFile("ssh", ["-o", "ConnectTimeout=5", sshHost, script], {
  timeout: SSH_TIMEOUT,
});
```

This reuses the exact SSH infrastructure from `project-scanner.ts` -- same host, same timeout, same error handling.

**GitHub org discovery** adds repos not on disk:

```typescript
const orgs = ["quartermint", "vanboompow"]; // from config
for (const org of orgs) {
  const result = await execFile("gh", [
    "api", "--paginate", `orgs/${org}/repos`,
    "--jq", ".[].full_name"
  ], { timeout: GH_TIMEOUT });
  // Compare against mc.config.json to find untracked repos
}
```

## Session Convergence Detection

No new dependencies needed. Convergence detection watches for:

1. **Same-project parallel sessions ending** -- when two sessions on the same project both complete, check if their file sets overlap and both committed
2. **Branch divergence resolution** -- reuse existing `checkAncestry()` from `project-scanner.ts` to detect when parallel branches become mergeable
3. **Activity quiescence** -- when all sessions on a project go idle, signal "work may be ready to review"

Implementation reuses:
- `sessions` table (status tracking, file lists)
- `conflict-detector.ts` (file overlap detection)
- `checkAncestry()` (git merge-base analysis)
- `MCEventBus` (new event type: `session:converged`)

## MCP Session Tools

Two new tools added to existing MCP server:

```typescript
// session_status -- query active/recent sessions
registerSessionStatus(server);  // GET /api/sessions -> formatted text

// session_conflicts -- check for file conflicts
registerSessionConflicts(server);  // GET /api/risks?type=session_file_conflict -> formatted text
```

These are thin HTTP wrappers over existing API endpoints -- same pattern as `project-health.ts`, `project-risks.ts`, etc. No new MCP SDK features needed.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CLI framework | commander (^13.1.0) | citty (UnJS) | 0.x releases, smaller community, not battle-tested for "last environment" |
| CLI framework | commander | raw `node:util.parseArgs` | No subcommand routing, no auto-help, would rebuild what Commander provides |
| CLI bundler | tsup (already in repo) | esbuild directly | tsup already used for MCP package, consistent tooling |
| Filesystem walk | Node.js native `fs.readdir` | fast-glob / globby | Not a glob pattern; bounded depth walk is simpler with native API. Zero deps. |
| GitHub API client | `gh` CLI via `execFile` | @octokit/rest | `gh` handles auth, pagination, already proven in codebase. @octokit adds 15+ transitive deps. |
| GitHub API client | `gh` CLI via `execFile` | Direct `fetch()` to api.github.com | Would need to manage auth tokens, pagination, rate limiting manually. `gh` does all of this. |
| Star categorization | Gemini via existing AI SDK | Local LM Studio | Stars are batch-processed (not latency-sensitive). Gemini structured output is proven. Local model reserved for real-time session enrichment later. |
| Offline CLI queue | JSONL file (`~/.mc/queue.jsonl`) | SQLite on client | CLI should be stateless and lightweight. A 0-dep append log is simpler than shipping sqlite3 in the CLI binary. |
| CLI API client | Hono hc<AppType> RPC | Raw fetch() | Type-safe API calls with zero drift. Same pattern as dashboard. CLI gets type errors at compile time when API changes. |

## Configuration Changes

### mc.config.json Additions

```json
{
  "discovery": {
    "localDirs": ["/Users/ryanstern"],
    "maxDepth": 3,
    "excludePatterns": ["node_modules", ".Trash", "Library", ".cache"],
    "githubOrgs": ["quartermint", "vanboompow"],
    "intervalMs": 3600000
  }
}
```

**Why in mc.config.json (not a new file):** Discovery config is project-level configuration, same as `macMiniSshHost` and `lmStudio`. Keeps one config file to manage.

**Discovery interval:** 1 hour (3600000ms) vs 5 minutes for regular scans. Discovery is expensive (filesystem walk + SSH + GitHub API). Once-an-hour is sufficient since new repos don't appear frequently.

### CLI User Config

```json
// ~/.mc/config.json
{
  "apiUrl": "http://100.123.8.125:3000",
  "defaultProject": null
}
```

Minimal. The CLI is a thin client; all intelligence lives in the API.

## Installation

```bash
# CLI framework (new package)
pnpm --filter @mission-control/cli add commander

# Hono for RPC client (CLI needs it)
pnpm --filter @mission-control/cli add hono

# API workspace reference (for types)
pnpm --filter @mission-control/cli add @mission-control/api@workspace:^

# Dev deps (new package)
pnpm --filter @mission-control/cli add -D tsup tsx typescript vitest

# Link CLI globally for `mc` command
cd packages/cli && pnpm link --global
```

**Total new npm dependencies: 1** (commander). Everything else is workspace refs or already in the repo.

## What NOT to Add

| Temptation | Why Skip It |
|------------|------------|
| `@octokit/rest` | `gh` CLI handles auth, pagination, rate limiting. Adding octokit brings 15+ transitive deps for zero benefit. |
| `fast-glob` / `globby` | Not globbing. Bounded depth walk with native `fs.readdir` is simpler and dep-free. |
| `chokidar` / file watcher | Discovery runs on a timer (1hr). No need for real-time filesystem watching. |
| `ink` / React CLI renderer | MC CLI outputs plain text. No TUI needed for `mc capture` and `mc status`. |
| `chalk` / `picocolors` | Node.js has `node:util.styleText` since v21.7. Or just use ANSI escape codes directly. Coloring 3 commands doesn't justify a dependency. |
| `conf` / `configstore` | CLI config is a single JSON file. `fs.readFileSync` + `JSON.parse` is sufficient. |
| `ora` / spinners | CLI commands complete in <1s (single API call). No loading state needed. |
| `inquirer` / prompts | CLI is non-interactive by design. Fire-and-forget from terminal. |
| `keytar` / secure storage | No auth in v1. API URL is the only config. |
| `socket.io` / `ws` | SSE is already the real-time mechanism. CLI doesn't need real-time. |
| `node-cron` | Discovery timer uses `setInterval` -- same pattern as existing scan timer. |
| `@ai-sdk/openai-compatible` | Already added in v1.2 for LM Studio. No change needed. |
| TanStack Query | CLI makes one-shot API calls. No caching/refetching needed. |

## Sources

- [GitHub REST API -- Starring endpoints](https://docs.github.com/en/rest/activity/starring) -- `user/starred` with `star+json` media type
- [GitHub starred timestamps](https://dannguyen.github.io/til/posts/github-starred-timestamps) -- `application/vnd.github.star+json` returns `starred_at`
- [gh api manual](https://cli.github.com/manual/gh_api) -- `--paginate`, `--slurp`, `--jq` flags
- [Commander.js GitHub](https://github.com/tj/commander.js) -- ESM support, TypeScript declarations
- [Commander.js extra-typings](https://github.com/commander-js/extra-typings) -- Enhanced TypeScript inference
- [Node.js fs.readdir recursive PR](https://github.com/nodejs/node/pull/41439) -- Native recursive option (stable in Node 22)
- [Node.js File System docs](https://nodejs.org/api/fs.html) -- `readdir({ recursive: true })` API
- [parallel-cc](https://github.com/frankbria/parallel-cc) -- Parallel Claude Code session management patterns
- [Hono RPC docs](https://hono.dev/docs/guides/rpc) -- `hc<AppType>` typed client
- [citty (UnJS)](https://github.com/unjs/citty) -- Evaluated but not selected

---
*Researched: 2026-03-16*
