# Phase 3: Capture Pipeline - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Zero-friction text capture with AI categorization, command palette (Cmd+K), keyboard shortcuts, and captures woven into project cards. User dumps a raw thought into Mission Control from the dashboard and sees it appear on the right project card, categorized by AI. Covers CAPT-01 through CAPT-09 and INTR-01 through INTR-03.

Not in scope: CLI capture, iOS capture, voice capture, MCP integration, semantic/vector search. Those are future phases or v2.

</domain>

<decisions>
## Implementation Decisions

### Capture entry point
- Always-visible text field at the top of the dashboard, above the hero card
- Single-line input that grows to 3-4 lines max as user types past one line
- Enter submits, Shift+Enter for newline
- After submit: field does NOT clear — cursor stays, ready for the next thought (rapid-fire stacking)
- Placeholder: "What's on your mind..." or similar low-friction prompt

### Link capture behavior
- Auto-detect URLs in capture input
- Extract title and description in the background (async, like all enrichment)
- Display as rich link card on project card (title, domain, snippet)
- Raw URL preserved if metadata extraction fails — never lose the input

### Command palette (Cmd+K)
- Multi-purpose Spotlight-style overlay
- Default mode: capture (type and Enter to capture)
- Prefix-based mode switching: '/' for commands/navigation, '?' for search
- When opened with no input: show 5 recent projects and 3 recent captures as quick-jump suggestions
- Esc to close
- Captures submitted through palette behave identically to the always-visible field

### Keyboard shortcuts
- Minimal set for v1: Cmd+K (palette), '/' (focus capture field), Esc (close palette/blur field)
- More shortcuts added later based on usage — don't over-engineer

### AI categorization UX
- Quiet assignment — capture appears on matched project card with no confidence score visible
- If AI isn't confident enough (below threshold), capture goes to "loose thoughts" instead
- No confirmation step — trust the system, correct when wrong
- Correction flow: each capture card has a subtle project badge; click badge to get dropdown of all projects; select correct one or "Unlink" to move to loose thoughts

### Loose thoughts
- Section below the departure board, labeled "Loose Thoughts"
- Separate from project groups but on the same main page
- Visible but not competing with project status — smaller visual treatment

### Stale capture triage
- Periodic triage session model (not inline nudges)
- Dashboard shows a badge count for captures older than 2 weeks
- Clicking badge opens a focused triage view — one capture at a time
- Actions per capture: act (link to project/create action), archive (leave cards, stay searchable), dismiss (delete)
- Deliberate flow, not ambient — user opts in to triage when ready

### Captures on project cards
- Claude's discretion on exact presentation
- Key constraint: captures are woven INTO project cards, not a separate inbox (CAPT-04)
- Must be lightweight enough to not clutter the departure board's "smarter in 3 seconds" density

### Claude's Discretion
- How captures appear on project cards (inline list, expandable section, count badge with expand)
- AI confidence threshold for project assignment vs "loose thoughts"
- AI model/provider selection for categorization
- Link metadata extraction approach (server-side scraping, unfurl service, etc.)
- Triage view design details
- Command palette animation/transition style
- How "recent projects + captures" suggestions are ranked in palette

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/api/src/routes/captures.ts`: Full CRUD API already built (create, list, get, update, delete)
- `packages/api/src/db/schema.ts`: Capture schema with status lifecycle (raw → pending_enrichment → enriched → archived) and projectId linking
- `packages/shared/src/schemas/capture.ts`: Zod schemas for create/update/list with type enum (text/voice/link/image) and status enum
- `packages/api/src/routes/search.ts`: FTS5 search endpoint already works across captures
- `packages/api/src/db/queries/captures.ts`: Query functions with DI pattern (db as first param)
- `packages/web/src/hooks/use-projects.ts`: TanStack Query pattern for API fetching — reuse for captures
- `packages/web/src/hooks/use-theme.ts`: Theme hook with localStorage persistence — pattern for other preferences
- `packages/web/src/lib/time.ts`: Relative time formatting via Intl.RelativeTimeFormat
- `packages/web/src/lib/grouping.ts`: Activity grouping logic (Active/Idle/Stale thresholds)
- 11 UI components in `packages/web/src/components/` — departure board, hero card, badges, layout

### Established Patterns
- Zod schema-first: types derived from schemas via z.infer
- App factory pattern with DI for testability
- Vitest + jsdom for web tests, Vitest forks pool for API tests
- Tailwind v4 CSS-native @theme with warm color tokens locked
- ESM throughout, TypeScript strict mode
- useMemo for derived data, AbortController for fetch cancellation

### Integration Points
- Capture field submits to POST /api/captures (already exists)
- AI enrichment: new async service that reads raw captures and updates via PATCH /api/captures/:id
- Project list for dropdown: GET /api/projects (already exists)
- Search for palette: GET /api/search (already exists with FTS5)
- Captures per project: GET /api/captures?projectId=xxx (already exists)

</code_context>

<specifics>
## Specific Ideas

- Capture field behavior modeled after chat input — submit clears but cursor stays, ready for next thought
- Command palette has Spotlight/Raycast energy — one input, prefixes switch modes
- "Persist first, enrich later" is sacred — capture hits SQLite immediately, AI categorization is async background work
- Stale capture triage is a deliberate session, not ambient — user chooses when to deal with aging captures
- AI should be invisible when it works and easy to correct when it doesn't — quiet assignment, one-click correction

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-capture-pipeline*
*Context gathered: 2026-03-09*
