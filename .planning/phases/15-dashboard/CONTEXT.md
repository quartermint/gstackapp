# Phase 15 Context: Dashboard

**Created:** 2026-03-16
**Phase Goal:** The dashboard surfaces live session awareness, budget status, and conflict alerts — making parallel coding sessions visible at a glance

## Decisions

### Sessions Panel Placement
- Claude's discretion — user deferred placement decision
- Recommendation: header bar compact indicator ("3 active") with expandable dropdown panel
  - Follows health dot pattern — minimal footprint, always visible, detail on click
  - Alternatively: conditional section between risk feed and departure board (like risk feed pattern)
- Final placement determined during planning based on layout analysis

### Budget Widget Placement
- Dashboard widget showing session counts + burn rate indicator (no dollars)
- Compact — similar density to health dot area or as part of sessions panel
- Burn rate uses color: sage (low) → gold (moderate) → rust (hot)
- Matches existing warm severity palette

### Conflict Alert Cards
- Appear in existing risk feed section with session type badge icon
- Same severity card component, warm palette
- Contain: project name, both session descriptions, conflicting file list
- SSE-driven — appear without page refresh

### Session Badges on Project Cards
- Departure board project cards show "2 active" badge when sessions are running
- Small, non-intrusive — similar to health dots on project cards
- Click could expand to show session details (or link to sessions panel)

### SSE Integration
- New event handlers in use-sse.ts: `onSessionStarted`, `onSessionStopped`, `onSessionConflict`
- TanStack Query invalidation on session events for sessions list and risk feed
- No polling — purely SSE-driven updates for all session UI

## Code Context

### Existing Patterns
- **Dashboard layout:** `components/layout/dashboard-layout.tsx` — header with health dot, triage badge
- **Risk feed:** `components/risk-feed/` — conditional section, severity cards
- **Health panel:** `components/health/health-panel.tsx` — expandable dropdown
- **Project cards:** `components/departure-board/` — project rows with health dots
- **SSE hook:** `hooks/use-sse.ts` — EventSource with per-event-type listeners
- **TanStack hooks:** `hooks/use-*.ts` — data fetching with invalidation

### New Files
- `packages/web/src/components/sessions/` — session panel, session card, budget widget
- `packages/web/src/hooks/use-sessions.ts` — TanStack hook for session data
- `packages/web/src/hooks/use-budget.ts` — TanStack hook for budget data

### Integration Points
- Dashboard layout: add sessions indicator to header or main column
- Risk feed: extend to render session conflict cards
- Departure board: add session count badge to project card component
- use-sse.ts: add session event handlers

## Deferred Ideas
- Session replay/timeline visualization — v1.3
- Budget drill-down by project — v1.3
