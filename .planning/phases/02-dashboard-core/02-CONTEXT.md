# Phase 2: Dashboard Core - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

User opens Mission Control in a browser and instantly sees all projects organized by activity — the "smarter in 3 seconds" moment. Departure board layout with project rows grouped by activity status, hero card for the selected project, responsive design, and distinctive visual identity. No capture, no search, no real-time updates — those are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Project grouping & departure board
- Three activity groups: Active (commit within 7 days), Idle (7-30 days), Stale (30+ days)
- Thresholds based on last commit timestamp from the project scanner API
- Within each group, sorted by most recent commit first — current sprint project always floats to top of Active
- Two-line rows: name + metadata (host badge, branch, time, dirty) on line 1, tagline on line 2
- Group headers always expanded — no collapsible sections. Departure boards don't hide information
- All groups visible on page load — user sees everything at a glance

### Hero card
- Positioned at top of page, above the departure board
- Shows last 3-5 commits as a vertical mini-timeline with relative timestamps
- GSD phase state shown as a small badge/tag if the project has `.planning/` (e.g., "Phase 2: Planning")
- Click any project row to swap hero card instantly — no animation, no confirmation
- Hero defaults to most recently active project on initial load
- No AI-generated narrative in Phase 2 — commit timeline is the "last context" for now (Phase 5 adds AI narratives)

### Visual identity & color system
- Both warm-light and warm-dark modes supported
- **Warm light is the default** — breaks the "every dev tool is dark" pattern. Distinctive and opinionated
- Toggle available to switch to warm dark mode
- Warm light: cream/parchment backgrounds, rich dark text
- Warm dark: charcoal-brown backgrounds (not pure black), warm cream text
- **Accent color: warm amber/terracotta** — earthy, distinctive
  - Primary accent: #d4713a (terracotta)
  - Highlight: #e8a04c (warm amber)
  - Active backgrounds: #fef3e2 (light) / #2d1f14 (dark)
  - Status colors: sage green (success), gold (warning), rust (dirty)
- System font stack — zero load time, native feel, let color and layout carry the personality
- Monospace (ui-monospace) for branch names, commit hashes, and code-like content

### Responsive layout
- Three breakpoints: mobile (<640px), tablet (640-1024px), desktop (>1024px)
- **Mobile** (quick glance): project name, last activity time, dirty indicator only. Taglines and branch badges hidden. Hero card condensed but present above the list. Tap row to swap hero
- **Tablet**: Full desktop layout, just narrower spacing. Everything visible — taglines, branches, badges
- **Desktop**: Full experience. Comfortable spacing, all metadata visible
- Primary mobile use case: quick glance at project status, not deep interaction

### Claude's Discretion
- Exact warm color palette values (the accent system is locked, background/text shades are flexible)
- Light/dark mode toggle implementation (CSS variables, class toggle, localStorage persistence)
- Loading skeleton or spinner design
- Empty state if no projects configured
- Exact spacing, padding, and layout proportions
- Host badge design (local vs mac-mini indicator)
- How relative times are formatted ("2 hours ago" vs "2h" vs "today")
- Component architecture (how to split into React components)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/web/src/App.tsx`: Working scaffold with fetch-based project list. Will be replaced/rebuilt but proves the data flow works
- `packages/shared/`: Zod schemas and TypeScript types for Project, Capture, API responses — use these for type-safe API calls
- `packages/api/src/routes/projects.ts`: Project list endpoint returns slug, name, tagline, branch, dirty, dirtyFiles, lastCommitMessage, lastCommitTime
- `packages/api/src/routes/projects.ts`: Project detail endpoint (`/projects/:slug`) returns full project with scan data

### Established Patterns
- Tailwind CSS for styling (already configured in web package)
- ESM throughout, TypeScript strict mode
- Hono RPC client (`hc`) available for type-safe API calls (set up in Phase 1, scaffold uses plain fetch as fallback)
- Zod schema-first: types derived from schemas via `z.infer`

### Integration Points
- API server on port 3000 — web dev server proxies to it
- Project data: `/api/projects` (list) and `/api/projects/:slug` (detail)
- Health check: `/api/health` — already shown as green dot in scaffold
- `pnpm dev` starts everything (Turborepo orchestrates API + web)

</code_context>

<specifics>
## Specific Ideas

- "Arc browser energy" — warm, opinionated, distinctive. Not dark-mode-by-default, not sterile white. The warm-light default IS the statement
- Departure board metaphor — dense, scannable rows with status groups. Think airport departure boards, not Kanban boards
- "Smarter in 3 seconds" — everything above the fold on desktop. No scrolling needed to get the overview
- The hero card is the "what was I doing?" moment — commit timeline answers that question immediately
- GSD badge on hero card gives project lifecycle context without needing to open a terminal

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-dashboard-core*
*Context gathered: 2026-03-09*
