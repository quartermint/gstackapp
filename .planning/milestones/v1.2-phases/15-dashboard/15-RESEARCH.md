# Phase 15: Dashboard Session Views - Research

**Researched:** 2026-03-16
**Domain:** React dashboard components, SSE integration, data visualization
**Confidence:** HIGH

## Summary

Phase 15 is a frontend-only phase that adds session awareness, budget visualization, and conflict alerts to the existing Mission Control dashboard. All API endpoints are already built and tested (Phase 11-14). All SSE event types are wired server-side. The frontend already has the `session:conflict` handler in `use-sse.ts`. This phase creates new React components and hooks that consume `GET /api/sessions?status=active`, `GET /api/budget`, and existing risk feed data.

The existing codebase has extremely consistent patterns: hooks use the `fetchCounter + refetch` pattern or direct polling, components follow the warm-palette design system (sage/gold/rust), and the dashboard layout in `App.tsx` stacks sections in a predictable order. The SSE hook (`use-sse.ts`) already handles `session:conflict` and has event handler scaffolding that just needs `session:started` and `session:ended` listeners added. No new dependencies are needed.

**Primary recommendation:** Build three new hooks (`use-sessions`, `use-budget`, `use-session-counts`), three new component groups (sessions indicator, budget widget, session badge on project cards), and extend the existing SSE hook and App.tsx wiring. Follow the existing patterns exactly -- the codebase is consistent enough that deviation would be the primary risk.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sessions panel: header bar compact indicator ("3 active") with expandable dropdown panel, following health dot pattern
- Budget widget: compact dashboard widget showing session counts + burn rate indicator (no dollars)
- Burn rate uses color: sage (low) -> gold (moderate) -> rust (hot) -- matches existing warm severity palette
- Conflict alert cards: appear in existing risk feed section with session type badge icon, same severity card component
- Session badges on project cards: "2 active" badge, small, non-intrusive, similar to health dots
- SSE integration: new handlers `onSessionStarted`, `onSessionStopped` in use-sse.ts, TanStack Query invalidation on session events
- No polling for sessions -- purely SSE-driven updates

### Claude's Discretion
- Sessions panel: exact placement in header (recommended: near health dot area with expandable dropdown)
- Final placement determined during planning based on layout analysis

### Deferred Ideas (OUT OF SCOPE)
- Session replay/timeline visualization -- v1.3
- Budget drill-down by project -- v1.3
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Active sessions panel with live feed -- project name, tool icon, model tier badge, elapsed time | New `use-sessions` hook fetching `GET /api/sessions?status=active`, new `SessionsIndicator` component in header with dropdown panel. Session schema already has `source` (tool icon), `tier` (model badge), `startedAt` (elapsed time), `projectSlug` (project name). |
| DASH-02 | Budget widget showing weekly tier usage and burn rate indicator | New `use-budget` hook fetching `GET /api/budget`, new `BudgetWidget` component. Budget API returns `{ budget: { opus, sonnet, local, unknown, burnRate }, suggestion }`. Burn rate maps to sage/gold/rust colors. |
| DASH-03 | Conflict alert cards when file overlap detected across sessions | Already partially wired -- risk feed renders `session_file_conflict` findings with "sessions" badge. SSE `session:conflict` handler exists. May need `refetchRisks()` on session conflict to ensure risk feed updates. Already working from Phase 14. |
| DASH-04 | Session count badges on departure board project cards ("2 active") | New `use-session-counts` hook (or extend `use-sessions` to provide per-project counts), add `sessionCount` prop to `ProjectRow` component, render badge similar to capture count badge. |
| DASH-05 | SSE-driven updates for session lifecycle events (started/stopped/conflict) | Extend `use-sse.ts` with `onSessionStarted` and `onSessionStopped` handlers. Wire in App.tsx to invalidate sessions/budget/project data. `session:conflict` already handled. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Already in use |
| Hono RPC client | 4.6+ | Type-safe API calls via `client.api.sessions.$get()` | Already in use for all hooks |
| Tailwind CSS | 4.x | Styling with warm palette tokens | Already configured with custom theme |
| Vitest | 2.1+ | Testing framework | Already configured with jsdom |
| @testing-library/react | 16.3+ | Component testing | Already in use |

### Supporting (Already Available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @mission-control/shared | workspace | Session/Budget Zod schemas and TypeScript types | Import `Session`, `WeeklyBudget`, `BurnRate`, `ModelTier` types |
| @mission-control/api | workspace | AppType for Hono RPC type inference | Already referenced by `client.ts` |

### No New Dependencies
This phase requires zero new npm packages. All functionality is built with existing React, Hono client, Tailwind, and Vitest.

## Architecture Patterns

### Recommended New File Structure
```
packages/web/src/
  components/
    sessions/
      sessions-indicator.tsx    # Header compact indicator + dropdown
      session-card.tsx          # Single session row in dropdown
      budget-widget.tsx         # Burn rate + tier counts display
      session-badge.tsx         # "2 active" badge for project cards
  hooks/
    use-sessions.ts             # Fetch active sessions list
    use-budget.ts               # Fetch weekly budget data
    use-session-counts.ts       # Per-project active session counts
  __tests__/
    components/
      sessions-indicator.test.tsx
      budget-widget.test.tsx
      session-badge.test.tsx
    hooks/
      (optional -- hooks are thin wrappers)
```

### Pattern 1: Hook with fetchCounter for SSE-driven Refetch
**What:** All data hooks use `useState<number>(0)` as fetchCounter, `useEffect` watching it, and expose `refetch()` that increments it.
**When to use:** Every new hook in this phase.
**Example (from existing use-risks.ts):**
```typescript
export function useSessions(): {
  sessions: SessionItem[];
  loading: boolean;
  refetch: () => void;
} {
  const [data, setData] = useState<SessionItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchSessions() {
      setLoading(true);
      try {
        const res = await client.api.sessions.$get({
          query: { status: "active" },
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json.sessions as unknown as SessionItem[]);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch sessions:", err);
        if (!cancelled) { setData(null); setLoading(false); }
      }
    }
    fetchSessions();
    return () => { cancelled = true; };
  }, [fetchCounter]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return { sessions: data ?? [], loading, refetch };
}
```

### Pattern 2: SSE Event Handler Wiring in App.tsx
**What:** SSE events trigger `refetch()` calls on relevant hooks, not direct state mutations.
**When to use:** For `session:started`, `session:ended` events.
**Example (from existing App.tsx):**
```typescript
useSSE({
  // ... existing handlers ...
  onSessionStarted: () => {
    refetchSessions();
    refetchBudget();
    refetchSessionCounts();
  },
  onSessionStopped: () => {
    refetchSessions();
    refetchBudget();
    refetchSessionCounts();
  },
  onSessionConflict: () => {
    refetchRisks();
  },
});
```

### Pattern 3: Header Dropdown Panel (Health Panel Pattern)
**What:** Compact indicator in header that expands to a positioned panel on click. Panel dismisses on click-outside or Escape.
**When to use:** The sessions indicator follows this pattern exactly (like HealthPanel).
**Key implementation details:**
- `useRef` for panel DOM node
- `useEffect` for click-outside detection (with `setTimeout(0)` delay to avoid triggering click)
- `useEffect` for Escape key handler
- `absolute top-full left-0 mt-1` positioning relative to header button
- z-index 50 for overlay

### Pattern 4: Badge in Project Row
**What:** Small pill badge rendered inline with other indicators in the project row's flex layout.
**When to use:** Session count badge on project cards.
**Example (from existing capture count badge in project-row.tsx):**
```typescript
{captureCount != null && captureCount > 0 && (
  <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-full bg-terracotta/12 text-terracotta text-[10px] font-semibold shrink-0">
    {captureCount}
  </span>
)}
```
Session badge should use a different color (e.g., blue or sage) to differentiate from capture count.

### Anti-Patterns to Avoid
- **Do NOT use TanStack Query:** The codebase does not use TanStack Query despite CONTEXT.md mentioning it. All hooks use the vanilla `useState + useEffect + fetchCounter` pattern. Match this.
- **Do NOT use polling for session data:** SSE events drive refetches. No `setInterval`.
- **Do NOT add the sessions panel as a new top-level route or page section:** It is a header-level indicator with dropdown, not a dashboard section.
- **Do NOT modify API routes:** All API endpoints are complete and tested. This is frontend-only.
- **Do NOT import from @mission-control/shared at runtime in web:** The web package imports types only from shared (via `as unknown as` casts on API responses). Follow the same pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Elapsed time display | Custom timer with `setInterval` | `formatRelativeTime()` from `lib/time.ts` | Already handles all units, uses Intl.RelativeTimeFormat |
| Color mapping for severity | Custom color logic | `SEVERITY_COLORS` from `lib/health-colors.ts` | Consistent warm palette, already used everywhere |
| API type casting | Manual type definitions | `as unknown as SessionItem` pattern | Matches every existing hook, Hono RPC returns generic JSON |
| Click-outside dismissal | Custom hook | Copy HealthPanel pattern directly | Proven pattern with setTimeout(0) edge case handled |
| Session conflict cards | New card component | Existing `RiskCard` component | Conflicts already render as risk findings with `type: "session"` metadata badge |

**Key insight:** Phase 14 already wired conflict findings into the risk feed. RiskCard already renders a "sessions" badge when `metadata.type === "session"`. DASH-03 is largely complete -- just needs SSE refetch verification.

## Common Pitfalls

### Pitfall 1: Stale Closures in SSE Handler
**What goes wrong:** SSE handler references stale `refetch` functions.
**Why it happens:** useSSE stores options in a ref but the ref needs to stay in sync.
**How to avoid:** useSSE already handles this with `optionsRef.current` pattern. Just pass callbacks -- they'll be read from the ref at call time.
**Warning signs:** Refetch doesn't fire after SSE event.

### Pitfall 2: Hono RPC Type Chain Breakage
**What goes wrong:** Adding a new `.route()` call could break the TypeScript type chain.
**Why it happens:** Hono RPC relies on chained route registration for type inference. Too many chains can hit TS depth limits.
**How to avoid:** This phase does NOT add API routes. The 16 route groups are stable per Phase 13 decisions. No risk here.
**Warning signs:** N/A for this phase.

### Pitfall 3: Missing SSE Event Types on use-sse.ts
**What goes wrong:** `session:started` and `session:ended` events are emitted server-side but the SSE hook only listens for `session:conflict`.
**Why it happens:** Phase 14 only added the conflict listener. The started/ended listeners were deferred to Phase 15.
**How to avoid:** Add `addEventListener("session:started", ...)` and `addEventListener("session:ended", ...)` to the useSSE hook, following the exact same pattern as existing listeners.
**Warning signs:** Session panel doesn't update in real-time.

### Pitfall 4: Elapsed Time Calculation
**What goes wrong:** Using `startedAt` directly with `formatRelativeTime` shows "5 minutes ago" instead of "5m".
**Why it happens:** `formatRelativeTime` returns "X minutes ago" format via Intl.RelativeTimeFormat, which is correct for timestamps but may read oddly for "elapsed time" context.
**How to avoid:** For elapsed time display, either use `formatRelativeTime` as-is (it says "5 minutes ago" which implies the session started 5 min ago) or create a simple duration formatter. The CONTEXT.md says "elapsed time" so a compact format like "5m" or "1h 23m" may be preferred. Small utility function in `lib/time.ts`.
**Warning signs:** "started 5 minutes ago" vs "5m" -- style decision.

### Pitfall 5: Session Count Badge Prop Threading
**What goes wrong:** Session counts need to flow from App.tsx through DepartureBoard -> ProjectGroup -> ProjectRow.
**Why it happens:** Same pattern as `captureCounts` prop which is already threaded through all three layers.
**How to avoid:** Follow the exact `captureCounts?: Record<string, number>` pattern. Add `sessionCounts?: Record<string, number>` alongside it at each level.
**Warning signs:** Undefined counts, badge not rendering.

### Pitfall 6: Budget API Response Shape
**What goes wrong:** Assuming budget endpoint returns a flat object.
**Why it happens:** The budget endpoint returns `{ budget: WeeklyBudget, suggestion: RoutingSuggestion | null }` -- a nested shape.
**How to avoid:** Access `data.budget.opus`, `data.budget.burnRate`, etc. Not `data.opus`.
**Warning signs:** Undefined values in budget widget.

## Code Examples

### Active Sessions Hook
```typescript
// Source: Follows use-risks.ts pattern exactly
import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client.js";

export interface SessionItem {
  id: string;
  source: "claude-code" | "aider";
  model: string | null;
  tier: "opus" | "sonnet" | "local" | "unknown";
  projectSlug: string | null;
  cwd: string;
  status: string;
  startedAt: string;
  lastHeartbeatAt: string | null;
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      setLoading(true);
      try {
        const res = await client.api.sessions.$get({ query: { status: "active" } });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setSessions(json.sessions as unknown as SessionItem[]);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setSessions([]); setLoading(false); }
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [fetchCounter]);

  const refetch = useCallback(() => setFetchCounter((c) => c + 1), []);
  return { sessions, loading, refetch };
}
```

### Budget Hook
```typescript
// Source: Follows use-lm-studio.ts pattern
import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client.js";

export type BurnRate = "low" | "moderate" | "hot";

export interface BudgetData {
  opus: number;
  sonnet: number;
  local: number;
  unknown: number;
  burnRate: BurnRate;
  weekStart: string;
}

export interface BudgetSuggestion {
  suggestedTier: string | null;
  reason: string;
  localAvailable: boolean;
}

export function useBudget() {
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [suggestion, setSuggestion] = useState<BudgetSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      try {
        const res = await client.api.budget.$get();
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setBudget(json.budget as unknown as BudgetData);
          setSuggestion(json.suggestion as unknown as BudgetSuggestion);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setBudget(null); setLoading(false); }
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [fetchCounter]);

  const refetch = useCallback(() => setFetchCounter((c) => c + 1), []);
  return { budget, suggestion, loading, refetch };
}
```

### SSE Extension (use-sse.ts additions)
```typescript
// Add to SSEOptions interface:
onSessionStarted?: (id: string) => void;
onSessionStopped?: (id: string) => void;

// Add inside connect() function, after existing listeners:
eventSource.addEventListener("session:started", (e: MessageEvent) => {
  try {
    const data = JSON.parse(e.data) as { type: string; id: string };
    optionsRef.current.onSessionStarted?.(data.id);
  } catch {
    // Ignore malformed events
  }
});

eventSource.addEventListener("session:ended", (e: MessageEvent) => {
  try {
    const data = JSON.parse(e.data) as { type: string; id: string };
    optionsRef.current.onSessionStopped?.(data.id);
  } catch {
    // Ignore malformed events
  }
});
```

### Burn Rate Color Mapping
```typescript
// Consistent with CONTEXT.md decision: sage (low), gold (moderate), rust (hot)
const BURN_RATE_COLORS: Record<BurnRate, { bg: string; text: string; dot: string }> = {
  low: { bg: "bg-sage/10", text: "text-sage", dot: "bg-sage" },
  moderate: { bg: "bg-gold-status/10", text: "text-gold-status", dot: "bg-gold-status" },
  hot: { bg: "bg-rust/10", text: "text-rust", dot: "bg-rust" },
};
```

### Tool Icon for Source Type
```typescript
// Source icons: Claude Code = terminal/code icon, Aider = git icon
function ToolIcon({ source }: { source: "claude-code" | "aider" }) {
  if (source === "aider") {
    return (
      <svg className="w-3.5 h-3.5 text-text-muted dark:text-text-muted-dark shrink-0" /* git branch icon */>
        {/* ... */}
      </svg>
    );
  }
  // Default: Claude Code terminal icon
  return (
    <svg className="w-3.5 h-3.5 text-text-muted dark:text-text-muted-dark shrink-0" /* terminal icon */>
      {/* ... */}
    </svg>
  );
}
```

### Model Tier Badge
```typescript
// Consistent with existing badge patterns (GsdBadge, HostBadge)
const TIER_BADGE_COLORS: Record<string, string> = {
  opus: "bg-terracotta/12 text-terracotta",
  sonnet: "bg-amber-warm/12 text-amber-warm",
  local: "bg-sage/12 text-sage",
  unknown: "bg-text-muted/12 text-text-muted dark:text-text-muted-dark",
};

function TierBadge({ tier }: { tier: string }) {
  const colors = TIER_BADGE_COLORS[tier] ?? TIER_BADGE_COLORS.unknown;
  return (
    <span className={`text-[9px] uppercase font-semibold rounded px-1 leading-tight ${colors}`}>
      {tier}
    </span>
  );
}
```

### Session Count Per-Project Derivation
```typescript
// Derive from active sessions list -- no separate API call needed
function deriveSessionCounts(sessions: SessionItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.projectSlug) {
      counts[s.projectSlug] = (counts[s.projectSlug] ?? 0) + 1;
    }
  }
  return counts;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TanStack Query for data fetching | useState + useEffect + fetchCounter | v1.0 | All hooks use this pattern -- do not introduce TanStack Query |
| WebSocket for real-time | SSE via EventSource | v1.0 decision | SSE is simpler, already established |
| Polling for updates | SSE-driven refetch | v1.0 | No setInterval in any hook except useHealth (30s poll) and useLmStudio (30s poll) |

**Deprecated/outdated:**
- CONTEXT.md mentions "TanStack Query invalidation" but the codebase does NOT use TanStack Query. Use the fetchCounter/refetch pattern instead.

## Open Questions

1. **Elapsed Time Format**
   - What we know: `formatRelativeTime()` returns "5 minutes ago" style strings
   - What's unclear: Whether "elapsed time" should be compact ("5m") or relative ("5 minutes ago")
   - Recommendation: Add a `formatElapsedTime(isoDate)` helper to `lib/time.ts` that returns compact format like "5m", "1h 23m". This is more natural for "running for X time" context than "started 5 minutes ago".

2. **Sessions Panel Position in Header**
   - What we know: CONTEXT.md says "near health dot area" with expandable dropdown
   - What's unclear: Left side (near health dot) or right side (near triage badge)
   - Recommendation: Place after the health dot, before the nav pills. This groups system indicators (health + sessions) on the left, actions (nav, triage, theme) on the right.

3. **Budget Widget Placement**
   - What we know: "Compact -- similar density to health dot area or as part of sessions panel"
   - What's unclear: Standalone section in dashboard or embedded in sessions dropdown
   - Recommendation: Embed budget summary in the sessions dropdown panel (as a compact row at bottom), keeping the header indicator focused on session count. Budget data is contextual to sessions, not a standalone concern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1+ with jsdom environment |
| Config file | `packages/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/web test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Sessions panel renders active sessions with project name, tool icon, tier badge, elapsed time | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/sessions-indicator.test.tsx` | Wave 0 |
| DASH-02 | Budget widget renders tier counts and burn rate with correct colors | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/budget-widget.test.tsx` | Wave 0 |
| DASH-03 | Conflict alerts appear in risk feed with session badge | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/risk-feed.test.tsx` | Existing (extend) |
| DASH-04 | Session count badges render on project cards | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/components/session-badge.test.tsx` | Wave 0 |
| DASH-05 | SSE handlers trigger refetch for session events | unit | `pnpm --filter @mission-control/web test -- --run src/__tests__/hooks/use-sse.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/web test`
- **Per wave merge:** `pnpm test` (all packages)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/web/src/__tests__/components/sessions-indicator.test.tsx` -- covers DASH-01
- [ ] `packages/web/src/__tests__/components/budget-widget.test.tsx` -- covers DASH-02
- [ ] `packages/web/src/__tests__/components/session-badge.test.tsx` -- covers DASH-04
- [ ] Extend `packages/web/src/__tests__/components/risk-feed.test.tsx` -- covers DASH-03 (session conflict card rendering)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/web/src/hooks/use-sse.ts` -- existing SSE pattern with event listeners
- Codebase analysis: `packages/web/src/hooks/use-risks.ts` -- fetchCounter/refetch hook pattern
- Codebase analysis: `packages/web/src/components/health/health-panel.tsx` -- dropdown panel pattern
- Codebase analysis: `packages/web/src/components/risk-feed/risk-card.tsx` -- session conflict card with badge
- Codebase analysis: `packages/web/src/components/departure-board/project-row.tsx` -- badge rendering pattern
- Codebase analysis: `packages/api/src/routes/sessions.ts` -- GET /api/sessions response shape
- Codebase analysis: `packages/api/src/routes/budget.ts` -- GET /api/budget response shape
- Codebase analysis: `packages/shared/src/schemas/session.ts` -- Session, SessionResponse types
- Codebase analysis: `packages/shared/src/schemas/budget.ts` -- WeeklyBudget, BurnRate types
- Codebase analysis: `packages/api/src/services/event-bus.ts` -- MCEventType includes session:started, session:ended, session:conflict

### Secondary (MEDIUM confidence)
- None needed -- all research is based on direct codebase analysis

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use
- Architecture: HIGH -- patterns directly observed in existing code, zero ambiguity
- Pitfalls: HIGH -- identified from codebase analysis and prior phase decisions in STATE.md

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable -- no external dependencies to track)
