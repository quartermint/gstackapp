# Phase 9: Dashboard Intelligence - Research

**Researched:** 2026-03-15
**Domain:** React frontend components — risk feed, sprint timeline, health dots
**Confidence:** HIGH

## Summary

Phase 9 is a pure frontend phase. All API endpoints are built and tested (Phase 8): `/api/risks` returns severity-grouped findings with `isNew` flags and `riskCount`, `/api/sprint-timeline` returns segment-based activity data with `focusedProject`, and `/api/health-checks/:slug` returns per-project findings with `riskLevel`. The `/api/projects` response already includes `healthScore`, `riskLevel`, and `copyCount` per project. SSE events `health:changed` and `copy:diverged` are wired in `use-sse.ts`.

The work is three independent UI components that consume these endpoints: (1) a risk feed above the departure board, (2) a sprint timeline replacing the heatmap, and (3) health dot indicators on project cards. All three follow established patterns in the codebase -- TanStack-style hooks (actually raw `useState`/`useEffect` with `fetchCounter` pattern), Tailwind v4 with `@theme` tokens, and the existing expandable `PreviouslyOn` pattern for inline detail panels.

**Primary recommendation:** Build three new component groups plus three new data hooks, wire into `App.tsx` layout, and add `document.title` risk count. No new dependencies needed. Custom SVG/CSS for timeline (no charting library), `navigator.clipboard.writeText()` for action hints.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Risk Feed Layout:** Compact single-line cards -- severity icon + project + problem + duration + action hint, all on one line per finding. Cards grouped by severity (critical first), non-dismissable. When clean: subtle green bar showing "All projects healthy". Action hints are copy-command -- clicking copies git command to clipboard. "new" badge on findings detected in current scan cycle.
- **Color Treatment:** Warm palette adapted for severity -- deep rust for critical, warm gold for warning, sage green for healthy. Matches terracotta/Arc design energy, not standard red/amber/green.
- **Sprint Timeline:** Thin bars (8-12px) per project swimlane. Top 10 by activity. Focused project highlighting -- most commits in last 7 days gets full saturation, others are muted/dimmed. Hover shows commit count + date range; click navigates to project on departure board. Custom SVG/CSS rendering.
- **Health Dot Indicators:** Position: right side with badges -- alongside existing dirty-files badge and branch badge. Green/amber/red dot based on worst active finding. Split dot for multi-copy divergence. Expand-on-click: compact format matching risk feed density -- single-line per finding. Same expandable pattern as "Previously On" commit breadcrumbs.

### Claude's Discretion
- Exact dot size and split-dot visual treatment
- Sprint timeline segment gap threshold (recommend 3 calendar days)
- Risk feed animation/transition when findings resolve
- Page title risk count format (e.g., "(3) Mission Control")
- Sprint timeline density color ramp (light to saturated within warm palette)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RISK-01 | Risk feed appears above departure board with severity-grouped cards (critical first) | API: `GET /api/risks` returns `{ critical: [], warning: [], riskCount, summary }`. Layout slot in `App.tsx` between capture field and sprint timeline. |
| RISK-02 | Each card shows severity icon, project name, problem description, duration, action hint | API response includes `detail`, `detectedAt`, `projectSlug`, `severity`, `metadata` (contains actionable info). Duration computed from `detectedAt`. |
| RISK-03 | Cards are non-dismissable -- disappear only when underlying issue resolves | Cards render from API data; no local dismiss state. SSE `health:changed` triggers refetch. |
| TMLN-01 | Horizontal swimlane chart replaces heatmap, showing project bars with commit density over 12 weeks | API: `GET /api/sprint-timeline` returns `{ projects: [{ slug, segments, totalCommits }], focusedProject, windowDays }`. Replaces `SprintHeatmap` in layout. |
| TMLN-02 | Currently-focused project (most commits in last 7 days) is highlighted | API returns `focusedProject` slug. Full saturation for focused, muted for others. |
| TMLN-03 | Hover shows commit count + date range; click navigates to project on departure board | Tooltip on segment hover; click calls existing `onSelect(slug)` from App state. |
| HDOT-01 | Project cards show green/amber/red health dot based on worst active finding | `/api/projects` already returns `riskLevel` per project. Add dot to `ProjectRow` badge area. |
| HDOT-02 | Multi-copy projects with divergence show split dot indicator | `/api/projects` returns `copyCount`. Per-project findings available via `GET /api/health-checks/:slug`. Split dot when `copyCount > 1` and diverged finding active. |
| HDOT-03 | Clicking health dot expands inline findings panel (same pattern as "Previously On") | Reuse `PreviouslyOn` expand/collapse pattern (`max-h-0/max-h-60` transition). Fetch `/api/health-checks/:slug` on expand. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.0.0 | UI framework | Already in use, no change |
| Tailwind CSS | 4.0.0 | Styling via `@theme` tokens | Already in use, warm palette tokens defined in `app.css` |
| Hono Client | 4.6.0 | Typed API client (`hc<AppType>`) | Already in use for all data fetching |
| Vitest | 2.1.0 | Test runner | Already configured in `packages/web/vitest.config.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/react | 16.3.2 | Component testing | Already installed, use for risk feed and timeline tests |
| @testing-library/user-event | 14.6.1 | User interaction simulation | Click-to-copy, expand/collapse testing |
| jsdom | 28.1.0 | DOM environment for tests | Already configured in vitest |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom SVG timeline | D3.js / Recharts / Nivo | User explicitly locked "custom SVG/CSS rendering" -- no charting library. Matches v1.0 heatmap approach. |
| Custom tooltip | Floating UI / Radix Tooltip | Overkill for simple hover tooltips. Use native `title` attributes or lightweight CSS-only tooltip. |
| Clipboard API | clipboard-copy npm | `navigator.clipboard.writeText()` is universally supported in modern browsers. No polyfill needed. |

**Installation:**
```bash
# No new dependencies needed -- everything is already installed
```

## Architecture Patterns

### Recommended Component Structure
```
packages/web/src/
├── components/
│   ├── risk-feed/
│   │   ├── risk-feed.tsx           # Container: fetches risks, renders list or clean bar
│   │   └── risk-card.tsx           # Single-line finding card with copy-command action
│   ├── sprint-timeline/
│   │   ├── sprint-timeline.tsx     # Container: fetches timeline, renders swimlanes
│   │   ├── timeline-swimlane.tsx   # Single project row (label + bar segments)
│   │   └── timeline-tooltip.tsx    # Hover tooltip for segment details
│   ├── departure-board/
│   │   ├── project-row.tsx         # MODIFIED: add health dot + findings expand
│   │   ├── health-dot.tsx          # NEW: green/amber/red/split dot component
│   │   └── findings-panel.tsx      # NEW: inline expandable findings list
│   └── heatmap/                    # Existing — kept but no longer rendered in layout
├── hooks/
│   ├── use-risks.ts                # NEW: fetch /api/risks, SSE refetch
│   ├── use-sprint-timeline.ts      # NEW: fetch /api/sprint-timeline, SSE refetch
│   └── use-project-health.ts       # NEW: fetch /api/health-checks/:slug (lazy, on expand)
└── lib/
    └── health-colors.ts            # NEW: severity → warm palette color mapping
```

### Pattern 1: Data Fetching with SSE Invalidation
**What:** Use the existing `fetchCounter` pattern for hooks (not TanStack Query — project doesn't use it). SSE `health:changed` event triggers refetch of risk and health data.
**When to use:** All three new hooks.
**Example:**
```typescript
// Source: Existing pattern in use-heatmap.ts
export function useRisks() {
  const [data, setData] = useState<RisksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchRisks() {
      try {
        const res = await client.api.risks.$get();
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json as unknown as RisksResponse);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRisks();
    return () => { cancelled = true; };
  }, [fetchCounter]);

  const refetch = useCallback(() => setFetchCounter(c => c + 1), []);
  return { data, loading, refetch };
}
```

### Pattern 2: Expand/Collapse with CSS Transitions
**What:** Max-height transition for expandable panels (health dot findings, same as PreviouslyOn).
**When to use:** Health dot inline findings panel.
**Example:**
```typescript
// Source: Existing pattern in project-row.tsx line 115-123
<div
  className={`overflow-hidden transition-all duration-200 ease-in-out ${
    expanded ? "max-h-60 opacity-100 mt-2" : "max-h-0 opacity-0"
  }`}
>
  {expanded && <FindingsPanel findings={findings} />}
</div>
```

### Pattern 3: Clipboard Copy with Feedback
**What:** `navigator.clipboard.writeText()` for action hint copy-to-clipboard with brief visual feedback.
**When to use:** Risk card action hints, findings panel action hints.
**Example:**
```typescript
async function handleCopy(command: string) {
  try {
    await navigator.clipboard.writeText(command);
    // Brief visual feedback — swap icon or text for 1.5s
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  } catch {
    // Fallback: no-op, command is visible as text
  }
}
```

### Pattern 4: Document Title with Risk Count
**What:** Set `document.title` reactively based on risk count.
**When to use:** In `App.tsx` or as a custom hook triggered by risk data.
**Example:**
```typescript
// RISK-04 (already complete in Phase 8, but title update is frontend)
useEffect(() => {
  const count = risks?.riskCount ?? 0;
  document.title = count > 0 ? `(${count}) Mission Control` : "Mission Control";
}, [risks?.riskCount]);
```

### Anti-Patterns to Avoid
- **Separate tooltip library:** Don't install Floating UI or Radix for timeline tooltips. Use CSS-positioned absolute divs with mouse position tracking (lightweight, no dependency).
- **Fetching health per project on list render:** Don't call `/api/health-checks/:slug` for every project card. The `/api/projects` response already includes `riskLevel` and `healthScore`. Only fetch per-project details on health dot expand (lazy load).
- **Removing heatmap components:** Don't delete `components/heatmap/` -- the heatmap API route is deprecated but not removed. Keep files for reference. Just stop rendering `SprintHeatmap` in `App.tsx`.
- **Over-animating risk feed:** Risk feed is a status bar, not an alert panel. Avoid shake, bounce, or attention-grabbing animations. Simple fade-in/fade-out on card appearance/disappearance.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Severity color mapping | Inline color logic in each component | Shared `health-colors.ts` utility | Three components (risk feed, health dot, findings panel) all need the same severity-to-color mapping. Warm palette colors are non-obvious (`rust` not `red`, `gold-status` not `amber`, `sage` not `green`). |
| Relative time from ISO string | Custom date math | Existing `formatRelativeTime()` from `lib/time.ts` | Already used in `ProjectRow`. "detected 3 days ago" from `detectedAt` ISO string. |
| Expand/collapse animation | Custom animation library | CSS `max-h` transition pattern from `PreviouslyOn` | Already proven in the codebase, consistent UX. |
| Action hint command generation | Frontend logic for git commands | API `metadata` field | The `metadata` JSON from health findings contains the machine-readable data (e.g., `{ count: 54, public: true }`). The `detail` field is human-readable. Action hints should be derived from `checkType` mapping (e.g., `unpushed_commits` -> `git push origin main`). |

**Key insight:** The API already does the heavy lifting. Phase 9 is rendering -- all data shaping (severity grouping, risk counting, segment computation, focused project detection) happens server-side. The frontend should be thin presentation.

## Common Pitfalls

### Pitfall 1: N+1 API Calls for Health Dots
**What goes wrong:** Calling `/api/health-checks/:slug` for every visible project card to determine the dot color.
**Why it happens:** Natural instinct to fetch per-project health data where the dot renders.
**How to avoid:** The `/api/projects` response already includes `riskLevel` per project (added in Phase 8). Use that for dot color. Only call per-project endpoint when user clicks to expand findings.
**Warning signs:** Network tab showing 30+ health-check requests on page load.

### Pitfall 2: Split Dot Without Copy Data
**What goes wrong:** Rendering a split dot based only on `riskLevel` without checking for actual diverged copies.
**Why it happens:** `riskLevel: "critical"` could mean unpushed commits OR diverged copies -- the dot should only split for divergence.
**How to avoid:** Split dot requires both `copyCount > 1` from the project list response AND a `diverged_copies` finding from `/api/health-checks/:slug`. Since we want to avoid N+1 calls, the simpler approach: add `hasDivergedCopies` boolean to the project list response on the API side, OR check if any project finding in the risks response has `checkType === "diverged_copies"` for that slug (the `/api/risks` response already lists all findings).
**Warning signs:** Split dots appearing on single-copy projects.

### Pitfall 3: Heatmap Data vs Timeline Data Shape
**What goes wrong:** Reusing `useHeatmap` hook for the sprint timeline.
**Why it happens:** Both show project commit data over 12 weeks, seems like same data.
**How to avoid:** The timeline uses a DIFFERENT endpoint (`/api/sprint-timeline`) that returns pre-computed segments with density values, focused project, and window metadata. Don't transform heatmap data on the frontend -- use the purpose-built endpoint.
**Warning signs:** Frontend computing segments instead of the backend.

### Pitfall 4: SVG Coordinate Math for Timeline
**What goes wrong:** Date-to-pixel mapping errors causing segments to overflow or misalign.
**Why it happens:** 84 days (12 weeks) mapped to container width requires careful calculation.
**How to avoid:** Use a consistent coordinate system: container width divided by `windowDays` gives pixels per day. Segment `startDate` and `endDate` are dates -- convert to day offset from window start. Use `useMemo` for the mapping to avoid recalculation on every render.
**Warning signs:** Segments bleeding outside container, gaps between segments that should be continuous.

### Pitfall 5: Stale Risk Data After SSE Event
**What goes wrong:** Risk feed shows stale data after `health:changed` event because the refetch hasn't completed.
**Why it happens:** SSE event fires, sets `fetchCounter`, but the async fetch takes time.
**How to avoid:** The `fetchCounter` pattern already handles this correctly -- it triggers a new fetch. Just ensure `onHealthChanged` in the `useSSE` call triggers `refetchRisks()`. Don't add optimistic UI removal of cards.
**Warning signs:** Cards flickering or showing intermediate states.

### Pitfall 6: Action Hint Command Accuracy
**What goes wrong:** Hardcoding `git push origin main` when the project might use a different branch or remote.
**Why it happens:** Quick implementation without checking finding metadata.
**How to avoid:** The health finding `metadata` contains the specifics (branch name, remote, etc.). Build action hint commands from metadata, with sensible defaults. Map: `unpushed_commits` -> `git push origin {branch}`, `no_remote` -> `git remote add origin <url>`, `broken_tracking` -> `git branch -u origin/{branch}`, `unpulled_commits` -> `git pull`, `dirty_working_tree` -> `git stash` or `git commit`, `diverged_copies` -> `git pull` (on the behind copy).
**Warning signs:** Users copying commands that fail because branch/remote is wrong.

## Code Examples

Verified patterns from the existing codebase:

### Severity Color Constants (warm palette)
```typescript
// Source: app.css @theme tokens + CONTEXT.md color decisions
// These map to existing Tailwind v4 theme tokens
const SEVERITY_COLORS = {
  critical: {
    text: "text-rust",
    bg: "bg-rust/10 dark:bg-rust/15",
    border: "border-rust/20",
    dot: "bg-rust",
    icon: "text-rust",
  },
  warning: {
    text: "text-gold-status",
    bg: "bg-gold-status/10 dark:bg-gold-status/15",
    border: "border-gold-status/20",
    dot: "bg-gold-status",
    icon: "text-gold-status",
  },
  healthy: {
    text: "text-sage",
    bg: "bg-sage/10 dark:bg-sage/15",
    border: "border-sage/20",
    dot: "bg-sage",
    icon: "text-sage",
  },
} as const;
```

### Existing ProjectItem Shape (from grouping.ts)
```typescript
// Source: packages/web/src/lib/grouping.ts
// Phase 8 added healthScore, riskLevel, copyCount to API response
// ProjectItem interface needs extending:
export interface ProjectItem {
  // ...existing fields...
  healthScore: number | null;
  riskLevel: "healthy" | "warning" | "critical" | "unmonitored";
  copyCount: number;
}
```

### Risk API Response Shape
```typescript
// Source: packages/shared/src/schemas/health.ts (risksResponseSchema)
// GET /api/risks returns:
interface RisksResponse {
  critical: HealthFindingWithNew[];
  warning: HealthFindingWithNew[];
  riskCount: number;
  summary: string;
}

interface HealthFindingWithNew {
  id: number;
  projectSlug: string;
  checkType: string;
  severity: "info" | "warning" | "critical";
  detail: string;
  metadata: Record<string, unknown> | null;
  detectedAt: string;
  resolvedAt: string | null;
  isNew: boolean;
}
```

### Sprint Timeline API Response Shape
```typescript
// Source: packages/api/src/routes/sprint-timeline.ts
// GET /api/sprint-timeline returns:
interface SprintTimelineResponse {
  projects: Array<{
    slug: string;
    segments: Array<{
      startDate: string;
      endDate: string;
      commits: number;
      density: number; // 0-1, normalized per project
    }>;
    totalCommits: number;
  }>;
  focusedProject: string | null;
  windowDays: number; // 84 for 12 weeks
}
```

### Layout Integration Point
```typescript
// Source: packages/web/src/App.tsx current layout order
// Current: Capture → Heatmap → Hero → Departure Board → Loose Thoughts
// Target:  Capture → Risk Feed → Sprint Timeline → Hero → Departure Board → Loose Thoughts
//
// Changes in App.tsx:
// 1. Replace <SprintHeatmap> with <SprintTimeline>
// 2. Add <RiskFeed> between CaptureField and SprintTimeline
// 3. Add useRisks() and useSprintTimeline() hooks
// 4. Wire onHealthChanged SSE to refetch risks + timeline
// 5. Add document.title effect for riskCount
// 6. Pass healthScore/riskLevel/copyCount through to ProjectRow
```

### Action Hint Command Map
```typescript
// Derived from health check types and the design spec
const ACTION_COMMANDS: Record<string, (metadata: Record<string, unknown> | null) => string> = {
  unpushed_commits: (m) => `git push origin ${m?.branch ?? "main"}`,
  no_remote: () => "git remote add origin <url>",
  broken_tracking: (m) => `git branch -u origin/${m?.branch ?? "main"}`,
  remote_branch_gone: (m) => `git checkout -b ${m?.branch ?? "main"} && git push -u origin ${m?.branch ?? "main"}`,
  unpulled_commits: () => "git pull",
  dirty_working_tree: () => "git stash",
  diverged_copies: () => "git pull --rebase",
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GitHub-style contribution heatmap | Horizontal swimlane timeline | Phase 9 (now) | Better pattern visibility for serial sprint workflow |
| No health indicators on project cards | Green/amber/red dots with expandable findings | Phase 9 (now) | Glanceable risk awareness per project |
| No risk surface | Risk feed above departure board | Phase 9 (now) | Critical issues visible without clicking |
| Static page title | Dynamic `(N) Mission Control` with risk count | Phase 8/9 (now) | Browser tab shows risk awareness |

**Deprecated/outdated:**
- `SprintHeatmap` component: Still exists in `components/heatmap/`, no longer rendered in layout. Keep files (heatmap API not removed).
- `useHeatmap` hook: Still exists, no longer called from `App.tsx`. Could be removed later.

## Open Questions

1. **Split dot detection without N+1 calls**
   - What we know: `/api/projects` returns `copyCount` and `riskLevel`. `/api/risks` returns all findings including `diverged_copies` type.
   - What's unclear: Whether to check the risks response for `diverged_copies` findings per slug, or add a flag to the projects response.
   - Recommendation: Use the risks response. The risk feed already fetches all findings. Pass a `Set<string>` of slugs with diverged findings down to the departure board. Zero additional API calls.

2. **Timeline tooltip implementation**
   - What we know: Design requires hover tooltip showing commit count + date range.
   - What's unclear: Whether to use CSS-only tooltip, absolute-positioned div with mouse tracking, or `title` attribute.
   - Recommendation: Use an absolute-positioned div that appears on `onMouseEnter` with segment data. `title` attributes are ugly and unstyled. CSS-only tooltips can't position dynamically for SVG elements. Keep it lightweight: a small `useState` for `hoveredSegment`, render tooltip near the cursor via `onMouseMove`.

3. **Timeline bar rendering: SVG vs CSS divs**
   - What we know: Decision says "custom SVG/CSS rendering." Heatmap used CSS divs with flex layout.
   - What's unclear: Whether SVG or CSS divs are better for the horizontal bar segments.
   - Recommendation: Use CSS divs with `position: relative` container and `position: absolute` segments. This is simpler than SVG for horizontal bars, works with Tailwind classes directly, and follows the heatmap precedent. SVG adds complexity (viewBox, coordinate transforms) for no benefit in a horizontal bar chart.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.0 + @testing-library/react 16.3.2 |
| Config file | `packages/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/web test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RISK-01 | Risk feed renders with severity-grouped cards | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/risk-feed.test.tsx` | Wave 0 |
| RISK-02 | Risk card shows severity, project, problem, duration, action | unit | Same as above | Wave 0 |
| RISK-03 | Cards not dismissable (no dismiss button renders) | unit | Same as above | Wave 0 |
| TMLN-01 | Timeline renders horizontal bars from segment data | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/sprint-timeline.test.tsx` | Wave 0 |
| TMLN-02 | Focused project gets full saturation class | unit | Same as above | Wave 0 |
| TMLN-03 | Hover shows tooltip; click calls onSelect | unit | Same as above | Wave 0 |
| HDOT-01 | Health dot renders correct color for risk level | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/health-dot.test.tsx` | Wave 0 |
| HDOT-02 | Split dot renders for diverged multi-copy projects | unit | Same as above | Wave 0 |
| HDOT-03 | Click expands findings panel with finding details | unit | Same as above | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/web test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/components/risk-feed.test.tsx` -- covers RISK-01, RISK-02, RISK-03
- [ ] `src/__tests__/components/sprint-timeline.test.tsx` -- covers TMLN-01, TMLN-02, TMLN-03
- [ ] `src/__tests__/components/health-dot.test.tsx` -- covers HDOT-01, HDOT-02, HDOT-03
- [ ] `src/__tests__/lib/health-colors.test.ts` -- covers severity-to-color mapping consistency

## Sources

### Primary (HIGH confidence)
- Existing codebase: `packages/api/src/routes/risks.ts`, `sprint-timeline.ts`, `health-checks.ts` -- API response shapes
- Existing codebase: `packages/shared/src/schemas/health.ts` -- Zod schemas for all health types
- Existing codebase: `packages/web/src/App.tsx` -- current layout and data flow
- Existing codebase: `packages/web/src/components/departure-board/project-row.tsx` -- component to extend
- Existing codebase: `packages/web/src/components/departure-board/previously-on.tsx` -- expand pattern to reuse
- Existing codebase: `packages/web/src/hooks/use-sse.ts` -- SSE with `health:changed` already wired
- Design spec: `docs/superpowers/specs/2026-03-14-git-health-intelligence-design.md` -- Section 3

### Secondary (MEDIUM confidence)
- Clipboard API (`navigator.clipboard.writeText()`) -- standard Web API, universally supported in modern browsers

### Tertiary (LOW confidence)
- None -- this phase is fully constrained by existing code and locked decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing
- Architecture: HIGH -- follows established patterns exactly (fetchCounter hooks, PreviouslyOn expand, CSS transitions)
- Pitfalls: HIGH -- derived from actual codebase analysis (N+1 pattern visible in projects route, split dot data flow verified)
- Component structure: HIGH -- natural domain decomposition following existing `components/{domain}/` convention

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable -- no external dependencies to drift)
