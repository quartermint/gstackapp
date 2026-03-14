# Technology Stack (v1.1 Additions)

**Project:** Mission Control v1.1 -- Git Health Intelligence + MCP
**Researched:** 2026-03-14
**Scope:** NEW dependencies and patterns only. See v1.0 STACK.md (2026-03-09) for base stack.

## What Already Exists (DO NOT Add)

These capabilities are already in the codebase and cover most of v1.1's needs:

| Capability | Existing Tech | How v1.1 Uses It |
|-----------|---------------|-----------------|
| Git command spawning | `node:child_process` `execFile` (promisified) | Health checks run ~5 git commands per repo, same pattern as `scanProject()` |
| SSH to Mac Mini | `execFile("ssh", [...])` in `scanRemoteProject()` | Multi-host scanning already batches commands over SSH with 20s timeout |
| SQLite + Drizzle ORM | `better-sqlite3` + `drizzle-orm` 0.38+ | New `project_health` and `project_copies` tables, standard schema migration |
| SSE real-time | `eventBus.emit()` + Hono streaming helper | New event types (`health:changed`, `copy:diverged`) added to existing `MCEventType` |
| Zod schemas | `zod` 3.25.76 | New API response schemas for health/copies/risks endpoints |
| React 19 + TanStack Query | Already installed | New hooks for health data, risk feed component, timeline component |
| Tailwind v4 | Already installed | Styling for risk feed cards, health dots, timeline bars |
| Vitest | Already installed | Unit tests for health engine, copy discovery, API routes |
| `gh` CLI | Used in `scanGithubProject()` | Public repo detection via `gh api repos/{owner}/{repo} --jq .private` |

**Key insight:** v1.1 requires almost zero new dependencies on the API side. The git health engine is pure Node.js standard library (`child_process`) extending the existing scanner. The MCP server is the only genuinely new package.

## New Dependencies

### MCP Server Package (`@mission-control/mcp`)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `@modelcontextprotocol/sdk` | ^1.27.0 | MCP server SDK | Official TypeScript SDK. Provides `McpServer` class, `StdioServerTransport`, and tool registration with Zod schemas. The MCP server is a thin process that calls the MC API -- it does not embed scanning logic. | HIGH |
| `zod` | ^3.25.0 | Schema validation (peer dep) | Required peer dependency of the MCP SDK. Already at 3.25.76 in the workspace -- pnpm will hoist the existing version. No version conflict. | HIGH |

**Architecture decision: Separate stdio process, not embedded in Hono.**

The design spec mandates the MCP server runs on the **MacBook** (where Claude Code runs) and connects to the MC API on the **Mac Mini** over HTTP. This means:

- **Transport:** `StdioServerTransport` (Claude Code spawns the process via stdio)
- **NOT** `@hono/mcp` (which embeds MCP into the Hono server on the Mac Mini)
- The MCP server is an API **client**, not an extension of the API server

`@hono/mcp` (v0.2.4) exists and would allow serving MCP from within the Hono app over Streamable HTTP. **Do not use it** -- it's the wrong architecture. The MCP server needs to run locally on the MacBook for Claude Code integration. If a future need arises to expose MCP over HTTP from the Mac Mini, `@hono/mcp` becomes relevant then.

**Zod compatibility note:** The MCP SDK v1.27 internally imports from `zod/v4` but maintains backwards compatibility with Zod v3.25+. The workspace uses Zod 3.25.76, which falls within the compatible range. No Zod upgrade needed. If upgrading to Zod v4 later, the MCP SDK will work seamlessly.

#### MCP Server Pattern

```typescript
// packages/mcp/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "mission-control",
  version: "1.1.0",
});

// Register tools -- each tool calls the MC API as a client
server.tool(
  "project_risks",
  "Active problems across all projects, filtered by severity",
  { severity: z.enum(["critical", "warning", "all"]).optional() },
  async ({ severity }) => {
    const res = await fetch(`${MC_API_URL}/api/risks?severity=${severity ?? "all"}`);
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Package Structure

```
packages/mcp/
  package.json          # @mission-control/mcp
  tsconfig.json
  src/
    index.ts            # Entry point, server creation + transport
    tools/
      project-health.ts # project_health tool
      project-risks.ts  # project_risks tool
      project-detail.ts # project_detail tool
      sync-status.ts    # sync_status tool
    lib/
      api-client.ts     # fetch wrapper for MC API calls
```

### Sprint Timeline (Frontend)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Custom SVG + React | n/a (no library) | Swimlane chart | The sprint timeline is a simple horizontal bar chart: X-axis = days, Y-axis = projects, bars colored by commit density. This is ~100 lines of SVG/JSX. Adding a charting library (Recharts, Victory, Chart.js) for one component would be absurd -- they're 50-200KB+ each. | HIGH |

**Why no charting library:**

The sprint timeline spec is simple:
- Horizontal bars per project
- Segments colored by commit density (light to saturated)
- Hover for commit count + date range
- Click to navigate to project

This is a straightforward SVG `<rect>` for each segment with CSS colors from the existing Tailwind palette. The existing heatmap (`heatmap-grid.tsx` + `heatmap-cell.tsx`) is already pure JSX/CSS with zero charting deps -- the timeline follows the same pattern.

If a charting library were needed (it isn't), the choice would be:
- **Recharts** (2.15+, ~150KB): Most popular React charting, good for standard charts
- **Lightweight alternatives**: visx (Airbnb's D3 + React primitives) is lower-level but still overkill here

**Custom SVG approach:**

```typescript
// Simplified sprint timeline bar rendering
function TimelineBar({ segments, yOffset }: { segments: Segment[]; yOffset: number }) {
  return (
    <g transform={`translate(0, ${yOffset})`}>
      {segments.map((seg) => (
        <rect
          key={seg.startDate}
          x={dateToX(seg.startDate)}
          width={dateToX(seg.endDate) - dateToX(seg.startDate)}
          y={0}
          height={BAR_HEIGHT}
          rx={3}
          fill={densityToColor(seg.density)}
        />
      ))}
    </g>
  );
}
```

### API Client for MCP Package

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Native `fetch` | Node.js 22 built-in | HTTP client for MCP -> API calls | Node.js 22 (the current runtime) has stable global `fetch`. No need for `axios`, `undici`, or `got`. The MCP server makes simple GET requests to the MC API. | HIGH |

**Why native fetch:** The MCP server makes 4 types of GET requests to well-defined API endpoints. There's no auth, no complex headers, no retry logic needed (the MCP server returns whatever the API returns). `fetch` is already global in Node.js 22.

## Database Schema Additions

No new dependencies needed. These use existing `drizzle-orm` + `better-sqlite3`.

### New Tables

```typescript
// packages/api/src/db/schema.ts additions

export const projectHealth = sqliteTable(
  "project_health",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectSlug: text("project_slug").notNull(),
    checkType: text("check_type", {
      enum: ["unpushed", "no_remote", "broken_tracking", "remote_gone",
             "unpulled", "dirty_working_tree", "diverged_copies"],
    }).notNull(),
    severity: text("severity", { enum: ["info", "warning", "critical"] }).notNull(),
    detail: text("detail").notNull(),
    metadata: text("metadata"),  // JSON string
    detectedAt: text("detected_at").notNull(),  // ISO timestamp
    resolvedAt: text("resolved_at"),  // ISO timestamp, null if active
  },
  (table) => [
    index("project_health_slug_check_resolved_idx").on(
      table.projectSlug, table.checkType, table.resolvedAt
    ),
  ]
);

export const projectCopies = sqliteTable(
  "project_copies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectSlug: text("project_slug").notNull(),
    host: text("host", { enum: ["local", "mac-mini"] }).notNull(),
    path: text("path").notNull(),
    remoteUrl: text("remote_url"),
    headCommit: text("head_commit"),
    branch: text("branch"),
    isPublic: integer("is_public"),  // 1 = public, 0 = private, null = unknown
    lastCheckedAt: text("last_checked_at"),  // ISO timestamp
  },
  (table) => [
    uniqueIndex("project_copies_slug_host_uniq").on(table.projectSlug, table.host),
    index("project_copies_remote_url_idx").on(table.remoteUrl),
  ]
);
```

### Migration

New SQL migration file: `0005_git_health.sql`. Standard Drizzle migration -- `drizzle-kit generate` from the updated schema, then applied on API startup.

## Integration Points with Existing Stack

### Scanner Extension

The health engine extends `project-scanner.ts`, not replaces it. After the existing `scanProject()` / `scanRemoteProject()` calls, a new `runHealthChecks()` function runs additional git commands using the same `execFile` pattern:

```typescript
// New git commands for health checks (all use existing execFile pattern)
const healthCommands = {
  unpushed: ["git", ["rev-list", "@{u}..HEAD", "--count"]],
  remotes: ["git", ["remote", "-v"]],
  tracking: ["git", ["rev-parse", "--abbrev-ref", "@{u}"]],
  statusBranch: ["git", ["status", "-sb"]],  // for [gone] detection
  unpulled: ["git", ["rev-list", "HEAD..@{u}", "--count"]],
  mergeBase: ["git", ["merge-base", "--is-ancestor", "<hash>", "HEAD"]],
};
```

These run in parallel per repo via `Promise.allSettled`, matching the existing scan pattern. Total added wall-clock time: ~1-2s for local repos, bounded by existing SSH timeout for remote.

### SSH Multi-Host Scanning

The existing `scanRemoteProject()` already batches git commands into a single SSH call. For health checks on Mac Mini repos, the same pattern applies -- batch all health-check commands into one SSH script:

```typescript
const healthScript = [
  `cd "${path}" 2>/dev/null || exit 1`,
  `echo "===REMOTES==="`,
  `git remote -v 2>/dev/null`,
  `echo "===TRACKING==="`,
  `git rev-parse --abbrev-ref @{u} 2>/dev/null || echo "NO_TRACKING"`,
  `echo "===UNPUSHED==="`,
  `git rev-list @{u}..HEAD --count 2>/dev/null || echo "0"`,
  `echo "===HEAD==="`,
  `git rev-parse HEAD 2>/dev/null`,
].join(" && ");
```

No additional SSH connections needed -- health data can be collected in the same SSH call as the existing scan data.

### Event Bus

New event types added to the existing `MCEventType` union:

```typescript
// In event-bus.ts
type MCEventType =
  | "scan:complete"
  | "capture:created"
  // ... existing types
  | "health:changed"    // NEW: health findings added/resolved
  | "copy:diverged";    // NEW: multi-copy divergence detected
```

Frontend `useSSE` hook already listens for events and invalidates TanStack Query caches. New event types trigger re-fetch of health/risk data.

### Config Schema Extension

The existing `projectEntrySchema` in `packages/api/src/lib/config.ts` stays unchanged. A new `multiCopyEntrySchema` is added using `z.union()`:

```typescript
const multiCopyEntrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  tagline: z.string().optional(),
  copies: z.array(z.object({
    host: z.enum(["local", "mac-mini"]),
    path: z.string(),
  })),
});

const configEntrySchema = z.union([projectEntrySchema, multiCopyEntrySchema]);
```

Existing single-host configs continue working without modification.

## What NOT to Add

| Temptation | Why Not |
|------------|---------|
| `@hono/mcp` | Wrong architecture. MCP server runs on MacBook (stdio), not embedded in Hono on Mac Mini. |
| Recharts / Victory / Chart.js | One simple chart does not justify 50-200KB+ of charting library. Custom SVG is ~100 lines. |
| `axios` / `got` / `node-fetch` | Node.js 22 has stable global `fetch`. MCP server makes simple GET requests. |
| `ssh2` (npm package) | Already using `execFile("ssh", [...])` which works perfectly. `ssh2` is a pure-JS SSH client -- useful for connection pooling or interactive sessions, neither of which is needed here. |
| `simple-git` | Wraps git CLI with a nicer API, but adds abstraction over what's already 5 lines of `execFile`. The health checks need specific commands and exit code handling that `simple-git` would obscure. |
| Any new test framework | Vitest handles everything. Component tests for timeline use existing `@testing-library/react`. |
| D3.js | Massive (230KB+), imperative API, wrong paradigm for React. The timeline is declarative SVG. |
| `@tanstack/react-charts` | Still in early development, API unstable. Custom SVG is more reliable for this specific visualization. |

## Installation (v1.1 additions only)

```bash
# MCP server package (new package in monorepo)
cd packages/mcp
pnpm init
pnpm add @modelcontextprotocol/sdk zod
pnpm add -D typescript tsx

# API package -- no new dependencies needed
# Web package -- no new dependencies needed
```

## Package.json for @mission-control/mcp

```json
{
  "name": "@mission-control/mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "mc-mcp": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

## Claude Code MCP Config (after deployment)

```json
{
  "mcpServers": {
    "mission-control": {
      "command": "node",
      "args": ["/Users/ryanstern/mission-control/packages/mcp/dist/index.js"],
      "env": {
        "MC_API_URL": "http://100.x.x.x:3000"
      }
    }
  }
}
```

This replaces the existing `portfolio-dashboard` entry (which is a Python MCP server).

## Version Verification

| Package | Version | Verified Via | Date | Confidence |
|---------|---------|-------------|------|------------|
| `@modelcontextprotocol/sdk` | 1.27.1 (latest) | [npm registry](https://www.npmjs.com/package/@modelcontextprotocol/sdk), [GitHub releases](https://github.com/modelcontextprotocol/typescript-sdk/releases) | 2026-03-14 | HIGH |
| `zod` | 3.25.76 (installed) | pnpm workspace, compatible with MCP SDK | 2026-03-14 | HIGH |
| `@hono/mcp` | 0.2.4 (NOT USED) | [npm](https://www.npmjs.com/package/@hono/mcp), [GitHub](https://github.com/honojs/middleware/tree/main/packages/mcp) | 2026-03-14 | HIGH |
| Node.js | 22.22.0 (runtime) | `node --version` on host | 2026-03-14 | HIGH |

## Sources

- [MCP TypeScript SDK - GitHub](https://github.com/modelcontextprotocol/typescript-sdk) - Official SDK repository, v1.x branch
- [MCP TypeScript SDK - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Package registry, v1.27.1
- [MCP TypeScript SDK Docs](https://ts.sdk.modelcontextprotocol.io/) - Server creation, transport options, tool registration
- [MCP SDK Server Guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) - McpServer class API, StdioServerTransport
- [@hono/mcp - GitHub](https://github.com/honojs/middleware/tree/main/packages/mcp) - Hono MCP middleware (evaluated, not used)
- [Zod v3/v4 Compatibility Issue](https://github.com/modelcontextprotocol/typescript-sdk/issues/925) - SDK supports Zod 3.25+
- [Build React Charts Without a Library](https://dev.to/edbentley/build-your-react-charts-without-a-library-35o8) - Custom SVG chart patterns
- [MCP Server Building Guide](https://dev.to/shadid12/how-to-build-mcp-servers-with-typescript-sdk-1c28) - TypeScript MCP server tutorial
- [Node.js child_process docs](https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback) - execFile API reference
