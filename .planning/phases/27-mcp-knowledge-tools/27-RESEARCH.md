# Phase 27: MCP Knowledge Tools + Session Enrichment - Research

**Researched:** 2026-03-21
**Domain:** MCP tool registration, API integration, Claude Code session hooks
**Confidence:** HIGH

## Summary

Phase 27 adds three new MCP tools (`project_knowledge`, `convention_check`, `cross_project_search`) and enriches the Claude Code session startup banner with knowledge context. This phase is a thin integration layer: all underlying data already exists in the API (Phase 24 knowledge endpoints, Phase 26 convention scanner, Phase 25 dependency data). The work is registering MCP tool wrappers that call these endpoints and formatting responses as markdown text.

The codebase has 6 existing MCP tools that follow an identical pattern: register with `McpServer`, call `fetchApi()` to hit the Hono API, format the JSON response into human-readable text using `textContent()`. All 3 new tools follow this exact pattern. The session banner enrichment requires a new SessionStart command hook (shell script) that fetches knowledge context from the API and prints a concise summary to stdout.

**Primary recommendation:** Follow the established MCP tool pattern exactly. Each tool is one file in `packages/mcp/src/tools/`, registered in `index.ts`, tested by mocking `fetchApi`. The banner is a new SessionStart hook script at `~/.claude/hooks/knowledge-digest.sh` that hits the existing `/api/knowledge` and `/api/health-checks` endpoints.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Formatted markdown text -- same pattern as existing 6 MCP tools (project_health, project_risks, etc.)
- **D-02:** No structured JSON responses -- Claude handles text naturally, consistency with existing tools
- **D-03:** Extend existing startup banner (currently shows critical risks) with: related projects (from dependsOn), active convention violations, stale knowledge flag
- **D-04:** Banner stays concise: 3-5 lines max. Details available via MCP query tools.
- **D-05:** Banner content fetched via existing session startup hook endpoint
- **D-06:** `project_knowledge` -- returns aggregated CLAUDE.md content for a project (raw text + metadata)
- **D-07:** `convention_check` -- returns active conventions and any violations for a project
- **D-08:** `cross_project_search` -- searches across all project knowledge, returns matching results with context

### Claude's Discretion
- MCP tool description and parameter naming
- Search result ranking and snippet extraction
- Banner formatting and section ordering
- Error handling for missing knowledge data

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KNOW-07 | MCP `project_knowledge` tool returning aggregated CLAUDE.md content | Existing `/api/knowledge/:slug` endpoint returns full content + metadata; MCP tool wraps this with `fetchApi()` and formats as text |
| KNOW-08 | MCP `convention_check` tool returning active conventions and violations | Existing `/api/health-checks/:slug` endpoint returns convention_violation findings; MCP tool filters by checkType and formats violations |
| KNOW-09 | MCP `cross_project_search` tool for searching across all project knowledge | `/api/knowledge` returns all records (without content); MCP tool fetches all, does client-side text search on content via `/api/knowledge/:slug` per match, OR a new thin API endpoint for knowledge search |
| KNOW-10 | Session startup hook enriched with project knowledge summary | New SessionStart command hook fetches knowledge + health data for the resolved project and prints concise summary |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.27.1 | MCP server, tool registration | Already in packages/mcp/package.json |
| zod | ^3.24.0 | Input schema validation for MCP tools with parameters | Already in packages/mcp/package.json |
| vitest | ^2.1.0 | Test framework for MCP tool tests | Already in packages/mcp/package.json |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | All dependencies already present |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side knowledge search | FTS5 indexing of knowledge content | FTS5 would require adding knowledge content to search_index; client-side substring search is simpler for ~30 projects and avoids schema changes |
| New API endpoint for knowledge search | Fetch all knowledge content from MCP | Fetching all content for every search is wasteful; a thin endpoint is cleaner |

**Installation:**
```bash
# No new packages needed -- all dependencies exist
```

## Architecture Patterns

### Recommended Project Structure
```
packages/mcp/src/
├── tools/
│   ├── project-knowledge.ts    # NEW: KNOW-07
│   ├── convention-check.ts     # NEW: KNOW-08
│   ├── cross-project-search.ts # NEW: KNOW-09
│   ├── project-health.ts       # existing
│   ├── project-risks.ts        # existing
│   ├── project-detail.ts       # existing
│   ├── sync-status.ts          # existing
│   ├── session-status.ts       # existing
│   └── session-conflicts.ts    # existing
├── __tests__/tools/
│   ├── knowledge-tools.test.ts # NEW: tests for all 3 tools
│   ├── project-health.test.ts  # existing
│   └── ...                     # existing
├── api-client.ts               # existing fetchApi()
├── format.ts                   # existing textContent(), errorContent()
└── index.ts                    # add 3 new registerXxx() calls

packages/api/src/routes/
└── knowledge.ts                # EXTEND: add search endpoint

~/.claude/hooks/
└── knowledge-digest.sh         # NEW: KNOW-10 SessionStart hook
```

### Pattern 1: MCP Tool Registration (established pattern)
**What:** Each tool is a function that takes `McpServer` and calls `server.registerTool(name, config, handler)`
**When to use:** All 3 new MCP tools
**Example:**
```typescript
// Source: packages/mcp/src/tools/project-detail.ts (existing pattern)
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchApi } from "../api-client.js";
import { textContent, errorContent } from "../format.js";

export function registerProjectKnowledge(server: McpServer): void {
  server.registerTool(
    "project_knowledge",
    {
      description: "...",
      inputSchema: {
        slug: z.string().describe("Project slug (e.g., mission-control)"),
      },
    },
    async ({ slug }) => {
      try {
        const data = await fetchApi<KnowledgeResponse>(`/api/knowledge/${slug}`);
        // Format as readable text
        return textContent(formatKnowledge(data));
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
```

### Pattern 2: MCP Tool Testing (established pattern)
**What:** Mock `fetchApi`, capture handler from `registerTool`, test handler directly
**When to use:** All 3 new MCP tool test files
**Example:**
```typescript
// Source: packages/mcp/src/__tests__/tools/project-health.test.ts (existing)
vi.mock("../../api-client.js", () => ({
  fetchApi: vi.fn(),
}));

const mockServer = {
  registerTool: vi.fn((_name, _opts, fn) => {
    handler = fn;
  }),
};
registerProjectKnowledge(mockServer as never);
```

### Pattern 3: SessionStart Hook (established pattern)
**What:** Shell script called during session startup, stdout becomes system prompt context
**When to use:** KNOW-10 knowledge digest banner
**Example:**
```bash
# Source: ~/.claude/hooks/risks-digest.sh (existing pattern)
MC_API="${MC_API_URL:-http://100.x.x.x:3000}"
DATA=$(curl -sf --max-time 5 "$MC_API/api/endpoint" 2>/dev/null) || exit 0
# Parse with python3, print 3-5 lines max
```

### Anti-Patterns to Avoid
- **Inline tool handlers in index.ts:** All existing tools are in separate files under `tools/`. Follow the same pattern for consistency and testability.
- **Returning JSON from MCP tools:** D-01 and D-02 lock this -- always return formatted text via `textContent()`.
- **Fetching knowledge content in the list endpoint:** The `getAllKnowledge()` DB query explicitly excludes content for performance. Do not change this. Use per-slug fetch or a dedicated search endpoint.
- **Fat banner output:** D-04 caps the banner at 3-5 lines. Do not dump full knowledge content into the startup hook.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol | Custom JSON-RPC | @modelcontextprotocol/sdk McpServer | Already handles transport, serialization, tool registration |
| API HTTP client | Custom fetch wrapper | Existing `fetchApi()` in api-client.ts | 10s timeout, error handling, JSON parsing all built-in |
| Text formatting | Custom response builder | Existing `textContent()` / `errorContent()` | Ensures correct MCP content format |
| Knowledge data | Direct DB access from MCP | Existing `/api/knowledge` endpoints | MCP tools are thin API clients by design |
| Convention violations | Re-implementing scanner in MCP | Filter health-checks by `checkType === "convention_violation"` | Convention scanner already runs in the API on a timer |

**Key insight:** All 3 MCP tools are thin wrappers around existing API endpoints. The heavy lifting (knowledge aggregation, convention scanning, health findings) was done in Phases 24-26. This phase just exposes those capabilities to Claude Code sessions.

## Common Pitfalls

### Pitfall 1: Knowledge Content Not Indexed in FTS5 Search
**What goes wrong:** The `cross_project_search` tool (KNOW-09) needs to search across CLAUDE.md content, but knowledge content is NOT in the `search_index` FTS5 table. The FTS5 table only indexes captures, commits, and project names.
**Why it happens:** Phase 24 designed knowledge as a separate table without FTS indexing.
**How to avoid:** Two options: (1) Add a new API endpoint that does `LIKE` search across `project_knowledge.content` (simple, sufficient for ~30 projects), or (2) Add knowledge content to the FTS5 search_index. Option 1 is recommended -- it's simpler, avoids migration, and the dataset is small.
**Warning signs:** Empty search results when searching for text that exists in CLAUDE.md files.

### Pitfall 2: stdout Pollution in MCP Server
**What goes wrong:** MCP uses stdio transport. Any `console.log` to stdout corrupts the JSON-RPC protocol.
**Why it happens:** The MCP server already redirects `console.log = console.error` at the top of index.ts. But if a new tool file accidentally uses `console.log` before the redirect, it would break.
**How to avoid:** Never use `console.log` in MCP tool files. Use `console.error` for debugging. The redirect in index.ts handles this, but be aware.
**Warning signs:** MCP client shows "parse error" or "invalid JSON" messages.

### Pitfall 3: Banner Hook Timing and Failure
**What goes wrong:** The knowledge-digest.sh hook fires at SessionStart. If the MC API is down, the hook must exit silently (exit 0) to avoid blocking session startup.
**Why it happens:** Claude Code hooks have a timeout (typically 5s). API unavailability is common when not on Tailscale.
**How to avoid:** Follow the `risks-digest.sh` pattern: `curl -sf --max-time 5 ... || exit 0`. The `-s` (silent) and `-f` (fail silently on HTTP errors) flags plus the `|| exit 0` fallback ensure graceful degradation.
**Warning signs:** Session startup hangs or shows error output.

### Pitfall 4: Convention Check vs. Health Check Confusion
**What goes wrong:** Convention violations are stored as `convention_violation` checkType in the `project_health` table, not in a separate conventions table. The `convention_check` MCP tool must filter health findings, not call a non-existent conventions endpoint.
**Why it happens:** Phase 26 chose to store convention violations as health findings (reusing the risk feed infrastructure).
**How to avoid:** The `convention_check` MCP tool should call `/api/health-checks/:slug` and filter for `checkType === "convention_violation"`, then also include the convention rules from config context for the "active conventions" part of the response.
**Warning signs:** Tool returns no data even when convention violations exist.

### Pitfall 5: Cross-Project Search Requires Content Access
**What goes wrong:** The `/api/knowledge` list endpoint (no slug) explicitly excludes the `content` field for performance. A search tool needs to access content to search it.
**Why it happens:** Phase 24 decision (D-03): `getAllKnowledge` uses explicit column projection to exclude content.
**How to avoid:** Create a thin API endpoint specifically for knowledge search (e.g., `GET /api/knowledge/search?q=term`) that queries the `project_knowledge` table with a SQL `LIKE` or uses SQLite's `instr()` function. This keeps the list endpoint fast while providing search capability.
**Warning signs:** MCP tool fetches N+1 individual knowledge records to search them.

## Code Examples

Verified patterns from the existing codebase:

### MCP Tool with Parameters (project_detail pattern)
```typescript
// Source: packages/mcp/src/tools/project-detail.ts
export function registerProjectDetail(server: McpServer): void {
  server.registerTool(
    "project_detail",
    {
      description: "Deep status for a single project...",
      inputSchema: {
        slug: z.string().describe("Project slug (e.g., mission-control)"),
      },
    },
    async ({ slug }) => {
      try {
        const [projectData, healthData, copiesData] = await Promise.all([
          fetchApi<ProjectResponse>(`/api/projects/${slug}`),
          fetchApi<HealthChecksResponse>(`/api/health-checks/${slug}`),
          fetchApi<CopiesResponse>(`/api/copies/${slug}`),
        ]);
        // ... format lines ...
        return textContent(lines.join("\n"));
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
```

### Knowledge API Response Shape
```typescript
// Source: packages/api/src/routes/knowledge.ts
// GET /api/knowledge/:slug returns:
{
  projectSlug: string;
  content: string;        // Full CLAUDE.md text
  contentHash: string;
  fileSize: number;
  lastModified: string;   // ISO date
  commitsSinceUpdate: number;
  lastScannedAt: string;
  createdAt: string;
  updatedAt: string;
  stalenessScore: number; // 0-100 (100=fresh)
}

// GET /api/knowledge returns:
{
  knowledge: Array<{
    projectSlug: string;
    // NO content field (excluded for performance)
    contentHash: string;
    fileSize: number;
    lastModified: string;
    commitsSinceUpdate: number;
    lastScannedAt: string;
    createdAt: string;
    updatedAt: string;
    stalenessScore: number;
  }>;
  total: number;
}
```

### Health Check Findings (convention_violation shape)
```typescript
// Source: packages/api/src/services/convention-scanner.ts
// Convention violations stored as health findings:
{
  projectSlug: string;
  checkType: "convention_violation";
  severity: "info" | "warning" | "critical";
  detail: "Convention violations: [rule-id] description; ...";
  metadata: {
    violations: Array<{
      ruleId: string;
      description: string;
    }>;
  };
}
```

### SessionStart Hook Registration
```json
// Source: ~/.claude/settings.json SessionStart hooks
{
  "hooks": [
    {
      "type": "command",
      "command": "~/.claude/hooks/knowledge-digest.sh"
    }
  ]
}
```

### Session Hook Start Response
```typescript
// Source: packages/api/src/routes/sessions.ts
// POST /api/sessions/hook/start receives { session_id, cwd, model }
// Returns: { session: { id, projectSlug, ... }, budgetContext?: {...} }
// The projectSlug is resolved from cwd via config path matching
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP tools inline in index.ts | Separate files per tool in tools/ directory | v1.1 (Phase 11) | Better testability, follows convention |
| Direct DB access from MCP | fetchApi() calling Hono API | v1.1 design | MCP is a thin API client, not a DB client |

**Deprecated/outdated:**
- None relevant -- the MCP SDK v1.27.1 and tool registration API are current.

## API Endpoint Plan

### Existing Endpoints (reuse as-is)
| Endpoint | MCP Tool | Data Provided |
|----------|----------|---------------|
| `GET /api/knowledge/:slug` | `project_knowledge` | Full CLAUDE.md content + metadata |
| `GET /api/health-checks/:slug` | `convention_check` | Convention violation findings |
| `GET /api/knowledge` | banner hook | List of all knowledge records (staleness) |
| `GET /api/projects` | banner hook | Project list with dependsOn |

### New Endpoint Required
| Endpoint | MCP Tool | Purpose |
|----------|----------|---------|
| `GET /api/knowledge/search?q=term` | `cross_project_search` | Search across CLAUDE.md content using SQL LIKE |

This new endpoint queries `project_knowledge` table for rows where `content LIKE '%term%'` (case-insensitive via `COLLATE NOCASE` or `lower()`), returning matching slug, a snippet around the match, and metadata. This avoids N+1 fetches and keeps the search server-side.

**Implementation:**
```typescript
// In packages/api/src/routes/knowledge.ts, add:
.get("/knowledge/search", (c) => {
  const q = c.req.query("q");
  if (!q || q.length < 2) {
    return c.json({ results: [], total: 0 });
  }
  // Query with LIKE on content column
  const results = searchKnowledge(getInstance().sqlite, q);
  return c.json({ results, total: results.length });
})
```

**IMPORTANT: Route ordering.** The `/knowledge/search` route must be registered BEFORE `/knowledge/:slug` to avoid the router matching "search" as a slug parameter.

## Open Questions

1. **Convention rules in the convention_check tool response**
   - What we know: Convention violations are in health findings. The active convention rules are in `mc.config.json` under `conventions[]`.
   - What's unclear: Should the `convention_check` tool also show the rules themselves (not just violations), so Claude knows what conventions exist? The API doesn't currently expose convention rules as an endpoint.
   - Recommendation: Have the tool return both: (a) active rules from a new `/api/conventions` endpoint or from a config endpoint, and (b) violations from health findings. However, this might be overengineered -- the tool could just show violations (which include the rule description in the detail field). Start with violations only, add rules list if requested.

2. **Banner: How to get dependsOn for the resolved project**
   - What we know: The session hook POST returns `projectSlug`. The `GET /api/projects` endpoint includes `dependsOn` per project.
   - What's unclear: The banner hook is a shell script that runs at SessionStart. It doesn't receive the projectSlug directly -- it needs to resolve it or query for it.
   - Recommendation: The banner hook can call `GET /api/projects` and filter by the project matching the current `$PWD`. Or it can call `POST /api/sessions/hook/start` first to get the projectSlug (but this is already called as an HTTP hook). Simplest: have the hook call a single new endpoint like `GET /api/knowledge/summary?cwd=/path/to/project` that returns the concise knowledge summary for the project at that path. OR: extend the existing session hook response to include knowledge context.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.0 |
| Config file | packages/mcp/vitest.config.ts (if exists) or package.json scripts |
| Quick run command | `pnpm --filter @mission-control/mcp test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KNOW-07 | `project_knowledge` tool returns CLAUDE.md content for a slug | unit | `pnpm --filter @mission-control/mcp test -- --run -t "project_knowledge"` | No -- Wave 0 |
| KNOW-08 | `convention_check` tool returns conventions and violations | unit | `pnpm --filter @mission-control/mcp test -- --run -t "convention_check"` | No -- Wave 0 |
| KNOW-09 | `cross_project_search` tool searches knowledge and returns results | unit | `pnpm --filter @mission-control/mcp test -- --run -t "cross_project_search"` | No -- Wave 0 |
| KNOW-09 | Knowledge search API endpoint returns matching results | unit | `pnpm --filter @mission-control/api test -- --run -t "knowledge search"` | No -- Wave 0 |
| KNOW-10 | Session startup includes knowledge summary | integration | Manual verification (hook output inspection) | No -- manual-only |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/mcp test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/mcp/src/__tests__/tools/knowledge-tools.test.ts` -- covers KNOW-07, KNOW-08, KNOW-09 MCP tools
- [ ] `packages/api/src/__tests__/routes/knowledge.test.ts` -- covers knowledge search endpoint (KNOW-09 API layer)
- [ ] Framework install: none needed -- Vitest already configured

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/mcp/src/` -- all 6 existing MCP tools examined for pattern consistency
- Codebase analysis: `packages/api/src/routes/knowledge.ts` -- knowledge API endpoints
- Codebase analysis: `packages/api/src/services/convention-scanner.ts` -- convention violation format
- Codebase analysis: `packages/api/src/routes/sessions.ts` -- session hook endpoints and response shapes
- Codebase analysis: `~/.claude/settings.json` -- SessionStart hook configuration
- Codebase analysis: `~/.claude/hooks/risks-digest.sh` -- existing banner hook pattern

### Secondary (MEDIUM confidence)
- None -- all findings based on direct codebase examination

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all packages already present
- Architecture: HIGH -- follows 6 existing MCP tools as exact pattern templates
- Pitfalls: HIGH -- identified from direct codebase analysis of data flow and edge cases

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- internal patterns, no external API dependencies)
