# Phase 21: Dashboard (Discoveries + Stars + Session Timeline) - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Dashboard UI for all v1.3 backend data: discovery badges, star browser, session timeline, convergence badge. Consumes APIs from Phases 17-20. All backend endpoints are stable before this phase runs.

</domain>

<decisions>
## Implementation Decisions

### Layout model — hybrid strip + sidebar
- **Persistent top strip**: compact horizontal bar above the departure board, always visible, zero scroll cost
- Strip contains badge indicators: "N discoveries · N stars · 1 convergence"
- Badges are clickable → expand into dropdown/popover with details and actions
- **Collapsible right sidebar**: for session timeline. Toggle on/off. Departure board keeps full width when sidebar closed.
- **Existing layout untouched**: departure board, hero card, risk feed, captures, sprint timeline all stay exactly as they are

### "What's New" section (top strip)
- Discoveries and stars mixed in one chronological feed inside the strip popovers
- Combined "What's New" model — not separate sections for discoveries vs stars
- Each item shows: type badge (discovery/star), name, brief detail, action buttons
- Discovery items: repo name, remote URL, last commit age → track/dismiss buttons
- Star items: repo name, intent badge (color-coded), language → override intent action
- Empty state: strip shows no badges when nothing new (doesn't take space)

### Star browser (popover)
- Click star badge → popover with all stars, grouped by intent category
- Popover has search/filter within it, internal scroll
- No dedicated star browser page — stars stay lightweight, never get more UI than the popover
- Stars are a signal, not a product

### Session timeline (right sidebar)
- Horizontal bars by time-of-day with project rows
- Color-coded by agent type (Claude Code = blue, Aider = warm)
- Toggle sidebar open/closed via button in header (near existing sessions indicator)
- Sidebar overlays content (doesn't push departure board narrower)

### Convergence badge
- Small indicator on project cards, similar to existing health dot
- Shows when convergence detected between parallel sessions
- Passive — no action button, just awareness
- Disappears when convergence condition resolves

### Claude's Discretion
- Exact popover component implementation (may reuse or create)
- Strip visual design (spacing, badge colors, typography)
- Sidebar width and animation
- Timeline bar sizing and time axis rendering
- Responsive behavior (strip stacks on mobile, sidebar hides)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dashboard patterns
- `packages/web/src/App.tsx` — Main layout, component composition, hook declarations
- `packages/web/src/components/departure-board/` — Project card patterns, health dot rendering
- `packages/web/src/components/risk-feed/` — Card-based feed pattern (reference for popover items)
- `packages/web/src/components/sessions/` — Existing sessions panel (reference for timeline)
- `packages/web/src/components/sprint-timeline/` — Existing timeline visualization (reference for session timeline)

### Styling
- `packages/web/src/app.css` — Tailwind v4 theme tokens, warm palette, custom variants
- `packages/web/src/components/ui/` — Shared UI components (loading-skeleton, host-badge, etc.)

### Data hooks
- `packages/web/src/hooks/` — Existing fetchCounter pattern, SSE listeners, useProjects/useCaptures

### API contracts
- Discovery routes (Phase 17) — list, promote, dismiss endpoints
- Star routes (Phase 19) — list, sync, update endpoints
- Session convergence endpoint (Phase 20)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Departure board project cards: health dot pattern for convergence badge
- Risk feed cards: compact card pattern for popover items
- Sprint timeline: horizontal bar rendering for session timeline
- Sessions panel: dropdown pattern for top strip popovers
- fetchCounter + SSE listener pattern for real-time updates

### Established Patterns
- useState + useEffect + fetchCounter for data fetching (not TanStack Query)
- SSE via EventSource with exponential backoff reconnection
- Tailwind v4 @theme tokens for warm palette (terracotta, sage, gold)
- Components export default, hooks use "use" prefix

### Integration Points
- Top strip is new component inserted above departure board in App.tsx
- Right sidebar is new component toggled from header
- Convergence badge integrates into existing project card health dot area
- New SSE event listeners for discovery:found, discovery:promoted, star:synced

</code_context>

<specifics>
## Specific Ideas

- Top strip should feel like a notification bar, not a full section — minimal height when nothing's new
- Popovers should feel like the command palette (Cmd+K) — clean, focused, disappear when done
- Session timeline should complement sprint timeline visually (similar bar style, different time scale)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-dashboard-discoveries-stars-session-timeline*
*Context gathered: 2026-03-16*
