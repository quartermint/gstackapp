# Phase 14: Dashboard & Project State - Research

**Researched:** 2026-04-08
**Domain:** Filesystem-backed project dashboard with React frontend + Hono API
**Confidence:** HIGH

## Summary

Phase 14 builds the landing page of gstackapp v2.0 -- a project dashboard that reads filesystem state (GSD STATE.md files, git status, design docs, worklogs) and presents it as an operations overview. The technical challenge is primarily on the backend: scanning ~35 projects across the home directory, parsing YAML frontmatter from STATE.md files, running git status/log commands, parsing worklog markdown, and querying Mac Mini health via MCP bridge or SSH. The frontend is a straightforward React SPA with a CSS grid of project cards, reusing all existing patterns (React Query, Hono RPC, Tailwind, DESIGN.md tokens).

There is no new database work -- this phase reads the filesystem directly on each visit (D-04, D-05). The existing `simple-git` dependency already handles git operations. The main risk is filesystem scanning latency across 35+ projects; however, since scanning happens on-visit (not background), the API can parallelize reads with `Promise.all` and return quickly.

**Primary recommendation:** Build 4-5 new API routes (projects, design-docs, worklog, infra-status) that read filesystem state on demand, plus 12 new React components composing the dashboard view. Extend existing Sidebar and App.tsx routing.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Auto-detect projects with .planning/ directories across home dir, cross-reference with ~/CLAUDE.md project list
- **D-02:** Config file allows overrides -- add/remove projects, set display names, group projects
- **D-03:** Projects without .planning/ (non-GSD) still show with git status if listed in ~/CLAUDE.md or config
- **D-04:** Poll on visit -- read filesystem state when dashboard opens or refreshes
- **D-05:** No background polling or filesystem watchers -- keep it simple, data is always current when viewed
- **D-06:** Mac Mini data via MCP bridge (already exists) or SSH queries -- poll on visit same as local
- **D-07:** Project cards grid -- card per project showing GSD phase, git status, last activity, uncommitted file count
- **D-08:** Cards should feel like Linear's project grid -- clean, information-dense but not cluttered
- **D-09:** Visual indicators for active (recent activity), stale (no activity + uncommitted work), and ideating (has design docs, no code yet)
- **D-10:** Dashboard is home/landing view -- always the starting point
- **D-11:** Sessions open as tabs -- click a project card to start/resume a session
- **D-12:** Sidebar shows open sessions for quick switching
- **D-13:** Cmd+K command palette for quick switching between projects/sessions
- **D-14:** Design doc browser -- surface ~/.gstack/projects/ design docs with project association
- **D-15:** Worklog carryover view -- aggregated carryover items from ~/.claude/logs/worklog.md with staleness tracking
- **D-16:** Mac Mini status -- service health, Tailscale Funnel endpoints, deployment status
- **D-17:** PR review pipeline -- existing v1.0 pipeline accessible as a view within the dashboard

### Claude's Discretion
- Exact card layout and information hierarchy
- Project grouping/sorting algorithm (by activity, by status, by name)
- Design doc preview rendering
- Stale threshold definition (how many days = stale)

### Deferred Ideas (OUT OF SCOPE)
- Agent efficiency metrics (commits/agent ratio trending) -- future feature
- Session timeline visualization (project switching heatmap) -- future feature
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | View all projects with GSD state aggregated into dashboard | Backend: scan ~35 .planning/STATE.md files with YAML frontmatter parsing. Frontend: ProjectGrid + ProjectCard components |
| DASH-02 | See git status and uncommitted file counts per project | Backend: `simple-git` (already in deps) runs `git status --porcelain` + `git log -1` per project. Parallelize with Promise.all |
| DASH-03 | Browse design docs from ~/.gstack/projects/ | Backend: scan ~/.gstack/projects/*/designs/ directory. Frontend: DesignDocBrowser component with markdown rendering |
| DASH-04 | View aggregated worklog carryover items with staleness | Backend: parse ~/.claude/logs/worklog.md, extract "### Carryover" sections (9 found). Frontend: CarryoverSection component |
| DASH-05 | See Mac Mini service health, Tailscale Funnel endpoints | Backend: MCP bridge `service_status` tool or SSH fallback. Frontend: InfraPanel component |
| DASH-06 | Identify stale vs active projects | Staleness algorithm: active = activity within 3 days, stale = no activity 3+ days AND uncommitted changes, ideating = has design docs but no .planning/ |
| PREV-01 | Existing v1.0 PR review pipeline accessible within dashboard | Frontend: add 'pr-reviews' view to AppView type, render existing PipelineHero + PRFeed + PRDetail when selected |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | ^4.12 | API routes for project/infra/docs endpoints | Already powering all existing routes [VERIFIED: package.json] |
| React | ^19.2 | Dashboard UI components | Already installed [VERIFIED: package.json] |
| @tanstack/react-query | ^5.95 | Server state for project data | Already used for pipelines, repos, trends [VERIFIED: package.json] |
| simple-git | ^3.33 | Git status/log per project | Already in API deps, used in clone.ts [VERIFIED: package.json] |
| date-fns | ^4.1 | Relative timestamps ("2h ago", "3 days ago") | Already installed in web package [VERIFIED: package.json] |
| Zod | ^3.24+ | Validation for API responses, config schemas | Already in both packages [VERIFIED: package.json] |
| Tailwind CSS | ^4.2 | Styling per DESIGN.md tokens | Already configured [VERIFIED: package.json] |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx | ^2.1 | Conditional CSS classes | Card state variants (active/stale/ideating) [VERIFIED: package.json] |
| tailwind-merge | ^3.5 | Class conflict resolution | Component composition [VERIFIED: package.json] |
| nanoid | ^5.0 | ID generation | If session tabs need IDs [VERIFIED: package.json] |
| pino | ^9.6 | Structured logging | API route logging [VERIFIED: package.json] |

### New Dependencies Needed
**None.** All required libraries are already installed. No new npm packages needed for Phase 14. [VERIFIED: reviewed all requirements against existing package.json]

## Architecture Patterns

### New API Routes Structure
```
packages/api/src/routes/
├── projects.ts         # GET /api/projects — scan filesystem, return project state
├── design-docs.ts      # GET /api/design-docs — scan ~/.gstack/projects/
├── worklog.ts          # GET /api/worklog/carryover — parse worklog.md
├── infra.ts            # GET /api/infra/status — Mac Mini health + Funnel endpoints
└── (existing routes unchanged)
```

### New Frontend Components Structure
```
packages/web/src/components/dashboard/
├── DashboardView.tsx       # Top-level composition
├── ProjectGrid.tsx         # CSS grid container
├── ProjectCard.tsx         # Individual project card
├── StatusDot.tsx           # 4px colored status indicator
├── InfraPanel.tsx          # Mac Mini status panel
├── ServiceStatus.tsx       # Individual service health card
├── CarryoverSection.tsx    # Collapsible worklog carryover
├── CarryoverItem.tsx       # Single carryover item
├── DesignDocBrowser.tsx    # List + preview view
└── DesignDocItem.tsx       # Single doc list item

packages/web/src/components/layout/
├── CommandPalette.tsx      # Cmd+K overlay
└── SessionTab.tsx          # Session entry in sidebar (may overlap with existing SessionListItem)
```

### Pattern 1: Filesystem-Backed API Route
**What:** API routes that read filesystem state on each request (no database, no caching) [VERIFIED: D-04, D-05]
**When to use:** All new Phase 14 routes

```typescript
// Source: existing pattern from routes/repos.ts + config.ts filesystem reads
import { Hono } from 'hono'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import simpleGit from 'simple-git'

const projectsApp = new Hono()

projectsApp.get('/', async (c) => {
  const home = homedir()
  const projects = await scanProjects(home)
  return c.json(projects)
})
```

### Pattern 2: YAML Frontmatter Parsing (STATE.md)
**What:** Parse the YAML frontmatter from STATE.md files to extract GSD state [VERIFIED: consistent format across 35 projects]
**When to use:** Project state extraction

```typescript
// STATE.md format (verified across multiple projects):
// ---
// gsd_state_version: 1.0
// milestone: v2.0
// milestone_name: Command Center
// status: executing
// last_activity: 2026-04-08
// progress:
//   total_phases: 4
//   completed_phases: 2
//   percent: 100
// ---

function parseStateMd(content: string): GsdState | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  // Simple YAML frontmatter parsing — no need for a YAML library
  // The frontmatter uses only simple key-value pairs and one nested object
  const lines = match[1].split('\n')
  const state: Record<string, unknown> = {}
  let currentKey = ''
  for (const line of lines) {
    if (line.startsWith('  ')) {
      // Nested under currentKey (progress.*)
      const [k, v] = line.trim().split(': ')
      if (!state[currentKey]) state[currentKey] = {}
      ;(state[currentKey] as Record<string, unknown>)[k] = parseValue(v)
    } else {
      const colonIdx = line.indexOf(': ')
      if (colonIdx > 0) {
        currentKey = line.slice(0, colonIdx)
        state[currentKey] = parseValue(line.slice(colonIdx + 2))
      }
    }
  }
  return state as GsdState
}
```

### Pattern 3: Parallel Git Status Scanning
**What:** Run git status across many repos concurrently with bounded parallelism [ASSUMED]
**When to use:** /api/projects endpoint

```typescript
// simple-git is already a dependency — use it for status
import simpleGit from 'simple-git'

async function getGitStatus(projectPath: string) {
  const git = simpleGit(projectPath)
  try {
    const status = await git.status()
    const log = await git.log({ maxCount: 1 })
    return {
      branch: status.current,
      uncommitted: status.files.length,
      ahead: status.ahead,
      behind: status.behind,
      lastCommitDate: log.latest?.date ?? null,
      lastCommitMessage: log.latest?.message ?? null,
    }
  } catch {
    return null // Not a git repo or error
  }
}

// Bound concurrency to avoid overwhelming filesystem
const CONCURRENCY = 10
async function scanAllProjects(paths: string[]) {
  const results = []
  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    const batch = paths.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(batch.map(getGitStatus))
    results.push(...batchResults)
  }
  return results
}
```

### Pattern 4: Extending AppView Type (Existing Pattern)
**What:** Add new view types to the existing AppView union [VERIFIED: Sidebar.tsx]

```typescript
// Current: 'dashboard' | 'trends' | 'repos' | 'session'
// Phase 14: 'projects' | 'trends' | 'repos' | 'session' | 'design-docs' | 'pr-reviews'
// Note: 'dashboard' currently shows PR pipeline — rename to 'pr-reviews',
// make 'projects' the new default landing view (D-10)
```

### Pattern 5: Command Palette (Cmd+K)
**What:** Global keyboard shortcut overlay for quick navigation [VERIFIED: UI spec defines full contract]
**When to use:** Always active, registered at Shell level

```typescript
// Register at Shell.tsx level
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setCommandPaletteOpen(prev => !prev)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

### Anti-Patterns to Avoid
- **Caching filesystem state:** D-05 explicitly says no caching. Read fresh every time. Resist the urge to add stale-while-revalidate.
- **Using a YAML parsing library:** STATE.md frontmatter is simple enough to parse with string operations. Adding `js-yaml` or `gray-matter` would be dependency bloat for a simple format.
- **Background filesystem watchers:** D-05 explicitly forbids this. No `chokidar`, no `fs.watch`.
- **Scanning the entire home directory recursively:** Use the known project list from ~/CLAUDE.md + config file + targeted `.planning/` directory scan (maxdepth 2-3).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git status per project | Custom `exec('git status')` | `simple-git` (already installed) | Handles edge cases, async, error handling |
| Relative time formatting | Custom "X ago" logic | `date-fns/formatDistanceToNow` (already installed) | Handles all edge cases, i18n-ready |
| CSS class merging | Manual string concat | `cn()` utility (already exists at `lib/cn.ts`) | Tailwind conflict resolution |
| API type safety | Manual fetch + types | Hono RPC client `hc<AppType>` (existing pattern) | End-to-end type inference |
| Server state management | useState + useEffect fetch | React Query hooks (existing pattern) | Caching, refetching, loading states |

**Key insight:** This phase requires zero new npm dependencies. Every tool needed is already in the monorepo.

## Common Pitfalls

### Pitfall 1: Filesystem Scanning Performance
**What goes wrong:** Scanning 35+ projects with git status takes too long, dashboard feels slow on load.
**Why it happens:** Each `git status` spawns a subprocess. 35 sequential git operations = 3-5 seconds.
**How to avoid:** Batch with bounded parallelism (10 concurrent). The scan should complete in <1s with parallel execution. Return partial results if needed.
**Warning signs:** Dashboard load > 2 seconds.

### Pitfall 2: HOME Directory Hardcoding
**What goes wrong:** Hardcoding `/Users/ryanstern` makes the scanner non-portable and breaks in tests.
**Why it happens:** Filesystem paths are inherently machine-specific.
**How to avoid:** Use `os.homedir()` and make all paths relative to it. Config file (D-02) provides overrides. Tests can mock the home directory.
**Warning signs:** Any absolute path in source code.

### Pitfall 3: YAML Frontmatter Parsing Edge Cases
**What goes wrong:** Hand-rolled YAML parser breaks on quoted strings, multiline values, or unexpected formatting.
**Why it happens:** STATE.md frontmatter contains quoted dates (`"2026-04-08T14:55:22.425Z"`) and multi-line `stopped_at` values.
**How to avoid:** Keep the parser minimal — only extract the specific fields needed (milestone, status, phase, progress, last_activity). Use Zod to validate the extracted shape. If a field fails to parse, return null for that field, not crash the whole scan.
**Warning signs:** Quoted strings not being unquoted, nested objects not parsing.

### Pitfall 4: Worklog Parsing Fragility
**What goes wrong:** Worklog format changes or entries don't follow expected structure, parser breaks.
**Why it happens:** Worklog is human-written markdown, not machine-generated. Format varies by session.
**How to avoid:** Parse conservatively: split by session headers (lines starting with `**Session`), find `### Carryover` sections, extract bullet items. Don't try to extract structured data beyond text + project name + date.
**Warning signs:** Regex that assumes exact whitespace or formatting.

### Pitfall 5: Mac Mini Unreachable
**What goes wrong:** Mac Mini is offline/unreachable, infra panel hangs or errors.
**Why it happens:** Tailscale connection may be down, Mac Mini may be off.
**How to avoid:** Set a short timeout (3-5 seconds) for Mac Mini queries. Return graceful "unreachable" state (per UI spec error copy). Never block the whole dashboard load on infra status.
**Warning signs:** Dashboard load blocked by infra panel timeout.

### Pitfall 6: View Routing Regression
**What goes wrong:** Changing AppView type and default view breaks existing navigation.
**Why it happens:** 'dashboard' currently means PR pipeline view. Phase 14 makes projects the landing page.
**How to avoid:** Rename carefully: current 'dashboard' -> 'pr-reviews', new 'projects' becomes default. Update all references in App.tsx, Sidebar.tsx, and any saved view state.
**Warning signs:** Existing PR pipeline view unreachable after changes.

## Code Examples

### Project State Zod Schema
```typescript
// Source: verified STATE.md format across 35 projects [VERIFIED: filesystem scan]
import { z } from 'zod'

export const gsdProgressSchema = z.object({
  total_phases: z.number(),
  completed_phases: z.number(),
  total_plans: z.number().optional(),
  completed_plans: z.number().optional(),
  percent: z.number(),
})

export const gsdStateSchema = z.object({
  gsd_state_version: z.string().optional(),
  milestone: z.string().optional(),
  milestone_name: z.string().optional(),
  status: z.string().optional(),
  stopped_at: z.string().optional(),
  last_updated: z.string().optional(),
  last_activity: z.string().optional(),
  progress: gsdProgressSchema.optional(),
})

export const projectSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string().optional(),
  gsdState: gsdStateSchema.nullable(),
  gitStatus: z.object({
    branch: z.string().nullable(),
    uncommitted: z.number(),
    ahead: z.number(),
    behind: z.number(),
    lastCommitDate: z.string().nullable(),
  }).nullable(),
  status: z.enum(['active', 'stale', 'ideating']),
  hasDesignDocs: z.boolean(),
})
```

### React Query Hook Pattern
```typescript
// Source: existing pattern from hooks/useRepos.ts, hooks/useTrends.ts [VERIFIED: codebase]
import { useQuery } from '@tanstack/react-query'
import { client } from '../api/client'
import type { ProjectState } from '@gstackapp/shared'

export const queryKeys = {
  // ... existing keys ...
  projects: {
    all: ['projects'] as const,
    list: () => [...queryKeys.projects.all, 'list'] as const,
  },
  designDocs: {
    all: ['designDocs'] as const,
    list: () => [...queryKeys.designDocs.all, 'list'] as const,
  },
  worklog: {
    carryover: ['worklog', 'carryover'] as const,
  },
  infra: {
    status: ['infra', 'status'] as const,
  },
}

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: async () => {
      const res = await client.api.projects.$get()
      return res.json()
    },
  })
}
```

### Staleness Algorithm
```typescript
// Source: UI spec staleness threshold + CONTEXT.md D-09 [VERIFIED: 14-UI-SPEC.md]
import { differenceInDays } from 'date-fns'

type ProjectStatus = 'active' | 'stale' | 'ideating'

function computeStatus(project: {
  lastActivity: Date | null
  uncommittedCount: number
  hasPlanning: boolean
  hasDesignDocs: boolean
}): ProjectStatus {
  // Ideating: has design docs but no .planning/ directory
  if (project.hasDesignDocs && !project.hasPlanning) return 'ideating'

  // Active: any activity within 3 days
  if (project.lastActivity) {
    const daysSince = differenceInDays(new Date(), project.lastActivity)
    if (daysSince <= 3) return 'active'
    // Stale: no activity 3+ days AND has uncommitted changes
    if (project.uncommittedCount > 0) return 'stale'
  }

  return 'active' // Default: no uncommitted work = not stale
}
```

## Data Sources Analysis

### ~/CLAUDE.md Project List [VERIFIED: examined file]
- Lists ~20+ active projects under "Active Development" sections
- Format: `- **name/** - description (stack details)`
- Parse with regex: `/^\s*-\s*\*\*(\w[\w-]*)\/?\*\*\s*-\s*(.+)$/gm`

### .planning/STATE.md Files [VERIFIED: 35 found across home dir]
- YAML frontmatter with consistent fields: milestone, status, last_activity, progress
- All use `gsd_state_version: 1.0` format
- Safe to parse with simple string-based YAML extractor

### ~/.gstack/projects/ [VERIFIED: directory exists with 20+ entries]
- Subdirectories named `{org}-{repo}` or `{project-name}`
- Contains: `designs/`, `ceo-plans/`, `learnings.jsonl`, `timeline.jsonl`, etc.
- Design docs are in `designs/` subdirectory as markdown files

### ~/.claude/logs/worklog.md [VERIFIED: file exists, 9 carryover sections]
- Format: `**Session DATE -- project: description**` headers
- `### Carryover` subsections with bullet items
- Human-written, somewhat variable formatting

### Mac Mini (ryans-mac-mini / 100.123.8.125) [VERIFIED: MCP bridge available]
- MCP server `mac-mini-bridge` is active with tools: `run_command`, `service_status`, `git_status`, `docker_manage`
- Can use `service_status` MCP tool from the API to get health data
- SSH fallback via Tailscale if MCP bridge unavailable

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1.0: PR pipeline as landing page | v2.0: Project dashboard as landing page | Phase 14 | Default view changes from pipeline to projects |
| Manual `/sitrep` across projects | Single dashboard scan | Phase 14 | Replaces 5+ parallel recon agents |
| No design doc visibility | Design doc browser | Phase 14 | Ideation artifacts become first-class |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bounded parallelism of 10 concurrent git operations is sufficient | Architecture Patterns | LOW -- can tune up/down easily |
| A2 | YAML frontmatter can be parsed without a library for STATE.md | Architecture Patterns | LOW -- format is simple, fallback is adding `gray-matter` package |
| A3 | Mac Mini MCP bridge `service_status` returns structured health data | Data Sources | MEDIUM -- need to verify response format; SSH is fallback |
| A4 | simple-git `status()` returns `files.length` for uncommitted count | Code Examples | LOW -- well-documented API |

## Open Questions

1. **Mac Mini MCP bridge response format**
   - What we know: MCP server `mac-mini-bridge` exposes `service_status` tool
   - What's unclear: Exact response shape (service names, health enum, endpoint URLs)
   - Recommendation: Call `service_status` during implementation to discover format; design API response to normalize whatever comes back

2. **Project config file location and format**
   - What we know: D-02 says config allows overrides for project list
   - What's unclear: Where this config file lives, what format
   - Recommendation: Use `~/.gstackapp/projects.json` or similar. Define a simple Zod schema. Can be created empty and filled over time.

3. **Session tab integration with project cards**
   - What we know: D-11 says clicking a project card opens/resumes a session
   - What's unclear: How project context maps to session creation (Phase 12 sessions exist)
   - Recommendation: Add optional `projectPath` to session creation. Clicking a card calls `createSession({ projectPath })`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.1 |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test` (runs all tests in packages/api) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Scan projects, return GSD state | unit + integration | `npx vitest run src/__tests__/projects-route.test.ts -x` | Wave 0 |
| DASH-02 | Git status per project | unit | `npx vitest run src/__tests__/projects-route.test.ts -x` | Wave 0 |
| DASH-03 | Design docs listing | unit | `npx vitest run src/__tests__/design-docs-route.test.ts -x` | Wave 0 |
| DASH-04 | Worklog carryover parsing | unit | `npx vitest run src/__tests__/worklog-route.test.ts -x` | Wave 0 |
| DASH-05 | Infra status endpoint | unit | `npx vitest run src/__tests__/infra-route.test.ts -x` | Wave 0 |
| DASH-06 | Staleness algorithm | unit | `npx vitest run src/__tests__/projects-route.test.ts -x` | Wave 0 |
| PREV-01 | PR review accessible as view | manual | Visual verification -- existing components unchanged | N/A (no code change) |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** Full suite `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/projects-route.test.ts` -- covers DASH-01, DASH-02, DASH-06
- [ ] `src/__tests__/design-docs-route.test.ts` -- covers DASH-03
- [ ] `src/__tests__/worklog-route.test.ts` -- covers DASH-04
- [ ] `src/__tests__/infra-route.test.ts` -- covers DASH-05
- [ ] `src/__tests__/helpers/mock-fs.ts` -- shared fixture for filesystem mocking (mock project directories, STATE.md files)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user, no auth (project constraint) |
| V3 Session Management | no | Browser sessions, no server auth |
| V4 Access Control | no | Single-user |
| V5 Input Validation | yes | Zod schemas for all API responses; path validation for filesystem reads |
| V6 Cryptography | no | No secrets handled in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via project config | Tampering | Resolve all paths, verify they're under home directory. No user-supplied paths in filesystem reads. |
| Symlink escape in project scanning | Information Disclosure | `realpath()` check that resolved path is under home directory before reading |
| Command injection via project names | Tampering | `simple-git` uses spawn (not shell exec), project names never interpolated into commands |

## Sources

### Primary (HIGH confidence)
- Codebase: `packages/api/src/` -- existing route patterns, config, dependencies [VERIFIED]
- Codebase: `packages/web/src/` -- existing component patterns, hooks, API client [VERIFIED]
- Filesystem: 35 `.planning/STATE.md` files scanned for format consistency [VERIFIED]
- Filesystem: `~/.gstack/projects/` directory structure examined [VERIFIED]
- Filesystem: `~/.claude/logs/worklog.md` format examined (9 carryover sections) [VERIFIED]
- `package.json` (api + web): all dependency versions confirmed [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- Mac Mini MCP bridge: tools listed in MCP server instructions [VERIFIED: runtime context]

### Tertiary (LOW confidence)
- None -- all claims verified against codebase or filesystem

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, no new deps
- Architecture: HIGH -- follows existing patterns exactly, filesystem data sources verified
- Pitfalls: HIGH -- based on verified data (35 projects, worklog format, Mac Mini setup)

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable -- no external API dependencies, filesystem-backed)
