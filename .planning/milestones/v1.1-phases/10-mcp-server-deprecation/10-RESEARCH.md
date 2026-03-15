# Phase 10: MCP Server & Portfolio-Dashboard Deprecation - Research

**Researched:** 2026-03-15
**Domain:** MCP TypeScript SDK, stdio server architecture, Claude Code integration, portfolio-dashboard migration
**Confidence:** HIGH

## Summary

Phase 10 builds a new `@mission-control/mcp` package in the pnpm monorepo that exposes 4 tools (project_health, project_risks, project_detail, sync_status) as a stdio MCP server for Claude Code. The server is a thin HTTP client calling the existing MC API routes -- it imports nothing from `@mission-control/api` or `@mission-control/shared`. A session startup hook integration surfaces critical risks after the worklog digest. After validation, portfolio-dashboard is replaced and archived on GitHub.

The existing MC API already provides all the data endpoints needed (GET /api/risks, GET /api/health-checks, GET /api/projects/:slug, GET /api/copies, GET /api/sprint-timeline). The MCP server is purely a translation layer: fetch from API, format as MCP tool results. The `@modelcontextprotocol/sdk` v1.27.1 provides `McpServer` and `StdioServerTransport` with a clean TypeScript API using Zod schemas for tool input validation.

**Primary recommendation:** Build the MCP package with native fetch (Node 22), bundle with tsup for standalone execution, register 4 tools via `server.registerTool()`, and configure Claude Code via `claude mcp add` with `--scope user`. The session startup hook is a shell script in `~/.claude/hooks/` that calls the MC API directly (not MCP) for speed and simplicity.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Risks appear AFTER worklog in session startup -- worklog provides session context first, then risks section follows with labeled header
- Critical risks listed individually, warnings summarized -- format: individual critical risk lines, then `+ N warnings (see dashboard)`. Avoids noise from 10+ dirty-tree warnings while ensuring critical items are visible.
- Zero noise when all projects healthy (no risks section at all)
- Direct swap -- build MC MCP, test it once, swap the Claude Code MCP config, archive portfolio-dashboard. No parallel-run period. If something breaks, revert config.
- Archive on GitHub -- set portfolio-dashboard repo to archived (read-only, accessible for reference, can unarchive if needed). Don't delete.

### Claude's Discretion
- MCP tool response format details (follow spec examples)
- Error handling for API unreachable (try/catch all fetch, return errors as MCP content not exceptions)
- stdout pollution prevention (redirect console to stderr before any imports)
- Bundle approach for standalone execution (tsup recommended by research)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MCP-01 | @mission-control/mcp package with stdio transport for Claude Code integration | MCP SDK `McpServer` + `StdioServerTransport` API documented; pnpm workspace pattern established by existing packages; tsup bundling for standalone CLI |
| MCP-02 | project_health tool returns full health report across all projects | Maps to GET /api/health-checks + GET /api/projects (healthScore, riskLevel, copyCount enrichment) |
| MCP-03 | project_risks tool returns active problems filtered by severity | Maps to GET /api/risks (already returns critical/warning groups with riskCount and summary) |
| MCP-04 | project_detail tool returns deep status for one project | Maps to GET /api/projects/:slug + GET /api/health-checks/:slug + GET /api/copies/:slug |
| MCP-05 | sync_status tool returns sync report (unpushed, no remote, diverged, broken tracking) | Maps to GET /api/health-checks?severity=critical + GET /api/copies (filter sync-related checkTypes) |
| MCP-06 | Session startup hook surfaces critical risks in banner | Shell hook in ~/.claude/hooks/ calling MC API /api/risks directly; formats per locked decision |
| MIGR-01 | All portfolio-dashboard tool capabilities mapped to MC MCP equivalents | Complete mapping documented: portfolio_status->project_health, project_detail->project_detail, activity_timeline->project_health, find_uncommitted->project_risks, sprint_history->project_detail |
| MIGR-02 | Claude Code MCP config updated to point to new server | `claude mcp add --scope user` with stdio transport pointing to bundled/tsx entry point |
| MIGR-03 | portfolio-dashboard repo archived | `gh repo edit quartermint/portfolio-dashboard --archived` after validation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | 1.27.1 | MCP server framework (McpServer, StdioServerTransport) | Official TypeScript SDK, actively maintained, used by all TS MCP servers |
| zod | ^3.24.0 | Tool input schema validation | Required peer dependency of MCP SDK; already used throughout monorepo |
| Node.js native fetch | 22.x built-in | HTTP client for MC API calls | No additional dependency; Node 22 has stable fetch; MC runs on Node 22 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsup | ^8.x | Bundle TypeScript to standalone JS for MCP execution | Build step for the MCP package; produces single dist/index.js |
| typescript | ^5.7.0 | Type checking (matches monorepo) | Development only |
| vitest | ^2.1.0 | Testing (matches monorepo) | Unit tests for tool handlers and response formatting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsup bundle | tsx runtime | tsx requires tsx installed globally; tsup produces standalone JS that node can run directly. tsup is cleaner for MCP stdio servers. |
| Native fetch | undici/axios | Unnecessary dependency; Node 22 fetch is stable and sufficient for simple GET requests |
| Separate repo | Monorepo package | Monorepo keeps everything together; MCP package is lightweight and shares no code with API |

**Installation:**
```bash
cd packages/mcp
pnpm add @modelcontextprotocol/sdk@^1.27.1 zod@^3.24.0
pnpm add -D tsup typescript vitest @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
packages/mcp/
├── package.json            # name: @mission-control/mcp, bin: dist/index.js
├── tsconfig.json           # extends ../../tsconfig.base.json (no references -- standalone)
├── tsup.config.ts          # ESM bundle, target node22, entry src/index.ts
├── src/
│   ├── index.ts            # Entry: stderr redirect, McpServer setup, connect transport
│   ├── tools/
│   │   ├── project-health.ts   # project_health tool handler
│   │   ├── project-risks.ts    # project_risks tool handler
│   │   ├── project-detail.ts   # project_detail tool handler
│   │   └── sync-status.ts      # sync_status tool handler
│   ├── api-client.ts       # Thin fetch wrapper for MC API with error handling
│   └── format.ts           # Response formatting utilities
└── src/__tests__/
    ├── tools/
    │   ├── project-health.test.ts
    │   ├── project-risks.test.ts
    │   ├── project-detail.test.ts
    │   └── sync-status.test.ts
    └── api-client.test.ts
```

### Pattern 1: stdio Server Entry Point
**What:** Redirect console to stderr BEFORE any imports, then create McpServer and connect StdioServerTransport.
**When to use:** Every stdio MCP server entry point.
**Example:**
```typescript
// Source: https://modelcontextprotocol.io/docs/develop/build-server (TypeScript tab)
// CRITICAL: Must be first line -- prevents stdout pollution
const _origLog = console.log;
console.log = console.error;

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerTools } from "./tools/index.js";

const server = new McpServer({
  name: "mission-control",
  version: "1.0.0",
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Pattern 2: Tool Registration with registerTool()
**What:** Register tools with name, description, Zod input schema, and async handler returning MCP content.
**When to use:** Each of the 4 MCP tools.
**Example:**
```typescript
// Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchApi } from "../api-client.js";

export function registerProjectRisks(server: McpServer) {
  server.registerTool(
    "project_risks",
    {
      description: "Active problems across all projects, filtered by severity. Returns critical and warning findings with project names, check types, and durations.",
      inputSchema: {
        severity: z.enum(["critical", "warning"]).optional()
          .describe("Filter by severity level. Omit for all."),
      },
    },
    async ({ severity }) => {
      const data = await fetchApi("/api/risks");
      // Format and optionally filter...
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(data, null, 2),
        }],
      };
    }
  );
}
```

### Pattern 3: API Client with Error Handling
**What:** Thin fetch wrapper that returns MCP-safe error content instead of throwing.
**When to use:** All API calls from MCP tools.
**Example:**
```typescript
const MC_API_URL = process.env.MC_API_URL ?? "http://100.123.8.125:3000";

export async function fetchApi<T>(path: string): Promise<T> {
  const url = `${MC_API_URL}${path}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`MC API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}
```

### Pattern 4: Session Startup Hook (Shell Script)
**What:** Shell script in `~/.claude/hooks/` that calls MC API directly and formats risk output.
**When to use:** SessionStart hook for risk banner.
**Example:**
```bash
#!/bin/bash
# risks-digest.sh — SessionStart hook
# Calls MC API /api/risks, formats critical + warning summary
# Output appears AFTER worklog-digest.sh in session startup

MC_API="${MC_API_URL:-http://100.123.8.125:3000}"

# Silent fail if API unreachable
RISKS=$(curl -sf --max-time 5 "$MC_API/api/risks" 2>/dev/null) || exit 0

# Parse with python3 (available on macOS)
python3 - "$RISKS" << 'PYEOF'
import json, sys
try:
    data = json.loads(sys.argv[1])
except (json.JSONDecodeError, IndexError):
    sys.exit(0)

critical = data.get("critical", [])
warning = data.get("warning", [])

if not critical and not warning:
    sys.exit(0)  # Zero noise when healthy

lines = []
header_parts = []
if critical:
    header_parts.append(f"{len(critical)} critical")
if warning:
    header_parts.append(f"{len(warning)} warnings")

lines.append(f"RISKS ({', '.join(header_parts)}):")

for r in critical:
    project = r.get("projectSlug", "unknown")
    detail = r.get("detail", "")
    lines.append(f"  \U0001f534 {project}: {detail}")

if warning:
    lines.append(f"  + {len(warning)} warnings (see dashboard)")

print("\n".join(lines))
PYEOF
```

### Anti-Patterns to Avoid
- **Importing from @mission-control/api or @mission-control/shared:** The MCP server is an API client, not a library consumer. It must use HTTP fetch only. No shared code, no DB imports, no type imports from other packages.
- **Using console.log in stdio server:** Corrupts JSON-RPC protocol on stdout. All logging MUST go to stderr (console.error). The entry point must redirect console.log to stderr before any other code runs.
- **Throwing exceptions from tool handlers:** MCP tool handlers must return content with error text, never throw. Unhandled throws crash the server process and disconnect from Claude Code.
- **Calling MCP from the session hook:** The hook runs before MCP servers are initialized. Call the MC HTTP API directly with curl.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol handling | Custom JSON-RPC parser | @modelcontextprotocol/sdk McpServer + StdioServerTransport | Protocol is complex (JSON-RPC over stdio with capability negotiation) |
| Input validation | Manual parameter checking | Zod schemas via registerTool inputSchema | SDK handles validation and error responses automatically |
| TypeScript bundling | tsc-only compilation | tsup | Need single-file output with dependencies inlined for standalone execution |
| API response types | Duplicated type definitions | Inline types in api-client.ts (not imported from shared) | MCP package must be standalone; types are simple response shapes |

**Key insight:** The MCP package is intentionally thin. It calls 4-5 HTTP endpoints and formats the responses. Total implementation code should be under 300 lines.

## Common Pitfalls

### Pitfall 1: stdout Pollution
**What goes wrong:** Any console.log, import side effect, or dependency that writes to stdout corrupts the MCP JSON-RPC stream and silently breaks the connection.
**Why it happens:** Node.js modules and libraries commonly write to stdout. Even a single stray `console.log` in a dependency can break everything.
**How to avoid:** Redirect `console.log` to `console.error` as the VERY FIRST line of the entry point, before any imports. Test by running the server and checking stdout contains only valid JSON-RPC messages.
**Warning signs:** "Connection closed" errors in Claude Code, MCP server shows as disconnected.

### Pitfall 2: MCP Server Not Starting in Claude Code
**What goes wrong:** Claude Code can't spawn the MCP server process because the command path is wrong or node can't find the entry point.
**Why it happens:** stdio MCP servers need an absolute path or a globally available command. Relative paths from package.json "bin" don't work without proper npm linking or absolute paths.
**How to avoid:** Use `node /absolute/path/to/packages/mcp/dist/index.js` as the command, or `pnpm --filter @mission-control/mcp exec node dist/index.js`. Test the exact command from terminal first.
**Warning signs:** Server appears in `claude mcp list` but shows "not connected" in `/mcp`.

### Pitfall 3: API Unreachable Crashing Server
**What goes wrong:** When the MC API on Mac Mini is unreachable, fetch throws and the tool handler throws, crashing the MCP server process.
**Why it happens:** No try/catch around fetch calls; AbortSignal timeout not set.
**How to avoid:** Wrap ALL fetch calls in try/catch. On error, return MCP content with error text (`{ content: [{ type: "text", text: "Error: API unreachable" }] }`). Set AbortSignal.timeout(10_000) on all requests.
**Warning signs:** MCP server disconnects when Mac Mini is offline.

### Pitfall 4: Session Hook Running Before API is Ready
**What goes wrong:** The session startup hook tries to call MC API but the API server hasn't started yet (Mac Mini booting, service restart).
**Why it happens:** SessionStart hooks run immediately when Claude Code opens.
**How to avoid:** Use `curl -sf --max-time 5` with silent fail. The hook exits 0 on any error (including timeout), producing zero output. This is correct behavior -- no false alarms.
**Warning signs:** Intermittent "connection refused" errors in hook output.

### Pitfall 5: portfolio-dashboard Still Referenced After Archive
**What goes wrong:** After archiving portfolio-dashboard, Claude Code sessions fail because old MCP config still references it.
**Why it happens:** Direct swap means the old config must be removed at the same time as the new one is added.
**How to avoid:** The swap is atomic: `claude mcp remove portfolio-dashboard && claude mcp add ...`. Test new MCP server BEFORE removing old one. Keep archive available for rollback.
**Warning signs:** "Failed to start MCP server" errors on session start.

## Code Examples

### Complete Entry Point (src/index.ts)
```typescript
// Source: MCP SDK official docs + MC project conventions
// FIRST: Redirect console.log to stderr to protect stdio JSON-RPC
console.log = console.error;

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerProjectHealth } from "./tools/project-health.js";
import { registerProjectRisks } from "./tools/project-risks.js";
import { registerProjectDetail } from "./tools/project-detail.js";
import { registerSyncStatus } from "./tools/sync-status.js";

const server = new McpServer({
  name: "mission-control",
  version: "1.0.0",
});

registerProjectHealth(server);
registerProjectRisks(server);
registerProjectDetail(server);
registerSyncStatus(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### tsup.config.ts
```typescript
// Source: tsup official docs
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  // Bundle all dependencies into single file for standalone execution
  noExternal: [/.*/],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

### package.json for MCP Package
```json
{
  "name": "@mission-control/mcp",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "mc-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

### Claude Code MCP Configuration
```bash
# Add the MCP server (user scope = available across all projects)
claude mcp add --transport stdio --scope user \
  --env MC_API_URL=http://100.123.8.125:3000 \
  mission-control -- node /Users/ryanstern/mission-control/packages/mcp/dist/index.js

# Verify
claude mcp list
claude mcp get mission-control
```

### Session Startup Hook Registration
```json
// Add to ~/.claude/settings.json SessionStart hooks array
{
  "hooks": {
    "SessionStart": [
      // ... existing hooks ...
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/risks-digest.sh"
          }
        ]
      }
    ]
  }
}
```

### Portfolio-Dashboard Tool Mapping (MIGR-01)
```
portfolio-dashboard tool       -> MC MCP equivalent     -> MC API endpoint
---------------------------------------------------------------------
portfolio_status               -> project_health         -> GET /api/projects + GET /api/health-checks
project_detail(project)        -> project_detail(slug)   -> GET /api/projects/:slug + GET /api/health-checks/:slug + GET /api/copies/:slug
activity_timeline(days)        -> project_health         -> GET /api/projects (includes lastCommitTime)
find_uncommitted               -> project_risks          -> GET /api/risks (dirty + unpushed findings)
sprint_history(weeks)          -> project_detail(slug)   -> GET /api/sprint-timeline?weeks=N
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Python FastMCP (portfolio-dashboard) | TypeScript @modelcontextprotocol/sdk | MCP SDK v1.27.1 (2026) | Same protocol, TypeScript native, monorepo integration |
| Direct git CLI calls from MCP server | HTTP API client over MC API | Phase 8 (March 2026) | No git dependency in MCP, data already computed by scanner |
| `tool()` decorator (Python SDK) | `registerTool()` method (TS SDK) | SDK design difference | Explicit registration with Zod schemas for input validation |
| `mcp.run(transport="stdio")` | `server.connect(new StdioServerTransport())` | SDK design difference | Explicit transport object, async connect |

**Deprecated/outdated:**
- portfolio-dashboard Python MCP server: Being replaced by @mission-control/mcp. All 5 tools have MC equivalents.
- FastMCP Python SDK: Not used in new server; TS SDK is the target.
- SSE transport for MCP: Deprecated by MCP spec in favor of HTTP transport. We use stdio (correct for local CLI servers).

## Open Questions

1. **tsup noExternal behavior with @modelcontextprotocol/sdk**
   - What we know: tsup can bundle all deps with `noExternal: [/.*/]` for standalone execution
   - What's unclear: Whether the MCP SDK has any dynamic require() or native modules that resist bundling
   - Recommendation: Test the bundle first. Fallback is to use tsx runtime or ship with node_modules

2. **Session hook ordering guarantee**
   - What we know: SessionStart hooks are defined as an array in settings.json; worklog-digest.sh is already there
   - What's unclear: Whether hooks execute strictly in array order or can run in parallel
   - Recommendation: The risks hook should be listed AFTER worklog-digest.sh in the array. If output ordering isn't guaranteed, combine into a single script.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x |
| Config file | packages/mcp/vitest.config.ts (new, mirrors api pattern) |
| Quick run command | `pnpm --filter @mission-control/mcp test` |
| Full suite command | `pnpm test` (runs all packages) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-01 | MCP package with stdio transport | integration | `pnpm --filter @mission-control/mcp test` | Wave 0 |
| MCP-02 | project_health tool returns health report | unit | `pnpm --filter @mission-control/mcp test -- --grep "project_health"` | Wave 0 |
| MCP-03 | project_risks tool returns severity-filtered risks | unit | `pnpm --filter @mission-control/mcp test -- --grep "project_risks"` | Wave 0 |
| MCP-04 | project_detail tool returns deep project status | unit | `pnpm --filter @mission-control/mcp test -- --grep "project_detail"` | Wave 0 |
| MCP-05 | sync_status tool returns sync report | unit | `pnpm --filter @mission-control/mcp test -- --grep "sync_status"` | Wave 0 |
| MCP-06 | Session startup hook surfaces critical risks | smoke | `MC_API_URL=http://100.123.8.125:3000 bash ~/.claude/hooks/risks-digest.sh` | Wave 0 |
| MIGR-01 | All portfolio-dashboard tools mapped | manual-only | Visual comparison of tool outputs (documented mapping above) | N/A |
| MIGR-02 | Claude Code MCP config updated | manual-only | `claude mcp get mission-control` returns correct config | N/A |
| MIGR-03 | portfolio-dashboard repo archived | manual-only | `gh repo view quartermint/portfolio-dashboard --json isArchived` | N/A |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/mcp test`
- **Per wave merge:** `pnpm test` (full monorepo suite)
- **Phase gate:** Full suite green + manual validation of MCP tools in live Claude Code session

### Wave 0 Gaps
- [ ] `packages/mcp/vitest.config.ts` -- vitest config for new package
- [ ] `packages/mcp/src/__tests__/tools/project-health.test.ts` -- covers MCP-02
- [ ] `packages/mcp/src/__tests__/tools/project-risks.test.ts` -- covers MCP-03
- [ ] `packages/mcp/src/__tests__/tools/project-detail.test.ts` -- covers MCP-04
- [ ] `packages/mcp/src/__tests__/tools/sync-status.test.ts` -- covers MCP-05
- [ ] `packages/mcp/src/__tests__/api-client.test.ts` -- covers error handling
- [ ] `~/.claude/hooks/risks-digest.sh` -- covers MCP-06
- [ ] Framework install: `pnpm --filter @mission-control/mcp add -D vitest`

## Sources

### Primary (HIGH confidence)
- [MCP TypeScript SDK official docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) -- McpServer API, registerTool(), StdioServerTransport
- [MCP Build Server Tutorial](https://modelcontextprotocol.io/docs/develop/build-server) -- TypeScript MCP server setup, tsconfig, package.json patterns
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp) -- claude mcp add syntax, scopes (local/project/user), env vars, .mcp.json format
- Existing codebase: packages/api/src/routes/ -- All API endpoints that MCP tools wrap (health-checks.ts, risks.ts, copies.ts, projects.ts, sprint-timeline.ts)
- Existing codebase: portfolio-dashboard/src/ -- Python MCP server being replaced (5 tools: portfolio_status, project_detail, activity_timeline, find_uncommitted, sprint_history)
- Existing codebase: ~/.claude/hooks/worklog-digest.sh -- Session startup hook pattern (SessionStart hook, python3 JSON parsing, output formatting)
- Existing codebase: ~/.claude/settings.json -- Hook registration format (SessionStart array)

### Secondary (MEDIUM confidence)
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- Version 1.27.1 confirmed as latest
- [tsup](https://tsup.egoist.dev/) -- Bundle TypeScript to standalone JS

### Tertiary (LOW confidence)
- SessionStart hook execution order -- assumed sequential based on array position; not officially documented

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- MCP SDK v1.27.1 verified on npm, all API endpoints exist and tested, monorepo patterns established
- Architecture: HIGH -- Entry point pattern from official docs, tool registration API from SDK docs, API client pattern standard fetch
- Pitfalls: HIGH -- stdout pollution documented in official MCP docs, error handling patterns from existing portfolio-dashboard experience
- Migration: HIGH -- Complete tool mapping verified against portfolio-dashboard source code
- Session hook: MEDIUM -- Hook registration pattern confirmed from existing worklog-digest.sh; execution ordering not 100% confirmed

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- MCP SDK v1.x is production, MC API routes are complete)
