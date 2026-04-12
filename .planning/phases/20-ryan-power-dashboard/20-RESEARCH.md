# Phase 20: Ryan Power Dashboard - Research

**Researched:** 2026-04-11
**Domain:** React dashboard composition, real-time SSE, gbrain knowledge UI, cross-repo intelligence
**Confidence:** HIGH

## Summary

Phase 20 is a frontend-heavy composition phase. All major building blocks already exist in the codebase: `ProjectGrid`/`ProjectCard` for multi-project overview, `PipelineTopology`/`StageNode` for pipeline visualization, `IdeationView`/`IdeationPipeline` for ideation flow, `CrossRepoInsight` for cross-repo alerts, and the gbrain client/cache layer from Phase 19. The work is primarily: (1) extending existing components with richer data, (2) building the new gbrain console view, (3) wiring new API routes to expose aggregated data, and (4) adding new sidebar navigation entries.

The existing architecture pattern is clear: Hono API routes serve JSON, TanStack Query hooks consume them, React components render with Tailwind CSS styling per DESIGN.md. SSE already works for pipeline updates via `useSSEQuerySync`. No new libraries are needed. The only genuinely new surface is the gbrain console (DASH-04), which needs a search interface, entity relationship display, and compiled truth viewer.

**Primary recommendation:** Compose five new views from existing components + targeted extensions. The gbrain console is the only view requiring significant new UI. All others are remixes of existing patterns with enhanced data queries.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation decisions are at Claude's discretion.

### Claude's Discretion
- **D-01:** Multi-project overview layout (DASH-01) -- card grid, list, or treemap for quartermint repos. Metrics per project (health score, last activity, open issues). Existing `ProjectGrid` and `ProjectCard` components available.
- **D-02:** Pipeline topology view (DASH-02) -- extend existing `PipelineTopology` and `StageNode` components for cross-repo pipeline visualization with real-time status.
- **D-03:** Ideation workspace visualization (DASH-03) -- how the office-hours to CEO review to eng review to execution flow renders. Existing `IdeationView`, `IdeationPipeline`, `IdeationStageNode` components available.
- **D-04:** gbrain console UX (DASH-04) -- search interface, entity relationship display, compiled truth viewer. New surface.
- **D-05:** Cross-repo intelligence display (DASH-05) -- "Seen in your other repos" alerts and pattern detection. Existing `CrossRepoInsight` component available.
- **D-06:** Navigation structure -- how Ryan switches between views. Existing sidebar with component routing.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Multi-project overview with status, last activity, health scores | Existing `ProjectGrid`, `ProjectCard`, `useProjects` hook, `/api/projects` route. Extend `ProjectCard` with health score metric. |
| DASH-02 | Pipeline topology view showing 5-stage reviews across repos | Existing `PipelineTopology`, `StageNode`, `PipelineHero`, `usePipelineList` hook. Build aggregated cross-repo pipeline feed. |
| DASH-03 | Ideation workspace visualization | Existing `IdeationView`, `IdeationPipeline`, `IdeationStageNode`, `useIdeation` hook. Already functional -- needs polish and integration into power dashboard nav. |
| DASH-04 | gbrain console for querying knowledge, entity relationships, compiled truth | New view. Gbrain client (`GbrainClient`) and types exist from Phase 19. Need new API routes to expose gbrain search/entity/related as REST endpoints, plus new React components. |
| DASH-05 | Cross-repo intelligence with "Seen in your other repos" alerts | Existing `CrossRepoInsight` component, `findingEmbeddings` table, `BottomStrip`. Extend with aggregated alert feed and pattern detection summary. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack:** Hono + Postgres (Neon) + Drizzle + React -- no deviations [VERIFIED: codebase]
- **Deploy:** Mac Mini via Tailscale Funnel [VERIFIED: codebase]
- **Display:** Desktop-only, dark mode only, 1024px min-width [VERIFIED: DESIGN.md]
- **Design System:** Must read DESIGN.md before any visual decisions [VERIFIED: CLAUDE.md]
- **AI Provider:** Claude API only (Phase 1) [VERIFIED: CLAUDE.md]
- **Auth:** Phase 17 auth gates admin access to power dashboard [VERIFIED: CONTEXT.md]
- **GSD Workflow:** Must use GSD commands for all file changes [VERIFIED: CLAUDE.md]

## Standard Stack

No new libraries needed. Phase 20 uses the existing stack exclusively.

### Core (Already Installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| React | ^19.2 | UI framework | Installed [VERIFIED: package.json] |
| @tanstack/react-query | ^5.95 | Server state management | Installed [VERIFIED: package.json] |
| Hono | ^4.12 | API server | Installed [VERIFIED: package.json] |
| Recharts | ^2.15 | Charts (quality trends) | Installed [VERIFIED: package.json] |
| Tailwind CSS | ^4.2 | Styling | Installed [VERIFIED: package.json] |
| date-fns | ^4.1 | Date formatting | Installed [VERIFIED: package.json] |
| clsx | ^2.1 | Conditional classes | Installed [VERIFIED: package.json] |
| Zod | ^3.24 | Validation | Installed [VERIFIED: package.json] |
| Drizzle ORM | ^0.45 | Database queries | Installed [VERIFIED: package.json] |

### Not Needed
| Library | Why Not |
|---------|---------|
| React Router | App uses state-driven view switching (`AppView` union type + `switch`), not URL routing. This is established pattern -- don't change it. [VERIFIED: App.tsx] |
| D3 / vis.js | Entity relationship graph can be rendered with simple SVG or CSS grid. Full graph viz library is overkill for gbrain's shallow graph (depth 2 max). [VERIFIED: GbrainClient.getRelated depth=2] |
| WebSocket library | SSE is the established real-time pattern. No bidirectional comms needed. [VERIFIED: useSSE.ts, sse.ts] |

## Architecture Patterns

### Existing View Routing Pattern
The app uses a union type `AppView` in `Sidebar.tsx` for navigation, with a `switch` in `App.tsx#renderContent()` to select the active component. [VERIFIED: App.tsx, Sidebar.tsx]

```typescript
// Source: packages/web/src/components/layout/Sidebar.tsx
export type AppView =
  | 'dashboard'
  | 'trends'
  | 'repos'
  | 'ideation'
  | 'autonomous'
  | 'operator'
```

**For Phase 20:** Extend `AppView` with new views:
```typescript
export type AppView =
  | 'dashboard'    // existing -- becomes multi-project overview (DASH-01)
  | 'trends'       // existing
  | 'repos'        // existing
  | 'ideation'     // existing -- already covers DASH-03
  | 'autonomous'   // existing
  | 'operator'     // existing
  | 'pipelines'    // NEW -- cross-repo pipeline topology (DASH-02)
  | 'gbrain'       // NEW -- knowledge console (DASH-04)
  | 'intelligence'  // NEW -- cross-repo intelligence feed (DASH-05)
```

### Existing Data Flow Pattern
```
API Route (Hono) -> Hook (TanStack Query) -> Component (React + Tailwind)
```
Every view follows this. New views must follow it too. [VERIFIED: all existing views]

### Component Composition Pattern
Views compose smaller components. Example from `DashboardView`:
```typescript
// Source: packages/web/src/components/dashboard/DashboardView.tsx
export function DashboardView({ onSelectProject }: DashboardViewProps) {
  const projects = useProjects()
  const carryover = useCarryover()
  const infra = useInfraStatus()
  return (
    <div className="p-8 space-y-8 max-w-[1400px]">
      <ProjectGrid ... />
      <CarryoverSection ... />
      <InfraPanel ... />
    </div>
  )
}
```

### SSE Pattern for Real-time Updates
```typescript
// Source: packages/web/src/hooks/useSSEQuerySync.ts
// SSE events invalidate TanStack Query cache entries
// Pattern: listen for SSE -> invalidateQueries({ queryKey })
```
Pipeline topology (DASH-02) will reuse this exact pattern. No new SSE infrastructure needed. [VERIFIED: useSSEQuerySync.ts]

### Recommended New File Structure
```
packages/web/src/
  components/
    power/                    # NEW - Power dashboard views
      PowerOverview.tsx       # DASH-01: Enhanced multi-project view
      PipelineFeedView.tsx    # DASH-02: Cross-repo pipeline topology
      GbrainConsole.tsx       # DASH-04: Knowledge console (main view)
      GbrainSearch.tsx        # DASH-04: Search input + results
      GbrainEntity.tsx        # DASH-04: Entity detail + relationships
      IntelligenceFeed.tsx    # DASH-05: Cross-repo intelligence feed
      AlertCard.tsx           # DASH-05: Individual intelligence alert
  hooks/
    useGbrain.ts              # NEW - gbrain search/entity/related queries
    useIntelligence.ts        # NEW - cross-repo intelligence feed
packages/api/src/
  routes/
    gbrain.ts                 # NEW - REST endpoints wrapping gbrain MCP
    intelligence.ts           # NEW - Aggregated cross-repo alerts
```

### Anti-Patterns to Avoid
- **Don't duplicate `IdeationView` for DASH-03.** It already exists and works. Wire it into the power dashboard navigation, don't rebuild it. [VERIFIED: IdeationView.tsx is 180+ lines of working code]
- **Don't add URL routing.** The app uses state-based view switching. Adding React Router would be a refactor that isn't needed. [VERIFIED: App.tsx switch statement]
- **Don't build a full graph visualization library for gbrain.** The entity relationship graph has max depth 2 (`getRelated(slug, depth=2)`). A simple tree/list layout is sufficient. [VERIFIED: GbrainClient]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date formatting | Custom date math | `date-fns` `formatDistanceToNow` | Already used in `ProjectCard.tsx` [VERIFIED: codebase] |
| Conditional CSS classes | String concatenation | `clsx` + `cn()` utility | Project-wide pattern [VERIFIED: lib/cn.ts] |
| Server state management | Custom fetch + useState | TanStack Query hooks | Caching, refetching, loading/error states for free [VERIFIED: all hooks] |
| SSE → cache invalidation | Manual polling | `useSSEQuerySync` pattern | Already wired, just add new event types if needed [VERIFIED: useSSEQuerySync.ts] |
| Pipeline stage colors | Hardcoded hex values | `STAGE_COLORS` from `lib/constants` | Single source of truth per DESIGN.md [VERIFIED: StageNode.tsx imports] |

## Common Pitfalls

### Pitfall 1: Admin-Only Gate
**What goes wrong:** Power dashboard views rendered for operator users who shouldn't see them.
**Why it happens:** `App.tsx` already gates by role (`authData.user.role === 'operator'` shows OperatorHome). But new sidebar nav items could leak.
**How to avoid:** Sidebar nav items for power dashboard views must only render when `role === 'admin'`. The auth check already exists in App.tsx. Sidebar needs the user role passed down or check auth independently.
**Warning signs:** Operator users seeing "Pipelines", "gbrain", "Intelligence" in sidebar. [VERIFIED: App.tsx auth flow]

### Pitfall 2: gbrain MCP Connection Failures
**What goes wrong:** gbrain console shows blank/error when Mac Mini is unreachable.
**Why it happens:** GbrainClient connects via SSH to Mac Mini. Network issues, Mac Mini sleep, or gbrain process down all cause failures.
**How to avoid:** Every gbrain API endpoint must return graceful degradation (empty results + `available: false` indicator). UI must show "gbrain unavailable" state, not crash. Follow GB-04 pattern from Phase 19. [VERIFIED: GbrainClient, prefetch.ts]
**Warning signs:** Unhandled promise rejections, blank screens, infinite loading spinners.

### Pitfall 3: N+1 Query on Cross-Repo Pipeline Feed
**What goes wrong:** Fetching pipeline runs across all repos individually creates N API calls.
**Why it happens:** Existing `usePipelineList` fetches all runs already. But if the new view tries to group by repo and fetch additional data per repo, it creates N+1.
**How to avoid:** Use the existing `/api/pipelines` endpoint which returns all runs with repo info. Group client-side. [VERIFIED: pipelines route returns repo.fullName]
**Warning signs:** Multiple sequential API calls on page load, slow initial render.

### Pitfall 4: SSE Reconnection on View Switch
**What goes wrong:** SSE connection drops and reconnects every time user switches between views.
**Why it happens:** If SSE hook is mounted per-view instead of at Shell level.
**How to avoid:** `useSSEQuerySync` is already called at the `App` component level (top of `App()`). Don't add additional SSE listeners per view. Query invalidation already covers all views. [VERIFIED: App.tsx line 8]
**Warning signs:** Multiple SSE connections in Network tab, duplicate event processing.

### Pitfall 5: Health Score Computation Location
**What goes wrong:** Health scores computed client-side from stale or incomplete data.
**Why it happens:** Temptation to compute health scores in the frontend from `ProjectState` data.
**How to avoid:** Compute health scores server-side in the `/api/projects` route (or a new `/api/projects/health` endpoint) where access to full DB data exists. Return as part of `ProjectState`. [ASSUMED]
**Warning signs:** Health scores that don't match reality, expensive client-side computation.

## Code Examples

### Pattern 1: New View Registration
```typescript
// Source: Derived from existing Sidebar.tsx + App.tsx patterns [VERIFIED]

// 1. Add to AppView type in Sidebar.tsx
export type AppView =
  | 'dashboard' | 'trends' | 'repos' | 'ideation'
  | 'autonomous' | 'operator'
  | 'pipelines' | 'gbrain' | 'intelligence'

// 2. Add NavButton in Sidebar.tsx (admin-only section)
{isAdmin && (
  <>
    <NavButton label="Pipelines" active={activeView === 'pipelines'} onClick={() => onNavigate('pipelines')} />
    <NavButton label="gbrain" active={activeView === 'gbrain'} onClick={() => onNavigate('gbrain')} />
    <NavButton label="Intelligence" active={activeView === 'intelligence'} onClick={() => onNavigate('intelligence')} />
  </>
)}

// 3. Add case in App.tsx renderContent() switch
case 'gbrain':
  return <GbrainConsole />
```

### Pattern 2: gbrain REST API Route
```typescript
// Source: Derived from existing Hono route patterns + GbrainClient [VERIFIED]

// packages/api/src/routes/gbrain.ts
import { Hono } from 'hono'
import { GbrainClient } from '../gbrain/client'

const gbrainApp = new Hono()

gbrainApp.get('/search', async (c) => {
  const query = c.req.query('q')
  if (!query) return c.json({ results: [], available: false })

  const client = new GbrainClient()
  try {
    const connected = await client.connect()
    if (!connected) return c.json({ results: [], available: false })
    const results = await client.search(query, 10)
    return c.json({ results, available: true })
  } catch {
    return c.json({ results: [], available: false })
  } finally {
    await client.disconnect().catch(() => {})
  }
})
```

### Pattern 3: TanStack Query Hook for gbrain
```typescript
// Source: Derived from existing hook patterns [VERIFIED]

// packages/web/src/hooks/useGbrain.ts
import { useQuery } from '@tanstack/react-query'

export function useGbrainSearch(query: string) {
  return useQuery({
    queryKey: ['gbrain', 'search', query],
    queryFn: async () => {
      const res = await fetch(`/api/gbrain/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error('gbrain search failed')
      return res.json()
    },
    enabled: query.length > 0,
    staleTime: 60_000, // 1 min cache -- gbrain data changes infrequently
  })
}
```

### Pattern 4: Component Styling (DESIGN.md Compliant)
```typescript
// Source: Derived from existing component patterns [VERIFIED]

// All new components follow this structure:
function GbrainConsole() {
  return (
    <div className="p-6 space-y-4 max-w-[1280px]">
      {/* Section header: mono label */}
      <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
        Knowledge Console
      </span>
      {/* Content cards: surface bg, border, rounded-lg */}
      <div className="bg-surface border border-border rounded-lg p-4">
        {/* ... */}
      </div>
    </div>
  )
}
```

## Implementation Recommendations

### DASH-01: Multi-Project Overview
**Recommendation:** Extend existing `DashboardView` rather than creating a separate view. The current dashboard already shows `ProjectGrid` + `CarryoverSection` + `InfraPanel`. Add a health score metric to `ProjectCard` (computed server-side, returned in `ProjectState`). The `computeStatus()` function in `projects.ts` already classifies active/stale/ideating -- extend it with a numeric health score (0-100) based on: days since last activity, uncommitted change count, GSD progress percentage, and pipeline pass rate. [VERIFIED: projects.ts computeStatus]

### DASH-02: Pipeline Topology View
**Recommendation:** Create a new `PipelineFeedView` that shows all active pipeline runs across repos in a vertical list, each with the existing `PipelineTopology` component inline. Group by repo. The existing `usePipelineList` hook already returns all runs with `repo.fullName`. SSE updates already invalidate the pipeline query cache. This is mostly a layout composition exercise. [VERIFIED: usePipelineFeed.ts, PipelineTopology.tsx]

### DASH-03: Ideation Workspace
**Recommendation:** The existing `IdeationView` already visualizes the full flow. Just ensure it's accessible from the power dashboard navigation. No new components needed. The view is already wired in the `App.tsx` switch statement under `case 'ideation'`. [VERIFIED: App.tsx, IdeationView.tsx]

### DASH-04: gbrain Console (New)
**Recommendation:** This is the only genuinely new surface. Build three sub-components:
1. **Search bar + results list** -- text input, debounced search via `useGbrainSearch`, results as cards with slug/title/type/excerpt
2. **Entity detail panel** -- click a search result to load full entity via `useGbrainEntity(slug)`, show content + metadata
3. **Relationship graph** -- below entity detail, show related entities from `useGbrainRelated(slug)`. Simple list grouped by relationship type (not a visual graph -- depth 2 is too shallow for a meaningful graph visualization)

New API routes needed: `GET /api/gbrain/search?q=`, `GET /api/gbrain/entity/:slug`, `GET /api/gbrain/related/:slug`. These wrap `GbrainClient` methods with connection management and graceful degradation. [VERIFIED: GbrainClient methods]

### DASH-05: Cross-Repo Intelligence
**Recommendation:** Create an `IntelligenceFeed` view that aggregates cross-repo matches from `findingEmbeddings` table. The existing `CrossRepoInsight` component renders individual matches. Build a feed that queries recent cross-repo matches grouped by pattern (similar findings across repos). New API route: `GET /api/intelligence/feed` that queries `findingEmbeddings` for recent matches across repos. The `BottomStrip` can link to this view. [VERIFIED: findingEmbeddings table, CrossRepoInsight.tsx]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQLite + sqlite-vec | Postgres (Neon) + findingEmbeddings table | Phase 16 (c1fc394) | Vector search uses text-serialized embeddings, pgvector extension deferred to DASH-05 scope [VERIFIED: schema.ts] |
| Single dashboard view | Role-based views (admin/operator) | Phase 17 | Power dashboard is admin-only [VERIFIED: App.tsx auth flow] |
| gbrain as concept | GbrainClient + cache + prefetch | Phase 19 | Full MCP client exists, just needs REST API wrapping [VERIFIED: gbrain/ directory] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Health scores should be computed server-side, not client-side | Pitfall 5 / DASH-01 | Low -- can be moved to client if server computation is problematic |
| A2 | Entity relationship display as grouped list is sufficient (no graph viz library) | Architecture / DASH-04 | Low -- if Ryan wants visual graph, would need a lib like react-flow |
| A3 | Cross-repo intelligence queries the findingEmbeddings table directly | DASH-05 | Medium -- if pgvector isn't set up on Neon yet, similarity search won't work. May need to use text-based matching as fallback. |

## Open Questions

1. **pgvector availability on Neon**
   - What we know: `findingEmbeddings` table exists with `embedding` as text column. Schema comment says "stored as pgvector vector type via raw SQL."
   - What's unclear: Whether pgvector extension is actually enabled on the Neon instance. DASH-05 cross-repo intelligence depends on similarity search.
   - Recommendation: Check if pgvector is enabled. If not, DASH-05 can use title/description text matching as a fallback, or the cross-repo search tests that were "currently skipped" per CLAUDE.md notes. [VERIFIED: schema.ts comment, CLAUDE.md notes about pgvector deferred to Phase 20]

2. **gbrain MCP server availability**
   - What we know: GbrainClient connects via SSH to Mac Mini (`ryans-mac-mini`). Server runs `bun run src/cli.ts serve` from `/Volumes/4tb/gbrain`.
   - What's unclear: Whether gbrain MCP server is reliably running. Phase 19 built graceful degradation but DASH-04 console is unusable without it.
   - Recommendation: gbrain console should show clear "unavailable" state with instructions. The API routes handle degradation -- the UI just needs to render it well.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.4 (web) / ^3.1 (api) |
| Config file (api) | `packages/api/vitest.config.ts` |
| Config file (web) | None -- uses vite.config.ts defaults |
| Quick run command | `cd packages/api && npx vitest run --reporter=dot` |
| Full suite command | `cd packages/api && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Projects route returns health scores | unit | `cd packages/api && npx vitest run src/__tests__/projects-route.test.ts -x` | Exists (extend) |
| DASH-02 | Pipeline list groups by repo | unit | `cd packages/api && npx vitest run src/__tests__/pipelines-route.test.ts -x` | Exists (extend) |
| DASH-03 | Ideation view accessible from nav | manual-only | Browser verification | N/A |
| DASH-04 | gbrain REST endpoints return search/entity/related | unit | `cd packages/api && npx vitest run src/__tests__/gbrain-routes.test.ts -x` | Wave 0 |
| DASH-04 | gbrain unavailable returns graceful degradation | unit | `cd packages/api && npx vitest run src/__tests__/gbrain-routes.test.ts -x` | Wave 0 |
| DASH-05 | Intelligence feed returns cross-repo matches | unit | `cd packages/api && npx vitest run src/__tests__/intelligence-route.test.ts -x` | Wave 0 |
| DASH-01 | React component renders project cards | component | `cd packages/web && npx vitest run src/__tests__/power-overview.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/api && npx vitest run --reporter=dot`
- **Per wave merge:** `cd packages/api && npx vitest run && cd ../web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/gbrain-routes.test.ts` -- covers DASH-04 REST endpoints
- [ ] `packages/api/src/__tests__/intelligence-route.test.ts` -- covers DASH-05 feed
- [ ] `packages/web/src/__tests__/power-overview.test.tsx` -- covers DASH-01 component rendering
- [ ] `packages/web/vitest.config.ts` -- web package needs vitest config for component tests (jsdom environment)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Phase 17 auth (Tailscale ACL + magic link) gates admin role [VERIFIED: App.tsx] |
| V3 Session Management | yes | Existing `userSessions` table + cookie auth [VERIFIED: schema.ts] |
| V4 Access Control | yes | Admin role check -- power dashboard views must NOT render for operator role [VERIFIED: App.tsx role check] |
| V5 Input Validation | yes | Zod validation on gbrain search query param, Hono validator integration [VERIFIED: existing pattern] |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| gbrain query injection | Tampering | GbrainClient passes query as MCP tool JSON arguments, not shell args. SSH command is hardcoded. [VERIFIED: T-19-02 in client.ts] |
| Unauthorized admin access | Elevation of Privilege | Auth middleware checks role before serving power dashboard API routes [VERIFIED: existing auth pattern] |
| Path traversal via gbrain entity slug | Information Disclosure | GbrainClient.getEntity uses MCP tool call, not filesystem access. No path traversal risk. [VERIFIED: client.ts] |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `packages/web/src/components/` -- all existing component patterns
- Codebase inspection: `packages/api/src/routes/` -- all existing API route patterns
- Codebase inspection: `packages/api/src/gbrain/` -- Phase 19 gbrain integration layer
- Codebase inspection: `packages/shared/src/schemas/` -- all shared type definitions
- Codebase inspection: `packages/api/src/db/schema.ts` -- complete database schema
- `DESIGN.md` -- full design system specification
- `CLAUDE.md` -- project constraints and tech stack decisions
- `20-CONTEXT.md` -- phase discussion decisions

### Secondary (MEDIUM confidence)
- None needed -- this is a composition phase using existing infrastructure

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing [VERIFIED: package.json files]
- Architecture: HIGH -- extending proven patterns [VERIFIED: codebase inspection]
- Pitfalls: HIGH -- identified from real codebase patterns [VERIFIED: existing code]
- gbrain console UX: MEDIUM -- new surface, but API layer exists [VERIFIED: gbrain/ directory]
- Cross-repo intelligence: MEDIUM -- depends on pgvector availability [ASSUMED: A3]

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- no external dependency changes expected)
