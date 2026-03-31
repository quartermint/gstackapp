# Phase 4: Dashboard & Pipeline Visualization - Research

**Researched:** 2026-03-30
**Domain:** React SPA dashboard with real-time pipeline visualization, SSE streaming, and DESIGN.md aesthetic compliance
**Confidence:** HIGH

## Summary

Phase 4 is the first frontend phase -- the `packages/web/` directory is currently empty (only `.gitkeep`). This means we must scaffold the entire React + Vite + Tailwind setup from scratch, establish the Hono RPC type bridge from the API package, build an SSE event bus on the backend, and implement the pipeline hero visualization with its signature animations. The API also has no dashboard-facing routes yet -- only webhook, health, and feedback endpoints exist.

The core technical challenges are: (1) wiring Hono RPC client types across monorepo packages for end-to-end type safety, (2) integrating SSE EventSource with TanStack Query v5 for real-time cache updates, (3) implementing the pipeline topology visualization with DESIGN.md-compliant animations (dim-to-bright, running pulse, pipeline trace) using pure CSS/Tailwind, and (4) setting up Tailwind CSS v4's CSS-first configuration with the custom design token theme.

**Primary recommendation:** Build in layers -- backend API routes and event bus first, then frontend scaffolding with Tailwind theme, then the pipeline hero view, then the PR feed and detail view. The SSE integration is the riskiest piece because it bridges backend event emission with frontend cache state.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Horizontal left-to-right flow -- connected nodes following DESIGN.md mandate that "content is left-anchored and directional"
- **D-02:** Pipeline takes 60%+ of viewport height -- it IS the product
- **D-03:** 5 stages as connected flow nodes with spectral identity colors (CEO=#FF8B3E, Eng=#36C9FF, Design=#B084FF, QA=#2EDB87, Security=#FF5A67)
- **D-04:** Signal flow traces along connector lines between stages (linear, 2.5s loop animation)
- **D-05:** Dim-to-bright reveal: stage completion animates from 20% opacity to 100% over 400ms ease
- **D-06:** Running pulse: active stage glows with 2s ease-in-out infinite pulse (box-shadow)
- **D-07:** All animations driven by SSE events -- real-time, not polling
- **D-08:** Dense cards -- 5 verdict dots (colored by stage spectral identity), repo name, PR title, time ago. Linear-style density.
- **D-09:** Sorted by last activity (most recent first) -- per user's timeline sorting preference
- **D-10:** Click to expand into PR detail view
- **D-11:** Findings grouped by stage with stage spectral identity colors
- **D-12:** Each finding shows severity tier, description, file/line reference
- **D-13:** Feedback UI: thumbs up/down + optional context input per finding
- **D-14:** SSE via Hono streamSSE -> React EventSource for live pipeline progress
- **D-15:** TanStack Query v5 for data fetching, caching, background refetching
- **D-16:** Hono RPC client (hc) for type-safe API calls
- **D-17:** Tailwind CSS v4.2 with custom theme mapped to DESIGN.md tokens

### Claude's Discretion
- Exact node shape and connector line design
- Layout responsive behavior within the 1024px+ constraint
- Empty state design (no pipelines yet)
- Loading skeleton patterns
- How SSE events map to TanStack Query cache invalidation

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Pipeline visualization as hero view (60%+ viewport height) | Layout architecture with CSS Grid, 60vh min-height on pipeline container, 12-column grid from DESIGN.md |
| DASH-02 | Pipeline shows 5 stages as connected flow nodes with spectral identity colors | SVG or CSS-based node rendering with stage identity colors from DESIGN.md, connector lines via SVG path or CSS pseudo-elements |
| DASH-03 | Real-time SSE streaming of pipeline progress to dashboard | Backend event bus (Node EventEmitter), Hono streamSSE route, React useSSE hook, TanStack Query cache integration |
| DASH-04 | Dim-to-bright reveal animation when a stage completes | CSS transition: opacity 0.2 -> 1.0 over 400ms ease, triggered by SSE stage:completed event |
| DASH-05 | Running pulse animation on active stages | CSS @keyframes with box-shadow glow using stage spectral color, 2s ease-in-out infinite |
| DASH-06 | Reverse-chronological PR feed across all connected repos | API route with JOIN across pipeline_runs + pull_requests + repositories, ordered by updatedAt DESC |
| DASH-07 | PR detail view showing findings grouped by stage | API route returning findings grouped by stage_result, frontend component with stage-colored sections |
| DASH-08 | Dashboard is the landing page (no auth required in v1) | Vite dev proxy to API, no auth middleware, SPA serves at root |
| DASH-09 | Desktop-only layout (1024px min-width), dark mode only | Tailwind v4 @theme with custom colors, min-w-[1024px] on body, dark bg-background |
| DASH-10 | Dashboard follows DESIGN.md aesthetic (industrial precision, electric lime accent) | Complete Tailwind CSS v4 theme mapping of all DESIGN.md tokens (colors, typography, spacing, motion) |
</phase_requirements>

## Standard Stack

### Core (all verified via npm registry 2026-03-30)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.2.4 | UI framework | Latest stable. Already decided in CLAUDE.md stack. |
| react-dom | ^19.2.4 | DOM renderer | Required companion to React |
| Vite | ^8.0.3 | Build tooling + dev server | Vite 8 with Rolldown (Rust-based bundler), sub-second HMR. Standard for React SPA. |
| @vitejs/plugin-react | ^6.0.1 | Vite React plugin | v6 uses Oxc for React Refresh (no Babel dependency). Required for Vite 8. |
| @tanstack/react-query | ^5.95.2 | Server state management | Caching, background refetch, optimistic updates. Locked in D-15. |
| hono | ^4.12.9 | RPC client types | `hono/client` provides `hc` for type-safe API calls. Already installed in API package. Frontend imports types only. |
| Tailwind CSS | ^4.2.2 | Utility-first CSS | v4 CSS-first config with @theme. Locked in D-17. |
| @tailwindcss/vite | ^4.2.2 | Vite plugin for Tailwind | First-party Vite plugin, replaces PostCSS configuration. |
| Recharts | ^2.15 (latest 3.8.1 -- but v2 API is stable) | Quality trend charts | Declarative React charting. Note: Recharts v3 exists but the project CLAUDE.md specifies v2.15. Use ^2.15. |
| Zod | ^3.24 | Runtime validation | Already in shared package. Frontend validates API responses. |
| date-fns | ^4.1.0 | Date formatting | Relative timestamps ("2 hours ago"), lightweight tree-shakeable. |
| clsx | ^2.1.1 | Conditional classes | Tiny (228B), composable className merging. |
| tailwind-merge | ^3.5.0 | Class conflict resolution | Resolves Tailwind class conflicts in component composition. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query-devtools | ^5.95.2 | Query debugging | Development only -- inspect cache state, SSE invalidation behavior |
| geist | ^1.7.0 | Geist font (npm) | Install for self-hosted font files, OR use jsDelivr CDN |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure CSS pipeline nodes | D3.js / react-flow | D3 fights React's model. react-flow is overkill for 5 static nodes. CSS/SVG is simpler and fully controllable. |
| Recharts | Nivo / Victory | Recharts is simplest for basic trend lines. Nivo is heavier. Victory has less React Query integration. |
| Native EventSource | @microsoft/fetch-event-source | Native EventSource is sufficient for GET-based SSE. fetch-event-source adds POST support and custom headers -- not needed here. |
| Tailwind merge | cva (class-variance-authority) | cva is for variant APIs on components. tailwind-merge is for conflict resolution. Different tools for different problems. |

### Installation (packages/web)
```bash
# Core frontend
npm install react react-dom @tanstack/react-query hono zod date-fns clsx tailwind-merge recharts

# Dev dependencies
npm install -D vite @vitejs/plugin-react typescript @tailwindcss/vite @types/react @types/react-dom @tanstack/react-query-devtools
```

**Recharts version note:** The CLAUDE.md stack table says "Recharts ^2.15" but the latest published version is 3.8.1. Recharts v3 is a major version bump (new API surface). Since the project spec says ^2.15, install `recharts@^2` explicitly to stay on the v2 line. If trends/charts are Phase 6, this can be revisited then.

## Architecture Patterns

### Recommended Frontend Structure
```
packages/web/
├── index.html                  # Vite entry point
├── vite.config.ts              # Vite 8 + React + Tailwind plugins + API proxy
├── tsconfig.json               # Extends root, references ../shared and ../api (for types)
├── src/
│   ├── main.tsx                # React 19 createRoot entry
│   ├── App.tsx                 # Root layout: sidebar + main content
│   ├── app.css                 # Tailwind v4 @import + @theme design tokens
│   ├── api/
│   │   └── client.ts           # Hono RPC client (hc<AppType>) + query key factory
│   ├── hooks/
│   │   ├── useSSE.ts           # EventSource hook with reconnection
│   │   └── useSSEQuerySync.ts  # Bridge: SSE events -> TanStack Query cache invalidation
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx     # Left sidebar (200-240px)
│   │   │   ├── Shell.tsx       # App shell: sidebar + content + bottom strip
│   │   │   └── BottomStrip.tsx # Intelligence/trends strip (always visible)
│   │   ├── pipeline/
│   │   │   ├── PipelineHero.tsx       # Hero view container (60%+ vh)
│   │   │   ├── StageNode.tsx          # Individual stage node with animations
│   │   │   ├── StageConnector.tsx     # Connector lines with trace animation
│   │   │   └── PipelineTopology.tsx   # 5-node horizontal layout
│   │   ├── feed/
│   │   │   ├── PRFeed.tsx             # Reverse-chronological PR list
│   │   │   ├── PRCard.tsx             # Dense PR card with 5 verdict dots
│   │   │   └── PRDetail.tsx           # Expanded PR view with findings
│   │   ├── findings/
│   │   │   ├── FindingCard.tsx        # Individual finding with severity
│   │   │   ├── FindingGroup.tsx       # Findings grouped by stage
│   │   │   └── FeedbackUI.tsx         # Thumbs up/down + context input
│   │   └── shared/
│   │       ├── VerdictBadge.tsx       # PASS/FLAG/BLOCK/SKIP badge
│   │       ├── StageDot.tsx           # Colored dot for stage identity
│   │       ├── Skeleton.tsx           # Loading skeleton components
│   │       └── EmptyState.tsx         # No data states
│   ├── lib/
│   │   ├── constants.ts       # Stage colors, verdict colors, stage labels
│   │   └── cn.ts              # clsx + tailwind-merge utility
│   └── types/
│       └── sse.ts             # SSE event type definitions
```

### Backend Additions Required (packages/api)
```
packages/api/src/
├── events/
│   └── bus.ts                  # EventEmitter singleton for pipeline events
├── routes/
│   ├── sse.ts                  # GET /api/sse -- Hono streamSSE endpoint
│   ├── pipelines.ts            # GET /api/pipelines, GET /api/pipelines/:id
│   ├── repos.ts                # GET /api/repos
│   └── (existing: health.ts, feedback.ts)
└── index.ts                    # Mount new routes, export AppType for RPC
```

### Pattern 1: Hono RPC Client in Monorepo
**What:** Export the Hono app type from `packages/api` so `packages/web` can create a typed client via `hc<AppType>`.
**When to use:** All API calls from the dashboard.
**Critical monorepo requirement:** The `packages/web/tsconfig.json` must reference `packages/api` via TypeScript project references for type inference to work. Both packages MUST use the same Hono version.

**Server side (packages/api/src/index.ts):**
```typescript
// Build a typed route chain for RPC inference
const apiRoutes = new Hono()
  .route('/pipelines', pipelinesApp)
  .route('/repos', reposApp)
  .route('/feedback', feedbackApp)

const app = new Hono()
  .route('/', webhookApp)
  .route('/', healthApp)
  .route('/api', apiRoutes)

// Export type for RPC client -- MUST be typeof the chained app
export type AppType = typeof app
export default app
```

**Client side (packages/web/src/api/client.ts):**
```typescript
import { hc } from 'hono/client'
import type { AppType } from '@gstackapp/api'

// In development: Vite proxy handles /api -> localhost:3000
// In production: same-origin, no base URL needed
export const client = hc<AppType>('/')

// Query key factory for TanStack Query
export const queryKeys = {
  pipelines: {
    all: ['pipelines'] as const,
    list: () => [...queryKeys.pipelines.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.pipelines.all, 'detail', id] as const,
  },
  repos: {
    all: ['repos'] as const,
    list: () => [...queryKeys.repos.all, 'list'] as const,
  },
} as const
```

**tsconfig.json (packages/web):**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" },
    { "path": "../api" }
  ]
}
```

### Pattern 2: SSE Event Bus -> streamSSE -> React EventSource -> TanStack Query
**What:** In-process EventEmitter bridges pipeline state changes to connected SSE clients. React useSSE hook receives events and invalidates/updates TanStack Query cache.
**When to use:** Real-time pipeline progress (DASH-03, DASH-04, DASH-05).
**Critical detail:** The orchestrator currently does NOT emit events. We must add event emission at stage transitions.

**Backend event bus (packages/api/src/events/bus.ts):**
```typescript
import { EventEmitter } from 'node:events'

export type PipelineEventType =
  | 'pipeline:started'
  | 'pipeline:completed'
  | 'pipeline:failed'
  | 'stage:running'
  | 'stage:completed'

export interface PipelineEvent {
  type: PipelineEventType
  runId: string
  stage?: string
  verdict?: string
  timestamp: string
}

export const pipelineBus = new EventEmitter()
pipelineBus.setMaxListeners(50) // Multiple SSE clients
```

**SSE route (packages/api/src/routes/sse.ts):**
```typescript
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { pipelineBus, type PipelineEvent } from '../events/bus'

const sseApp = new Hono()

sseApp.get('/sse', async (c) => {
  return streamSSE(c, async (stream) => {
    const handler = (event: PipelineEvent) => {
      stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type,
        id: `${event.runId}-${event.type}-${Date.now()}`,
      })
    }

    pipelineBus.on('pipeline:event', handler)

    stream.onAbort(() => {
      pipelineBus.off('pipeline:event', handler)
    })

    // Heartbeat every 15s to detect stale connections
    while (true) {
      await stream.writeSSE({ data: '', event: 'heartbeat', id: '' })
      await stream.sleep(15000)
    }
  })
})

export default sseApp
```

**Orchestrator emission points (packages/api/src/pipeline/orchestrator.ts additions):**
```typescript
import { pipelineBus } from '../events/bus'

// After setting RUNNING status:
pipelineBus.emit('pipeline:event', {
  type: 'pipeline:started',
  runId: input.runId,
  timestamp: new Date().toISOString(),
})

// After each stage result persisted:
pipelineBus.emit('pipeline:event', {
  type: 'stage:completed',
  runId: input.runId,
  stage,
  verdict: output.verdict,
  timestamp: new Date().toISOString(),
})

// When a stage starts running (before allSettled, emit per-stage):
// This requires a slight restructure to emit 'stage:running' before each stage begins.
```

**React hook (packages/web/src/hooks/useSSE.ts):**
```typescript
import { useEffect, useRef, useCallback } from 'react'

interface UseSSEOptions {
  url: string
  onEvent: (event: MessageEvent) => void
  eventTypes?: string[]
}

export function useSSE({ url, onEvent, eventTypes = [] }: UseSSEOptions) {
  const esRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    const es = new EventSource(url)

    for (const type of eventTypes) {
      es.addEventListener(type, onEvent)
    }

    es.onerror = () => {
      // EventSource auto-reconnects -- no manual retry needed
      // But we can log for debugging
      console.warn('[SSE] Connection error, auto-reconnecting...')
    }

    esRef.current = es
    return es
  }, [url, onEvent, eventTypes])

  useEffect(() => {
    const es = connect()
    return () => {
      es.close()
    }
  }, [connect])
}
```

**SSE -> TanStack Query bridge (packages/web/src/hooks/useSSEQuerySync.ts):**
```typescript
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useSSE } from './useSSE'
import { queryKeys } from '../api/client'

export function useSSEQuerySync() {
  const queryClient = useQueryClient()

  const handleEvent = useCallback((event: MessageEvent) => {
    const data = JSON.parse(event.data)

    switch (event.type) {
      case 'pipeline:started':
      case 'pipeline:completed':
      case 'pipeline:failed':
        // Invalidate pipeline list + specific pipeline detail
        queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.all })
        break
      case 'stage:running':
      case 'stage:completed':
        // Invalidate specific pipeline detail for granular updates
        queryClient.invalidateQueries({
          queryKey: queryKeys.pipelines.detail(data.runId),
        })
        // Also invalidate list to update verdict dots on PR cards
        queryClient.invalidateQueries({
          queryKey: queryKeys.pipelines.list(),
        })
        break
    }
  }, [queryClient])

  useSSE({
    url: '/api/sse',
    onEvent: handleEvent,
    eventTypes: [
      'pipeline:started',
      'pipeline:completed',
      'pipeline:failed',
      'stage:running',
      'stage:completed',
    ],
  })
}
```

### Pattern 3: Tailwind CSS v4 Theme from DESIGN.md
**What:** Map all DESIGN.md tokens to Tailwind v4's CSS-first @theme configuration.
**When to use:** All styling across the dashboard.

**app.css:**
```css
@import "tailwindcss";

@theme {
  /* ── Background & Surface ── */
  --color-background: #0B0D11;
  --color-surface: #13161C;
  --color-surface-hover: #1A1D24;
  --color-border: #2A2F3A;
  --color-border-focus: #3D4350;

  /* ── Text ── */
  --color-text-primary: #EDEDED;
  --color-text-muted: #8B95A7;

  /* ── Accent (Electric Lime) ── */
  --color-accent: #C6FF3B;
  --color-accent-hover: #D4FF6A;
  --color-accent-muted: rgba(198, 255, 59, 0.12);
  --color-accent-dim: rgba(198, 255, 59, 0.06);

  /* ── Stage Identity Colors ── */
  --color-stage-ceo: #FF8B3E;
  --color-stage-eng: #36C9FF;
  --color-stage-design: #B084FF;
  --color-stage-qa: #2EDB87;
  --color-stage-security: #FF5A67;

  /* ── Verdict Colors ── */
  --color-verdict-pass: #2EDB87;
  --color-verdict-flag: #FFB020;
  --color-verdict-block: #FF5A67;
  --color-verdict-skip: #6F7C90;
  --color-verdict-running: #36C9FF;

  /* ── Cross-Repo ── */
  --color-insight: #FFD166;

  /* ── Typography ── */
  --font-display: 'General Sans', sans-serif;
  --font-body: 'Geist', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* ── Border Radius ── */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
}
```

### Pattern 4: Pipeline Topology with CSS/SVG
**What:** 5 horizontal stage nodes connected by SVG paths with animated traces.
**When to use:** The hero pipeline visualization (DASH-01, DASH-02).

```typescript
// StageNode.tsx -- individual stage with animations
interface StageNodeProps {
  stage: Stage
  verdict: Verdict | 'PENDING' | 'RUNNING'
  color: string  // Spectral identity color hex
}

// CSS classes mapped to verdict state:
// PENDING  -> opacity-20 (dimmed)
// RUNNING  -> opacity-100 + animate-pulse-glow (custom keyframe)
// PASS/FLAG/BLOCK/SKIP -> opacity-100 (dim-to-bright transition)

// The dim-to-bright reveal:
// transition: opacity 400ms ease;
// When verdict changes from RUNNING -> PASS/FLAG/BLOCK:
//   className goes from "opacity-20" to "opacity-100"
//   CSS transition handles the animation

// The running pulse (custom Tailwind animation):
// @keyframes pulse-glow {
//   0%, 100% { box-shadow: 0 0 8px var(--glow-color); }
//   50% { box-shadow: 0 0 24px var(--glow-color); }
// }
```

### Pattern 5: Vite Dev Proxy for API
**What:** Proxy `/api/*` requests from Vite dev server to Hono backend.
**When to use:** Development -- both servers run on different ports.

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

### Anti-Patterns to Avoid
- **Canvas-based pipeline rendering:** Don't use HTML Canvas or WebGL for 5 nodes. CSS/SVG is simpler, accessible, and trivially animatable. Canvas breaks text selection and accessibility.
- **Polling for pipeline updates:** SSE exists. Don't `setInterval` + `fetch`. The user locked D-07: "All animations driven by SSE events."
- **State management library (Redux, Zustand):** TanStack Query IS the server state manager. Local UI state (selected pipeline, expanded PR) uses React `useState`. No need for a separate store.
- **CSS-in-JS (styled-components, emotion):** Tailwind v4 is the locked styling solution (D-17). No runtime CSS overhead.
- **Separate WebSocket server:** SSE is unidirectional server-to-client, which is all we need. WebSocket adds bidirectional complexity for no benefit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API type safety | Manual TypeScript types for API responses | Hono RPC client `hc<AppType>` | Types are inferred from server route definitions. Zero code generation, zero drift. |
| Server state caching | Custom cache with `useState` + `useEffect` | TanStack Query v5 | Handles stale-while-revalidate, background refetch, cache invalidation, loading/error states. Years of edge case fixes. |
| CSS class merging | String concatenation with ternaries | `clsx` + `tailwind-merge` | Handles conditional classes, resolves Tailwind specificity conflicts (e.g., `p-2` vs `p-4`). |
| Date formatting | `new Date().toLocaleString()` | `date-fns` `formatDistanceToNow` | "2 hours ago" formatting with locale support, tree-shakeable, no moment.js bloat. |
| SSE reconnection | Manual retry logic with setTimeout | Native EventSource auto-reconnect | EventSource spec includes automatic reconnection with `retry` field. Browser handles it. |
| Form validation | Manual field checking | Zod schemas from `@gstackapp/shared` | Same schemas validate on both server and client. Single source of truth. |

**Key insight:** The entire stack is designed so that `packages/shared` Zod schemas are the single source of truth -- used by Hono for validation, by the RPC client for type inference, and by the frontend for response parsing. Don't create parallel type definitions.

## Common Pitfalls

### Pitfall 1: Hono RPC Type Inference Breaks in Monorepo
**What goes wrong:** `AppType` resolves to `any` in the frontend package, losing all type safety.
**Why it happens:** Missing TypeScript project references, mismatched Hono versions between packages, or the app is not exported as a chained type.
**How to avoid:**
1. `packages/web/tsconfig.json` MUST have `"references": [{ "path": "../api" }]`
2. Both packages MUST use the same Hono version (^4.12)
3. The exported `AppType` must be `typeof` a chained Hono app (method chaining preserves route types, `app.route()` assignment to a variable does too)
4. Set `"strict": true` in both tsconfig files
**Warning signs:** `hc<AppType>` methods show `any` return types in IDE.

### Pitfall 2: SSE EventSource + Vite Proxy
**What goes wrong:** EventSource connection drops, doesn't reconnect, or Vite proxy buffers SSE responses.
**Why it happens:** Vite's proxy may buffer responses before forwarding. SSE requires the response to stream immediately.
**How to avoid:**
1. Ensure Hono sets proper headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
2. Hono's `streamSSE` helper handles these headers automatically
3. Test SSE directly against port 3000 first, then verify through Vite proxy
**Warning signs:** SSE events arrive in bursts instead of real-time.

### Pitfall 3: TanStack Query Over-Invalidation from SSE
**What goes wrong:** Every SSE event triggers full refetch of all queries, causing UI flicker and unnecessary API calls.
**Why it happens:** Using broad `queryClient.invalidateQueries()` without proper query key scoping.
**How to avoid:**
1. Use a query key factory (see Pattern 1) with hierarchical keys
2. Invalidate at the most specific level: `stage:completed` invalidates only the specific pipeline detail, not all pipelines
3. Consider `queryClient.setQueryData()` for direct cache updates on simple events (pipeline status change) to avoid refetch entirely
**Warning signs:** Network tab shows duplicate requests, UI flickers on SSE events.

### Pitfall 4: CSS Animations Not Triggered on State Change
**What goes wrong:** Dim-to-bright reveal doesn't animate -- it just snaps to the new state.
**Why it happens:** React re-renders replace the DOM element entirely (new key), so the CSS transition has no "from" state. Or Tailwind classes change but the transition property isn't specified.
**How to avoid:**
1. Stage node components MUST have stable React keys (use stage name, not array index)
2. Use CSS `transition: opacity 400ms ease` on the node element
3. Toggle Tailwind opacity classes (`opacity-20` -> `opacity-100`) on state change -- the transition handles the animation
4. For the running pulse, use a Tailwind `@keyframes` defined in app.css, not inline styles
**Warning signs:** Animations snap instead of transitioning smoothly.

### Pitfall 5: Font Loading Flash (FOUT/FOIT)
**What goes wrong:** Dashboard renders in fallback system font, then jumps to General Sans / Geist when fonts load.
**Why it happens:** Web fonts loaded via CDN block rendering or cause layout shift.
**How to avoid:**
1. Preconnect to font CDNs in `index.html`: `<link rel="preconnect" href="https://fonts.cdnfonts.com" />`
2. Use `font-display: swap` (default for CDN fonts) to show fallback immediately
3. Define CSS font stack with appropriate fallbacks: `'General Sans', system-ui, sans-serif`
**Warning signs:** Text size/weight jumps after initial render.

### Pitfall 6: Pipeline Trace SVG Animation Performance
**What goes wrong:** SVG `stroke-dashoffset` animation for the signal trace causes jank or high CPU usage.
**Why it happens:** Animating SVG stroke properties on the main thread in complex layouts.
**How to avoid:**
1. Use CSS `@keyframes` with `stroke-dashoffset` -- browsers can GPU-accelerate this
2. Keep the SVG path simple (straight horizontal lines between nodes)
3. Use `will-change: stroke-dashoffset` sparingly on active traces only
4. The linear 2.5s loop animation (D-04) is lightweight -- don't overcomplicate
**Warning signs:** Dropped frames visible in DevTools performance panel.

## Code Examples

### Verified: Tailwind v4 CSS-First Theme Setup
```css
/* Source: https://tailwindcss.com/docs/customizing-colors */
@import "tailwindcss";

@theme {
  --color-background: #0B0D11;
  --color-surface: #13161C;
  /* All tokens become utilities: bg-background, bg-surface, text-accent, etc. */
}
```

### Verified: Hono RPC Client Creation
```typescript
// Source: https://hono.dev/docs/guides/rpc
import { hc } from 'hono/client'
import type { AppType } from '@gstackapp/api'

const client = hc<AppType>('/')

// Type-safe API call -- types inferred from server routes
const res = await client.api.pipelines.$get()
if (res.ok) {
  const data = await res.json() // Fully typed
}
```

### Verified: Hono streamSSE
```typescript
// Source: https://hono.dev/docs/helpers/streaming
import { streamSSE } from 'hono/streaming'

app.get('/api/sse', async (c) => {
  return streamSSE(c, async (stream) => {
    let id = 0
    while (true) {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'heartbeat' }),
        event: 'heartbeat',
        id: String(id++),
      })
      await stream.sleep(15000)
    }
  })
})
```

### Verified: TanStack Query Cache Invalidation
```typescript
// Source: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation
import { useQueryClient } from '@tanstack/react-query'

const queryClient = useQueryClient()

// Invalidate all queries matching prefix
queryClient.invalidateQueries({ queryKey: ['pipelines'] })

// Invalidate specific pipeline
queryClient.invalidateQueries({ queryKey: ['pipelines', 'detail', runId] })
```

### Verified: cn() Utility (clsx + tailwind-merge)
```typescript
// Common pattern used across React + Tailwind projects
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Running Pulse Animation (Custom Tailwind Keyframe)
```css
/* app.css -- custom animation for pipeline node running state */
@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 8px 2px var(--glow-color, rgba(54, 201, 255, 0.4));
  }
  50% {
    box-shadow: 0 0 24px 6px var(--glow-color, rgba(54, 201, 255, 0.6));
  }
}

/* Usage: style="--glow-color: #36C9FF" + class="animate-[pulse-glow_2s_ease-in-out_infinite]" */
```

### Pipeline Trace SVG Animation
```css
/* Signal flow along connector lines */
@keyframes trace-flow {
  0% { stroke-dashoffset: 100%; }
  100% { stroke-dashoffset: 0%; }
}

.pipeline-trace {
  stroke-dasharray: 8 8;
  animation: trace-flow 2.5s linear infinite;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tailwind.config.js | CSS-first @theme in app.css | Tailwind CSS v4 (Jan 2025) | No JS config file. Faster builds. @tailwindcss/vite plugin replaces PostCSS. |
| @vitejs/plugin-react (Babel) | @vitejs/plugin-react v6 (Oxc) | Vite 8 (Mar 2026) | No Babel dependency. Smaller install. Same API. |
| React.createElement | JSX runtime (react-jsx) | React 17+ (ongoing) | tsconfig needs `"jsx": "react-jsx"`, NOT `"jsx": "react"` |
| SWR / custom hooks | TanStack Query v5 | v5 stable (2024) | Simplified API, better TypeScript inference, smaller bundle |
| PostCSS + Tailwind | @tailwindcss/vite plugin | Tailwind v4 | Direct Vite plugin integration, no PostCSS config needed |

**Deprecated/outdated:**
- `tailwind.config.js` -- Tailwind v4 uses CSS-first config. The JS config file is legacy compatibility.
- `postcss.config.js` for Tailwind -- replaced by `@tailwindcss/vite` plugin.
- React `import React from 'react'` -- not needed with jsx runtime in tsconfig.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `packages/api/vitest.config.ts` (exists for API). Frontend needs `packages/web/vitest.config.ts` (Wave 0). |
| Quick run command | `npm test -- --workspace=packages/web` |
| Full suite command | `npm test` (runs all workspaces) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Pipeline hero takes 60%+ viewport | manual (visual) | Manual browser check | N/A |
| DASH-02 | 5 connected flow nodes with stage colors | unit | `vitest run src/__tests__/PipelineTopology.test.tsx` | Wave 0 |
| DASH-03 | SSE streaming of pipeline progress | integration | `vitest run src/__tests__/sse-integration.test.ts` (API-side) | Wave 0 |
| DASH-04 | Dim-to-bright reveal animation | manual (visual) | Manual browser check | N/A |
| DASH-05 | Running pulse animation | manual (visual) | Manual browser check | N/A |
| DASH-06 | Reverse-chrono PR feed | unit | `vitest run src/__tests__/PRFeed.test.tsx` | Wave 0 |
| DASH-07 | PR detail with findings by stage | unit | `vitest run src/__tests__/PRDetail.test.tsx` | Wave 0 |
| DASH-08 | Dashboard is landing page, no auth | smoke | `curl http://localhost:5173/ -s -o /dev/null -w '%{http_code}'` | N/A |
| DASH-09 | Desktop-only 1024px min, dark mode | manual (visual) | Manual browser check at 1024px | N/A |
| DASH-10 | DESIGN.md aesthetic compliance | manual (visual) | Manual visual comparison | N/A |

### Sampling Rate
- **Per task commit:** `npm test -- --workspace=packages/web` (if tests exist)
- **Per wave merge:** `npm test` (full suite across all packages)
- **Phase gate:** Full suite green + manual visual QA before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/web/vitest.config.ts` -- test configuration for frontend
- [ ] Frontend test setup (jsdom or happy-dom environment)
- [ ] `packages/api/src/__tests__/sse.test.ts` -- SSE endpoint streaming test
- [ ] `packages/api/src/__tests__/pipelines-route.test.ts` -- pipeline list/detail API test

**Note:** Most DASH requirements are visual/animation and best verified through manual browser inspection, not automated tests. The automated tests focus on data flow (API routes return correct data, SSE events fire, components render with correct props).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v22.22.0 | -- |
| npm | Package management | Yes | 10.9.4 | -- |
| TypeScript | Type checking | Yes | ^5.7 (workspace) | -- |
| Vite | Build/dev server | No (needs install) | Will install ^8.0.3 | -- |
| React | UI | No (needs install) | Will install ^19.2.4 | -- |
| Browser (any) | Manual visual QA | Yes (macOS) | -- | -- |

**Missing dependencies with no fallback:** None -- all are installable via npm.

**Missing dependencies with fallback:** None.

## Open Questions

1. **Recharts v2 vs v3**
   - What we know: CLAUDE.md says "Recharts ^2.15" but latest is 3.8.1. v3 has breaking API changes.
   - What's unclear: Whether the Recharts usage in Phase 6 (trends) will be affected by version choice now.
   - Recommendation: Install `recharts@^2` per spec. Charts are Phase 6 concern. Can upgrade later if needed.

2. **General Sans font licensing**
   - What we know: General Sans is "free for personal use" per CDNFonts. Indian Type Foundry (Fontshare) offers it as a free font.
   - What's unclear: Whether CDNFonts distribution is fully licensed for a SaaS product.
   - Recommendation: Use Fontshare (official ITF distribution, explicitly free for commercial use) or self-host the font files. Fontshare URL: `https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap`

3. **API App export refactor for RPC**
   - What we know: Current `packages/api/src/index.ts` uses `app.route()` but exports `app` as default, not as `AppType`.
   - What's unclear: Whether the current route mounting pattern preserves type inference for RPC (it should if we chain properly).
   - Recommendation: Refactor the app export to use method chaining for route mounting, and add `export type AppType = typeof app`. This is a mandatory change for Hono RPC to work.

4. **Orchestrator event emission -- stage-level granularity**
   - What we know: The orchestrator uses `Promise.allSettled` for all stages at once. There's no per-stage "starting" emission.
   - What's unclear: Whether we need to restructure the orchestrator to emit `stage:running` events individually before each stage starts (currently they all start simultaneously).
   - Recommendation: Emit `stage:running` for all stages immediately after `pipeline:started` (since they all begin at once with `Promise.allSettled`). The visual effect (all 5 stages pulsing simultaneously) is accurate to the actual execution model.

## Sources

### Primary (HIGH confidence)
- [Hono RPC docs](https://hono.dev/docs/guides/rpc) - AppType export, hc client, monorepo TypeScript references
- [Hono streaming docs](https://hono.dev/docs/helpers/streaming) - streamSSE API, writeSSE method
- [Tailwind CSS v4 customizing colors](https://tailwindcss.com/docs/customizing-colors) - @theme directive, CSS-first color configuration
- [TanStack Query invalidation docs](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation) - queryClient.invalidateQueries API
- npm registry - verified all package versions (2026-03-30)

### Secondary (MEDIUM confidence)
- [Hono RPC in Monorepos - Catalin's Tech](https://catalins.tech/hono-rpc-in-monorepos/) - TypeScript project references setup, common pitfalls
- [React Query + SSE integration - Fragmented Thought](https://fragmentedthought.com/blog/2025/react-query-caching-with-server-side-events) - EventSource + TanStack Query cache update pattern
- [CDNFonts General Sans](https://www.cdnfonts.com/general-sans.font) - CDN embed code for General Sans
- [Fontshare General Sans](https://fontshare.com/fonts/general-sans) - Official ITF distribution (free commercial use)
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) - Rolldown bundler, @vitejs/plugin-react v6

### Tertiary (LOW confidence)
- [TanStack Query SSE discussion #418](https://github.com/TanStack/query/discussions/418) - Community patterns for EventSource integration (no official solution)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All versions verified against npm registry, stack locked in CLAUDE.md and CONTEXT.md
- Architecture: HIGH - Patterns verified against official docs (Hono RPC, streamSSE, Tailwind v4). Monorepo structure follows existing project conventions.
- Pitfalls: HIGH - Monorepo RPC type inference, SSE proxy buffering, and CSS animation triggering are well-documented issues with clear solutions
- Design system: HIGH - All tokens from DESIGN.md are concrete (hex values, pixel values, easing curves) and map directly to Tailwind v4 @theme variables

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable stack, no fast-moving dependencies)
