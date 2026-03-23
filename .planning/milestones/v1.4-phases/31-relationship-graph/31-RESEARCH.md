# Phase 31: Relationship Graph - Research

**Researched:** 2026-03-22
**Domain:** D3-force visualization in React + Vite, code splitting, SVG graph rendering
**Confidence:** HIGH

## Summary

Phase 31 adds an interactive force-directed graph visualization showing project dependency relationships. The existing `/api/projects` endpoint already returns all needed data: each project includes `slug`, `name`, `host`, `riskLevel`, and `dependsOn[]`. No new API endpoint is required -- the graph component consumes the same data the departure board uses.

The implementation involves three concerns: (1) a pure data transformation layer that converts the flat project list into graph nodes and edges, (2) a D3-force simulation managed via React hooks that computes layout positions, and (3) an SVG rendering layer driven by React state. The graph view is a new view in the existing `View` union type (adding `"graph"` alongside `"dashboard"` and `"network"`), lazy-loaded via `React.lazy` so d3-force stays out of the main bundle.

**Primary recommendation:** Use `d3-force` 3.0 as the sole D3 module (no full D3 install). Render SVG elements via React JSX, not D3 DOM manipulation. Manage simulation lifecycle in `useEffect` with proper cleanup. Code-split via `React.lazy` + `Suspense` with a loading skeleton.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Hover a node: tooltip with project name, health status, dependency count
- **D-02:** Click a node: highlights its dependency chain (upstream + downstream), dims unrelated nodes
- **D-03:** Drag to rearrange node positions, zoom/pan to navigate
- **D-04:** Force-directed layout settles naturally, user can pin nodes by dragging
- **D-05:** Each node shows project name + health dot (colored by health status)
- **D-06:** Host indicated by node border color (local vs mac-mini) -- no separate badge
- **D-07:** Minimal, clean graph -- details available on hover/click
- **D-08:** D3-force for force-directed layout (~40KB, scoped to d3-force module only)
- **D-09:** Lazy-loaded via React.lazy and code-split -- d3-force not in main dashboard bundle (INTEL-08)
- **D-10:** Graph is a separate route/view, not embedded in the departure board

### Claude's Discretion
- D3-force simulation parameters (charge strength, link distance, collision radius)
- Edge styling (arrows, thickness, color)
- Tooltip design and positioning
- Graph container sizing and responsive behavior
- Color palette for host differentiation

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTEL-07 | User can view an interactive project relationship graph showing dependency connections, colored by host/status | D3-force simulation with SVG rendering; nodes colored by riskLevel health dots; borders colored by host; edges from dependsOn arrays |
| INTEL-08 | Relationship graph is force-directed (d3-force), lazy-loaded, and code-split via React.lazy | d3-force 3.0 as dynamic import; React.lazy wraps graph page component; Vite auto-splits the chunk |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| d3-force | 3.0.0 | Force-directed layout simulation | Only D3 module needed; industry standard for force layout; ~90KB unpacked but tree-shakes well |
| @types/d3-force | 3.0.10 | TypeScript definitions for d3-force | SimulationNodeDatum, SimulationLinkDatum interfaces |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React 19 | existing | JSX-driven SVG rendering | Already installed; render graph elements as React components |
| Vite 6 | existing | Code splitting via dynamic import() | Already configured; React.lazy triggers automatic chunk splitting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| d3-force (raw) | react-force-graph | Pre-built but uses Canvas/WebGL, adds 200KB+, opinionated styling conflicts with MC design system |
| d3-force (raw) | @visx/network | Lighter abstraction but still requires d3-force underneath; adds unnecessary indirection |
| SVG rendering | Canvas rendering | Canvas performs better at >500 nodes but MC has ~25 projects; SVG enables CSS styling + accessibility + React event handling |

**Installation:**
```bash
pnpm --filter @mission-control/web add d3-force
pnpm --filter @mission-control/web add -D @types/d3-force
```

**Version verification:** d3-force 3.0.0 confirmed current via npm registry (2026-03-22). @types/d3-force 3.0.10 confirmed current.

## Architecture Patterns

### Recommended Project Structure
```
packages/web/src/
  components/
    graph/
      relationship-graph.tsx       # Main page component (lazy-loaded entry)
      graph-canvas.tsx             # SVG container + simulation manager
      graph-node.tsx               # Individual node (circle + label)
      graph-edge.tsx               # Edge line between nodes
      graph-tooltip.tsx            # Hover tooltip
    layout/
      dashboard-layout.tsx         # Updated: View type gains "graph"
  lib/
    graph-data.ts                  # Pure function: ProjectItem[] -> GraphNode[] + GraphEdge[]
  hooks/
    use-force-simulation.ts        # Hook: manages d3-force lifecycle
  __tests__/
    lib/
      graph-data.test.ts           # Pure function tests
    components/
      relationship-graph.test.tsx  # Component render tests
```

### Pattern 1: React Owns Rendering, D3 Owns Layout
**What:** D3-force computes `x, y` positions via simulation; React renders SVG elements using those positions as state.
**When to use:** Always for React + D3 integration. Never let D3 manipulate the DOM directly.
**Example:**
```typescript
// Source: https://d3js.org/d3-force/simulation
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

interface GraphNode extends SimulationNodeDatum {
  id: string;         // project slug
  name: string;
  host: "local" | "mac-mini" | "github";
  riskLevel: "healthy" | "warning" | "critical" | "unmonitored";
  dependencyCount: number;
}

interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string;  // slug of dependent
  target: string;  // slug of dependency
}
```

### Pattern 2: Simulation Lifecycle in useEffect
**What:** Create simulation on mount, update nodes/links when data changes, stop + cleanup on unmount.
**When to use:** Every d3-force + React integration.
**Example:**
```typescript
// Source: https://d3js.org/d3-force/simulation
function useForceSimulation(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const [positions, setPositions] = useState<GraphNode[]>([]);
  const simulationRef = useRef<Simulation<GraphNode, GraphEdge> | null>(null);

  useEffect(() => {
    const sim = forceSimulation(nodes)
      .force("charge", forceManyBody().strength(-200))
      .force("link", forceLink<GraphNode, GraphEdge>(edges).id(d => d.id).distance(120))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(40))
      .on("tick", () => {
        setPositions([...sim.nodes()]);
      });

    simulationRef.current = sim;

    return () => { sim.stop(); };
  }, [nodes, edges, width, height]);

  return { positions, simulationRef };
}
```

### Pattern 3: Lazy Loading with React.lazy
**What:** The graph page is imported via `React.lazy(() => import(...))` so Vite creates a separate chunk.
**When to use:** For the graph view entry point to satisfy INTEL-08.
**Example:**
```typescript
// In App.tsx
import { lazy, Suspense } from "react";

const RelationshipGraph = lazy(() => import("./components/graph/relationship-graph.js"));

// In render:
{view === "graph" ? (
  <Suspense fallback={<GraphSkeleton />}>
    <RelationshipGraph projects={allProjects} />
  </Suspense>
) : view === "network" ? (
  <NetworkPage />
) : (
  // ... dashboard content
)}
```

### Pattern 4: SVG Zoom/Pan via viewBox Transform
**What:** Use mouse events to update a viewBox-based transform state for zoom and pan.
**When to use:** When the graph needs to be navigable (D-03).
**Example:**
```typescript
// SVG zoom/pan state
const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

// Apply via SVG group transform
<svg width={width} height={height}>
  <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
    {/* edges and nodes rendered here */}
  </g>
</svg>
```

### Pattern 5: Node Dragging via fx/fy Pinning
**What:** D3-force supports `fx` and `fy` properties on nodes that pin them in place. Set these on drag start, update during drag, and optionally clear on drag end (or keep pinned per D-04).
**When to use:** For D-03 (drag) and D-04 (pin nodes by dragging).
**Example:**
```typescript
// Source: https://d3js.org/d3-force/simulation
function handleDragStart(node: GraphNode) {
  simulationRef.current?.alphaTarget(0.3).restart();
  node.fx = node.x;
  node.fy = node.y;
}

function handleDrag(node: GraphNode, x: number, y: number) {
  node.fx = x;
  node.fy = y;
}

function handleDragEnd(node: GraphNode) {
  simulationRef.current?.alphaTarget(0);
  // Keep pinned (D-04): don't clear fx/fy
  // To unpin: node.fx = null; node.fy = null;
}
```

### Anti-Patterns to Avoid
- **D3 DOM manipulation in React:** Never use `d3.select()` to create/remove SVG elements. React owns the DOM; D3 only computes positions.
- **Re-creating simulation on every render:** The simulation is expensive. Create once in useEffect, update via `.nodes()` and force `.links()` when data changes.
- **Storing node positions in React state on every tick:** Use `requestAnimationFrame` or throttle state updates. The simulation ticks ~300 times during settling; updating React state on every tick causes unnecessary renders.
- **Full D3 import:** `import * as d3 from "d3"` pulls 500KB+. Only import `d3-force` submodule functions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Force-directed layout | Custom physics engine | `d3-force` forceSimulation | Barnes-Hut approximation, velocity Verlet integration, configurable forces -- production-quality physics |
| SVG zoom/pan | Custom event math | SVG viewBox + transform state or a lightweight zoom utility | Edge cases with touch events, wheel normalization, bounds clamping |
| Collision detection | Manual overlap checking | `d3-force` forceCollide | Quadtree-based, O(n log n), handles arbitrary radii |

**Key insight:** D3-force handles all the hard physics. The React layer only needs to render positioned SVG elements and handle user interactions (hover, click, drag).

## Common Pitfalls

### Pitfall 1: D3-force Mutates Input Arrays
**What goes wrong:** Passing the projects array directly to `forceSimulation()` mutates each object in place (adds `x`, `y`, `vx`, `vy`, `index`). This corrupts shared state.
**Why it happens:** D3-force is designed to mutate for performance.
**How to avoid:** Clone the data before passing to simulation: `nodes.map(n => ({ ...n }))`.
**Warning signs:** Other components rendering stale `x`/`y` values, or React warnings about state mutations.

### Pitfall 2: Simulation Never Settles (Infinite Re-renders)
**What goes wrong:** Calling `setPositions()` on every tick triggers re-render, which re-creates the simulation, which restarts ticking.
**Why it happens:** Missing dependency management in useEffect. Or creating new node/edge arrays on every render (reference equality).
**How to avoid:** Memoize the nodes/edges arrays passed to the hook. Use `useRef` for the simulation instance. Only recreate on actual data changes.
**Warning signs:** CPU pegged at 100%, graph never stops moving.

### Pitfall 3: Graph Links Reference Indices Instead of IDs
**What goes wrong:** D3-force defaults to identifying nodes by array index. If the array order changes, links connect wrong nodes.
**Why it happens:** Forgetting to call `.id(d => d.id)` on forceLink.
**How to avoid:** Always set `.id(d => d.id)` on the link force, using project slugs as stable identifiers.
**Warning signs:** Edges connecting visually wrong nodes, especially after data refresh.

### Pitfall 4: Code Split Not Working
**What goes wrong:** d3-force ends up in the main bundle despite React.lazy.
**Why it happens:** Importing d3-force types or constants in shared modules that are eagerly loaded.
**How to avoid:** Ensure d3-force is only imported inside the lazily-loaded component tree. Type-only imports (`import type`) are fine -- they are erased at compile time.
**Warning signs:** Main bundle size increases by ~40KB after adding d3-force. Check with `vite build && ls -la dist/assets/`.

### Pitfall 5: SVG Event Handling for Drag
**What goes wrong:** Mouse events on SVG elements don't work as expected when zoom/pan transform is applied.
**Why it happens:** SVG mouse coordinates need to be transformed through the inverse of the current zoom/pan transform.
**How to avoid:** Convert mouse coordinates from screen space to graph space using the current transform: `(mouseX - transform.x) / transform.scale`.
**Warning signs:** Dragged nodes jump to wrong positions, especially after zooming.

### Pitfall 6: Upstream/Downstream Highlight Computation
**What goes wrong:** Click highlight (D-02) only shows direct dependencies, not the full upstream + downstream chain.
**Why it happens:** Traversal stops at one level instead of recursing.
**How to avoid:** Implement recursive traversal: for upstream, follow dependsOn transitively; for downstream, find all projects whose dependsOn includes the selected node, then recurse.
**Warning signs:** Clicking a root dependency only highlights its immediate dependents.

## Code Examples

Verified patterns from official sources and codebase:

### Data Transformation: Projects to Graph
```typescript
// graph-data.ts - Pure function, easily testable
import type { ProjectItem } from "./grouping.js";

export interface GraphNode {
  id: string;
  name: string;
  host: "local" | "mac-mini" | "github";
  riskLevel: "healthy" | "warning" | "critical" | "unmonitored";
  dependencyCount: number;
  // d3-force will add: x, y, vx, vy, index
}

export interface GraphEdge {
  source: string;  // dependent slug
  target: string;  // dependency slug
}

export function buildGraphData(projects: ProjectItem[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const slugSet = new Set(projects.map(p => p.slug));

  const nodes: GraphNode[] = projects.map(p => ({
    id: p.slug,
    name: p.name,
    host: p.host,
    riskLevel: p.riskLevel ?? "unmonitored",
    dependencyCount: p.dependsOn.length,
  }));

  const edges: GraphEdge[] = [];
  for (const p of projects) {
    for (const dep of p.dependsOn) {
      if (slugSet.has(dep)) {
        edges.push({ source: p.slug, target: dep });
      }
    }
  }

  return { nodes, edges };
}
```

### Highlight Chain Traversal
```typescript
// graph-data.ts - Pure function for D-02 (click highlights)
export function getHighlightChain(
  slug: string,
  projects: ProjectItem[]
): Set<string> {
  const highlighted = new Set<string>([slug]);

  // Build adjacency maps
  const dependsOnMap = new Map<string, string[]>();
  const dependedByMap = new Map<string, string[]>();
  for (const p of projects) {
    dependsOnMap.set(p.slug, p.dependsOn);
    for (const dep of p.dependsOn) {
      const list = dependedByMap.get(dep) ?? [];
      list.push(p.slug);
      dependedByMap.set(dep, list);
    }
  }

  // Traverse upstream (what slug depends on)
  function walkUp(s: string) {
    for (const dep of dependsOnMap.get(s) ?? []) {
      if (!highlighted.has(dep)) {
        highlighted.add(dep);
        walkUp(dep);
      }
    }
  }

  // Traverse downstream (what depends on slug)
  function walkDown(s: string) {
    for (const dep of dependedByMap.get(s) ?? []) {
      if (!highlighted.has(dep)) {
        highlighted.add(dep);
        walkDown(dep);
      }
    }
  }

  walkUp(slug);
  walkDown(slug);
  return highlighted;
}
```

### Host Border Colors (Reusing Existing Tokens)
```typescript
// Source: packages/web/src/components/ui/host-badge.tsx
// Reuse these colors for node borders per D-06
const HOST_BORDER_COLORS: Record<string, string> = {
  local: "#9c8b7e",      // warm-gray
  "mac-mini": "#d4713a",  // terracotta
  github: "#6366f1",      // indigo-500
};
```

### Health Dot Colors (Reusing Existing Tokens)
```typescript
// Source: packages/web/src/lib/health-colors.ts
// Reuse for node fill per D-05
const RISK_FILL_COLORS: Record<string, string> = {
  healthy: "#6b8f71",     // sage
  warning: "#c49b2a",     // gold-status
  critical: "#b7410e",    // rust
  unmonitored: "#9c8b7e", // warm-gray (muted)
};
```

### Recommended Simulation Parameters (Claude's Discretion)
```typescript
// Tuned for ~25 nodes in a ~800x500 viewport
const SIMULATION_CONFIG = {
  chargeStrength: -200,     // Moderate repulsion (default -30 is too weak for readable spacing)
  linkDistance: 120,         // Enough space for labels between connected nodes
  collideRadius: 45,        // Node radius + padding to prevent overlap
  centerStrength: 0.05,     // Gentle centering pull (prevents drift to edges)
  alphaDecay: 0.02,         // Slightly slower settling for smoother animation
  velocityDecay: 0.4,       // Default friction
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| D3 manages DOM directly | React renders SVG, D3 computes layout | ~2020 onwards | Clean separation of concerns, proper React lifecycle |
| Full `d3` package (500KB+) | Modular subpackage imports (`d3-force`) | D3 v4+ (2016) | Minimal bundle impact |
| Canvas for all graphs | SVG for small graphs (<100 nodes), Canvas for large | Ongoing | SVG offers CSS styling + accessibility for small graphs |
| d3-force v2 | d3-force v3.0.0 | 2022 | ESM exports, TypeScript-ready |

**Deprecated/outdated:**
- `d3-force` v1.x: Pre-ESM, no TypeScript support
- Using `d3.select()` inside React components: Fights React's reconciliation

## Open Questions

1. **Exactly how many projects does MC currently manage?**
   - What we know: The config supports ~25 projects based on the project list in CLAUDE.md
   - What's unclear: Exact count with multi-copy entries
   - Recommendation: SVG is optimal for this scale. No performance concern. If it ever grows past 100, migrate to Canvas.

2. **Should the graph link to project detail (hero card) on double-click?**
   - What we know: D-02 says click highlights the chain. No mention of navigation.
   - What's unclear: Whether clicking should also select the project in the departure board.
   - Recommendation: Single click highlights chain (D-02). Optionally double-click or Cmd+click navigates to dashboard with that project selected. Keep it simple for v1.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- this is a pure frontend phase using npm packages in an existing React/Vite project).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1 |
| Config file | `packages/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/web test` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTEL-07 | Interactive graph showing dependency connections colored by host/status | unit + smoke | `pnpm --filter @mission-control/web test -- graph-data` | No -- Wave 0 |
| INTEL-07 | Highlight chain traversal (upstream + downstream) | unit | `pnpm --filter @mission-control/web test -- graph-data` | No -- Wave 0 |
| INTEL-07 | Node coloring by health status and host | unit | `pnpm --filter @mission-control/web test -- relationship-graph` | No -- Wave 0 |
| INTEL-08 | d3-force code-split (not in main bundle) | build verification | `pnpm --filter @mission-control/web build && ls -la dist/assets/` | No -- manual check |
| INTEL-08 | React.lazy loads graph component | unit | `pnpm --filter @mission-control/web test -- relationship-graph` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/web test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/web/src/__tests__/lib/graph-data.test.ts` -- covers buildGraphData and getHighlightChain (INTEL-07)
- [ ] `packages/web/src/__tests__/components/relationship-graph.test.tsx` -- covers rendering, lazy loading (INTEL-07, INTEL-08)

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** -- no `any` types, use `unknown`
- **Naming:** files `kebab-case.ts`, types `PascalCase`, functions `camelCase`, constants `SCREAMING_SNAKE_CASE`
- **Module system:** ESM throughout
- **Conventional commits:** `feat(scope):`, `fix(scope):`
- **Testing:** Vitest, run `pnpm test`
- **Zod schemas** for API boundaries (graph data is client-side only, so Zod not needed for this phase)
- **No `any` types** -- use `unknown` or explicit types from `@types/d3-force`

## Sources

### Primary (HIGH confidence)
- [d3-force simulation API](https://d3js.org/d3-force/simulation) -- complete API reference for forceSimulation, alpha params, tick events
- [d3-force many-body API](https://d3js.org/d3-force/many-body) -- forceManyBody defaults (strength: -30, theta: 0.9)
- [d3-force link API](https://d3js.org/d3-force/link) -- forceLink defaults (distance: 30, id: index-based)
- [d3-force collide API](https://d3js.org/d3-force/collide) -- forceCollide defaults (radius: 1, strength: 1)
- npm registry -- d3-force 3.0.0, @types/d3-force 3.0.10 (verified 2026-03-22)
- Existing codebase -- `packages/web/src/lib/grouping.ts` (ProjectItem type), `packages/web/src/lib/health-colors.ts` (SEVERITY_COLORS), `packages/web/src/components/ui/host-badge.tsx` (host color tokens)

### Secondary (MEDIUM confidence)
- [React + D3 force graph guide](https://medium.com/@qdangdo/visualizing-connections-a-guide-to-react-d3-force-graphs-typescript-74b7af728c90) -- TypeScript integration patterns
- [How to implement D3.js force-directed graph in 2025](https://dev.to/nigelsilonero/how-to-implement-a-d3js-force-directed-graph-in-2025-5cl1) -- Current best practices
- [React + D3 network chart](https://www.react-graph-gallery.com/network-chart) -- SVG rendering pattern
- [Code splitting with React.lazy + Vite](https://dev.to/sperez927/slice-your-js-lazy-load-components-with-react-vite-dynamic-imports-mp8) -- Verified Vite auto-splitting behavior

### Tertiary (LOW confidence)
None -- all findings verified with official sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- d3-force 3.0 is the uncontested standard for force-directed layout; version verified against npm
- Architecture: HIGH -- React-renders-SVG + D3-computes-layout is the established pattern; existing codebase patterns (View union type, component structure) are well understood
- Pitfalls: HIGH -- d3-force mutation, simulation lifecycle, and event coordinate translation are well-documented common issues

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable domain, d3-force has not had a breaking change since v3.0)
